// --- fixes applied: dedupe faces by content (hash), stable hashing, synced add/remove/clear ---
const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const mqtt = require("mqtt");
const args = require("minimist")(process.argv.slice(2));
const facesFile = path.resolve(__dirname, "faces.txt");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });


const roomsDir = path.resolve(__dirname, "../rooms");
const isMaster = !args.room;

if (isMaster) {
  const rooms = fs
    .readdirSync(roomsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"));
  console.log(`🧩🎥 Launching faceCAM sims for rooms: ${rooms.join(", ")}`);
  for (const room of rooms) fork(__filename, ["--room", room], { stdio: "inherit" });
  return;
}

// === Child mode ===
const room = args.room || "hallway";
const cfgPath = path.resolve(__dirname, "../rooms", `${room}.json`);
if (!fs.existsSync(cfgPath)) throw new Error(`❌ Config not found: ${cfgPath}`);

const roomCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const sensorCfg = (roomCfg.sensors || []).find((s) => s.type === "facecam");
if (!sensorCfg) throw new Error(`❌ No "facecam" sensor in ${cfgPath}`);

const { broker = "process.env.BROKER_URL", intervalMs: INTERVAL_MS = 5000, pAdd = 0.45, pRemove = 0.35, maxFaces = 5, camRes = 64, pNewFace = 0.01 } = sensorCfg;

const ROOM = roomCfg.room || room;

// Topics
const TOPIC_MOTION = `homeA/${ROOM}/motion`; // expects { motion: true|false }  (your current code uses msg.motion)
const TOPIC_STATE = `homeA/${ROOM}/face`; // publishes current state (lightweight)
const TOPIC_CMD = `homeA/${ROOM}/face/cmd`; // optional commands

const client = mqtt.connect(process.env.BROKER_URL || broker, {
  clientId: `device-facecam-${ROOM}-` + Math.random().toString(16).slice(2),
  protocolVersion: 4,
  clean: true,
  keepalive: 30,
  connectTimeout: 10000,
  reconnectPeriod: 2000,
});

// ---------- Hashing (64x64x3 RGB, FNV-1a 32-bit) ----------
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
function hashFace(face) {
  // face: 64x64x3 -> face[y][x] = [r,g,b]
  let h = FNV_OFFSET >>> 0;
  // assume camRes=64; if different, still iterate face.length/row.length
  for (let y = 0; y < face.length; y++) {
    const row = face[y];
    for (let x = 0; x < row.length; x++) {
      const [r, g, b] = row[x];
      h ^= r & 0xff;
      h = (h * FNV_PRIME) >>> 0;
      h ^= g & 0xff;
      h = (h * FNV_PRIME) >>> 0;
      h ^= b & 0xff;
      h = (h * FNV_PRIME) >>> 0;
    }
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

// ---------- State ----------
const visible = []; // array of face arrays
const visibleHashes = new Set(); // content-based set to avoid duplicates
let motionActive = false;
let pubTimer = null;
let state = { faces: [], count: 0, ts: new Date().toISOString() };

// ---------- Face pool ----------
let FACE_POOL = [];
try {
  const lines = fs
    .readFileSync(facesFile, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  FACE_POOL = lines.map((l) => JSON.parse(l.trim()));
  console.log(`📁 Loaded ${FACE_POOL.length} faces from faces.txt`);
} catch (err) {
  console.error("⚠️ Could not load faces.txt, using empty pool:", err.message);
  FACE_POOL = [];
}

// ---------- Generators ----------
function generatePixels(size) {
  // random RGB face - only used when pNewFace triggers and no unique pool pick
  return Array.from({ length: size }, () => Array.from({ length: size }, () => [0, 0, 0].map(() => Math.floor(Math.random() * 256))));
}

// pick a unique face; try pool first, else maybe generate
function pickUniqueFace() {
  if (FACE_POOL.length > 0) {
    const attempts = Math.min(10, FACE_POOL.length * 2);
    for (let tries = 0; tries < attempts; tries++) {
      const cand = FACE_POOL[Math.floor(Math.random() * FACE_POOL.length)];
      const h = hashFace(cand);
      if (!visibleHashes.has(h)) return { face: cand, hash: h };
    }
  }
  if (Math.random() < pNewFace) {
    const gen = generatePixels(camRes);
    const h = hashFace(gen);
    if (!visibleHashes.has(h)) return { face: gen, hash: h };
  }
  return null; // no unique option available this tick
}

// Returns: "generate" | "remove" | "none"
function maybeJitterFacesArr(facesArr, maxFaces, P_ADD, P_REMOVE) {
  const r = Math.random();

  if (r < P_ADD) {
    if (facesArr.length < maxFaces) {
      const pick = pickUniqueFace();
      if (pick) {
        facesArr.push(pick.face);
        visibleHashes.add(pick.hash);
        return "generate";
      }
    }
    return "none";
  } else if (r > 1 - P_REMOVE) {
    if (facesArr.length > 0) {
      const i = Math.floor(Math.random() * facesArr.length);
      const removed = facesArr.splice(i, 1)[0];
      const rh = hashFace(removed);
      visibleHashes.delete(rh);
      return "remove";
    }
    return "none";
  }
  return "none";
}

// ---------- Publishing loop ----------
function publishState() {
  if (!motionActive) return;

  maybeJitterFacesArr(visible, maxFaces, pAdd, pRemove);

  state = {
    faces: visible, // raw arrays
    count: visible.length,
    ts: new Date().toISOString(),
  };

  // Optional: show hashes to verify no duplicates
  if (state.count > 0) {
    const hashes = state.faces.map(hashFace);
    // console.log("🧮 visible hashes:", hashes.join(", "));
  }

  client.publish(TOPIC_STATE, JSON.stringify(state), { qos: 0, retain: true }, (err) => {
    if (err) console.error("❌ publish error:", err.message);
    else console.log("📤🎥", TOPIC_STATE, { count: state.count, ts: state.ts });
  });
}

function startPublishing() {
  if (pubTimer) return;
  pubTimer = setInterval(publishState, INTERVAL_MS);
  console.log(`▶️ (${ROOM}) started publishing every ${INTERVAL_MS}ms`);
}

function stopPublishingAndClear() {
  if (pubTimer) {
    clearInterval(pubTimer);
    pubTimer = null;
  }
  visible.length = 0; // clear array
  visibleHashes.clear(); // keep set in sync
  state = { faces: [], count: 0, ts: new Date().toISOString() };
  client.publish(TOPIC_STATE, JSON.stringify(state), { qos: 0, retain: true }, (err) => {
    if (err) console.error("❌ publish error:", err.message);
    else console.log("📤🎥", TOPIC_STATE, { count: state.count, ts: state.ts });
  })
  console.log(`⏸️ (${ROOM}) stopped publishing every ${INTERVAL_MS}ms`);
}

// ---------- MQTT wiring ----------
client.on("connect", () => {
  console.log(`🎥 FaceCAM (${ROOM}) connected`);
  client.subscribe([TOPIC_MOTION, TOPIC_CMD], { qos: 0 });
});

// Single message handler
client.on("message", (topic, buf) => {
  let msg;
  try {
    msg = JSON.parse(buf.toString());
  } catch {
    console.error("❌ bad JSON:", buf.toString());
    return;
  }

  if (topic === TOPIC_MOTION) {
    // expect: { motion: true|false }
    if (typeof msg.motion === "boolean") {
      const prev = motionActive;
      motionActive = msg.motion;

      if (motionActive && !prev) {
        startPublishing(); // Motion ON → start loop
      } else if (!motionActive && prev) {
        stopPublishingAndClear(); // Motion OFF → stop + clear faces
        client.publish(TOPIC_STATE, JSON.stringify(state), { qos: 0, retain: true });
      }
    }
    return;
  }

  if (topic === TOPIC_CMD) {
    if (!motionActive) {
      // sync from received state (dedupe by hash)
      const faces = Array.isArray(msg.faces) ? msg.faces : [];
      visible.length = 0;
      visibleHashes.clear();
      for (const f of faces) {
        const h = hashFace(f);
        if (!visibleHashes.has(h)) {
          visible.push(f);
          visibleHashes.add(h);
        }
      }
      state = {
        faces: visible,
        count: visible.length,
        ts: msg.ts || new Date().toISOString(),
      };
      console.log("🔄 State synced from CMD (motion=false): count=", state.count);
    } else {
      // motion ON → ignore and clear
      visible.length = 0;
      visibleHashes.clear();
      state = { faces: [], count: 0, ts: new Date().toISOString() };
      console.log("⚠️ Motion active, ignoring CMD state and clearing faces");
    }
    return;
  }
});

client.on("error", (err) => console.error("❌ MQTT error:", err.message));

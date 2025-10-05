// faceMLSim.js
// Simulated ML model: MQTT <-> MongoDB (hash lookup by face_hash)

const mqtt = require("mqtt");
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// --- CONFIG ---
const BROKER_URL = process.env.BROKER_URL || "mqtt://localhost:1883";
const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) throw new Error("MONGO_URL env var is required (hosted Mongo URI).");
const DB_NAME = process.env.DB_NAME || "smarthome";
const FACE_COLL = process.env.FACE_COLL || "faces";

// Topics
const SUB_TOPIC = "homeA/+/faceData";
const PUB_TOPIC = (room) => `homeA/${room}/FaceNames`;

const MOODS = ["relax", "focus", "sleep", "energize"];
const P_KEEP_MOOD = Number(process.env.P_KEEP_MOOD ?? 0.99); // chance to KEEP same mood
const moodByUser = new Map(); // user_id -> mood

// --- "ML" hash (FNV-1a 32-bit) ---
function hashFace(face) {
  // face: 64x64x3 array -> face[y][x][c]
  const FNV_OFFSET = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;

  let h = FNV_OFFSET >>> 0;

  for (let y = 0; y < 64; y++) {
    const row = face[y];
    for (let x = 0; x < 64; x++) {
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

function pickRandomMood() {
  return MOODS[Math.floor(Math.random() * MOODS.length)];
}

(async () => {
  const mcli = new MongoClient(MONGO_URL, {
    serverApi: { version: "1", strict: true, deprecationErrors: true },
  });
  await mcli.connect();
  const col = mcli.db(DB_NAME).collection(FACE_COLL);
  console.log("✅ Mongo connected to", `${DB_NAME}/${FACE_COLL}`);

  const client = mqtt.connect(BROKER_URL, {
    clientId: "face-recognizer-" + Math.random().toString(16).slice(2),
    protocolVersion: 4,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 2000,
  });

  client.on("connect", () => {
    console.log("✅ MQTT connected:", BROKER_URL);
    client.subscribe(SUB_TOPIC, { qos: 0 });
    console.log("📡 Subscribed to:", SUB_TOPIC);
  });

  client.on("message", async (topic, buf) => {
    const parts = topic.split("/");
    const room = parts[1] || "unknown";

    let payload;
    try {
      payload = JSON.parse(buf.toString());
    } catch {
      console.error("❌ Invalid JSON payload");
      return;
    }

    const faces = Array.isArray(payload?.faces) ? payload.faces : [];
    const faceCount = payload?.count; // optional from producer

    console.log(`📥 Received faceData for ${room}: faces=${faces.length}`);

    // Compute hashes in order
    const hashes = faces.map(hashFace);
    //   console.log("🧮 Generated hash:", hashes);

    // ✅ Publish empty immediately if count == 0 or faces array empty
    if (faces.length === 0 || faceCount === 0) {
      const out = { room, names: [], user_moods: {}, count: 0, ts: Date.now() };
      client.publish(PUB_TOPIC(room), JSON.stringify(out), { qos: 0 });
      console.log("📤 (empty)", PUB_TOPIC(room), out);
      return;
    }

    // Single batched DB lookup by face_hash
    let docs = [];
    try {
      docs = await col.find({ face_hash: { $in: hashes } }, { projection: { _id: 0, face_hash: 1, name: 1, user_id: 1 } }).toArray();
    } catch (e) {
      console.error("❌ Mongo find error:", e.message);
      // fallback: publish empty on DB error too
      const out = { room, names: [], user_moods: {}, count: 0, ts: Date.now() };
      client.publish(PUB_TOPIC(room), JSON.stringify(out), { qos: 0 });
      console.log("📤 (empty due to Mongo error)", PUB_TOPIC(room), out);
      return;
    }

    // Map hash -> { name, user_id }
    const recByHash = new Map(docs.map((d) => [d.face_hash, { name: d.name, user_id: d.user_id }]));

    const names = [];
    const user_moods = [];

    for (const h of hashes) {
      const rec = recByHash.get(h);
      const name = rec?.name ?? "unknown";
      const id = rec?.user_id ?? h; // fallback to hash if no user_id
      const keep = Math.random() < P_KEEP_MOOD;

      if (!moodByUser.has(id)) {
        moodByUser.set(id, pickRandomMood());
      } else if (!keep) {
        moodByUser.set(id, pickRandomMood());
      }

      names.push(name);
      user_moods.push({ id, mood: moodByUser.get(id) });
    }

    // ✅ Publish names (only if we actually had faces per requirement above)
    const out = { room, names, user_moods, count: names.length, ts: Date.now() };
    client.publish(PUB_TOPIC(room), JSON.stringify(out), { qos: 0 });
    console.log("📤", PUB_TOPIC(room), out);
  });

  client.on("error", (err) => console.error("❌ MQTT error:", err.message));

  process.on("SIGINT", () => {
    try {
      mcli.close();
    } catch {}
    client.end(true);
    process.exit(0);
  });
})().catch((err) => {
  console.error("❌ Startup failed:", err.message);
  process.exit(1);
});

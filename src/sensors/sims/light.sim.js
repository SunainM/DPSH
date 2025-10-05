const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const mqtt = require("mqtt");
const args = require("minimist")(process.argv.slice(2));
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

const roomsDir = path.resolve(__dirname, "../rooms");
const isMaster = !args.room; // no --room → master mode

if (isMaster) {
  // === Master mode: auto-launch one child per room ===
  const rooms = fs
    .readdirSync(roomsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"));

  console.log(`🧩💡 Launching Light sims for rooms: ${rooms.join(", ")}`);

  for (const room of rooms) {
    fork(__filename, ["--room", room], { stdio: "inherit" });
  }

  return;
}

const room = args.room || "hallway";
const cfgPath = path.resolve(__dirname, "../rooms", `${room}.json`);
if (!fs.existsSync(cfgPath)) throw new Error(`❌ Config not found: ${cfgPath}`);

const roomCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const sensorCfg = (roomCfg.sensors || []).find((s) => s.type === "light");
if (!sensorCfg) throw new Error(`❌ No "light" sensor in ${cfgPath}`);

const {
  broker = process.env.BROKER_URL,
  intervalMs: INTERVAL_MS = 5000,
  pChange: PERCENTAGE_CHANGE_CHANCE = 0.2,
  lumRange: LUM_RANGE = 2,
  tempKRange: TEMP_K_RANGE = 100,
  lumMin: MIN_LUM = 0,
  lumMax: MAX_LUM = 100,
  kMin: MIN_K = 0,
  kMax: MAX_K = 10000,
} = sensorCfg;

const ROOM = roomCfg.room || room;
const TOPIC_STATE = `homeA/${ROOM}/light`;
const TOPIC_CMD = `homeA/${ROOM}/light/cmd`;

const client = mqtt.connect(process.env.BROKER_URL || broker, {
  clientId: `device-light-${ROOM}-` + Math.random().toString(16).slice(2),
  protocolVersion: 4,
  clean: true,
  keepalive: 30,
  connectTimeout: 10000,
  reconnectPeriod: 2000,
});

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

let lightState = { luminosity: 0.0, temp_k: 4500, ts: new Date().toISOString() };

function maybeJitterLight() {
  if (Math.random() < PERCENTAGE_CHANGE_CHANCE) {
    const deltaLum = (Math.random() * 2 - 1) * LUM_RANGE;
    lightState.luminosity = Number(clamp((lightState.luminosity ?? 0.5) + deltaLum, MIN_LUM, MAX_LUM).toFixed(1));
  }
  if (Math.random() < PERCENTAGE_CHANGE_CHANCE) {
    const deltaK = (Math.random() * 2 - 1) * TEMP_K_RANGE;
    lightState.temp_k = Math.round(clamp((lightState.temp_k ?? 4500) + deltaK, MIN_K, MAX_K));
  }
}

function publishState() {
  maybeJitterLight();
  lightState.ts = new Date().toISOString();
  client.publish(TOPIC_STATE, JSON.stringify(lightState), { qos: 0, retain: true }, (err) => {
    if (err) console.error("❌ publish error:", err.message);
    else console.log("📤", TOPIC_STATE, lightState);
  });
}

client.on("connect", () => {
  console.log(`💡 Light (${ROOM}) connected`);
  client.subscribe(TOPIC_CMD, { qos: 0 });
  setInterval(publishState, INTERVAL_MS);
});

client.on("message", (topic, buf) => {
  if (topic !== TOPIC_CMD) return;
  try {
    const cmd = JSON.parse(buf.toString());
    if (cmd.luminosity !== undefined) lightState.luminosity = Number(cmd.luminosity);
    if (cmd.temp_k !== undefined) lightState.temp_k = Number(cmd.temp_k);
    console.log(`📥💡 ${ROOM} received cmd:`, cmd);
  } catch {
    console.error("❌ bad JSON cmd:", buf.toString());
  }
});

client.on("error", (err) => console.error("❌ MQTT error:", err.message));

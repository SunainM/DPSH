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

  console.log(`🧩🌡️ Launching temperature sims for rooms: ${rooms.join(", ")}`);

  for (const room of rooms) {
    fork(__filename, ["--room", room], { stdio: "inherit" });
  }

  return;
}

const room = args.room || "hallway";
const cfgPath = path.resolve(__dirname, "../rooms", `${room}.json`);
if (!fs.existsSync(cfgPath)) throw new Error(`❌ Config not found: ${cfgPath}`);

const roomCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const sensorCfg = (roomCfg.sensors || []).find((s) => s.type === "temp");
if (!sensorCfg) throw new Error(`❌ No "temp" sensor in ${cfgPath}`);

const { broker = process.env.BROKER_URL, intervalMs: INTERVAL_MS = 5000, pChange: PERCENTAGE_CHANGE_CHANCE = 0.2, tempRange: TEMP_THRESHOLD = 10 } = sensorCfg;

const ROOM = roomCfg.room || room;
const TOPIC_STATE = `homeA/${ROOM}/temp`;
const TOPIC_CMD = `homeA/${ROOM}/temp/cmd`;

const client = mqtt.connect(process.env.BROKER_URL || broker, {
  clientId: `device-temp-${ROOM}-` + Math.random().toString(16).slice(2),
  protocolVersion: 4,
  clean: true,
  keepalive: 30,
  connectTimeout: 10000,
  reconnectPeriod: 2000,
});

let state = { temp_c: null, ts: new Date().toISOString() };

function maybeJitterTemp() {
  if (Math.random() < PERCENTAGE_CHANGE_CHANCE) {
    const base = Number.isFinite(state.temp_c) ? state.temp_c : 22;
    const delta = (Math.random() * 2 - 1) * TEMP_THRESHOLD;
    state.temp_c = Number((base + delta).toFixed(1));
  }
}

function publishState() {
  maybeJitterTemp();
  state.ts = new Date().toISOString();
  client.publish(TOPIC_STATE, JSON.stringify(state), { qos: 0, retain: true }, (err) => {
    if (err) console.error("❌ publish error:", err.message);
    else console.log("📤", TOPIC_STATE, state);
  });
}

client.on("connect", () => {
  console.log(`🌡️ Temperature (${ROOM}) connected`);
  client.subscribe(TOPIC_CMD, { qos: 0 });
  setInterval(publishState, INTERVAL_MS);
});

client.on("message", (topic, buf) => {
  if (topic !== TOPIC_CMD) return;
  try {
    const cmd = JSON.parse(buf.toString());
    if (cmd.temp_c !== undefined && !Number.isNaN(Number(cmd.temp_c))) {
      state.temp_c = Number(cmd.temp_c);
      console.log(`📥🌡️ ${ROOM} received cmd:`, cmd);
    }
  } catch {
    console.error("❌ bad JSON cmd:", buf.toString());
  }
});

client.on("error", (err) => console.error("❌ MQTT error:", err.message));

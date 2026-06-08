// faceMLSim.js — Simulated ML model: MQTT <-> MongoDB (hash lookup by face_hash)
const mqtt = require("mqtt");
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { hashFace } = require("../common/hashFace");

// --- CONFIG ---
const BROKER_URL = process.env.BROKER_URL || "mqtt://localhost:1883";
const MONGO_URL  = process.env.MONGO_URL;
if (!MONGO_URL) throw new Error("MONGO_URL env var is required (hosted Mongo URI).");
const DB_NAME   = process.env.DB_NAME   || "smarthome";
const FACE_COLL = process.env.FACE_COLL || "faces";

// Topics
const PUB_TOPIC  = (room) => `homeA/${room}/FaceNames`;
const MOOD_TOPIC = (room) => `homeA/${room}/mood/in`;
const SUB_TOPIC  = "homeA/+/face";

const MOODS      = ["relax", "focus", "sleep", "energize"];
const P_KEEP_MOOD = Number(process.env.P_KEEP_MOOD ?? 0.99);

function pickRandomMood() {
  return MOODS[Math.floor(Math.random() * MOODS.length)];
}

// --- Message handler factory (exported for testing) ---
function buildMessageHandler({ col, client, moodByUser }) {
  return async function messageHandler(topic, buf) {
    const parts = topic.split("/");
    const room  = parts[1] || "unknown";

    let payload;
    try {
      payload = JSON.parse(buf.toString());
    } catch {
      console.error("❌ Invalid JSON payload");
      return;
    }

    const faces     = Array.isArray(payload?.faces) ? payload.faces : [];
    const faceCount = payload?.count;

    console.log(`📥 Received face data for ${room}: faces=${faces.length}`);

    if (faces.length === 0 || faceCount === 0) {
      const out = { room, names: [], user_moods: [], count: 0, ts: Date.now() };
      client.publish(PUB_TOPIC(room),  JSON.stringify(out), { qos: 0 });
      client.publish(MOOD_TOPIC(room), JSON.stringify([]),  { qos: 0 });
      console.log("📤 (empty)", PUB_TOPIC(room));
      return;
    }

    const hashes = faces.map(hashFace);

    let docs = [];
    try {
      docs = await col
        .find({ face_hash: { $in: hashes } }, { projection: { _id: 0, face_hash: 1, name: 1, user_id: 1 } })
        .toArray();
    } catch (e) {
      console.error("❌ Mongo find error:", e.message);
      const out = { room, names: [], user_moods: [], count: 0, ts: Date.now() };
      client.publish(PUB_TOPIC(room),  JSON.stringify(out), { qos: 0 });
      client.publish(MOOD_TOPIC(room), JSON.stringify([]),  { qos: 0 });
      return;
    }

    const recByHash = new Map(docs.map((d) => [d.face_hash, { name: d.name, user_id: d.user_id }]));

    const names      = [];
    const user_moods = [];

    for (const h of hashes) {
      const rec  = recByHash.get(h);
      const name = rec?.name    ?? "unknown";
      const id   = rec?.user_id ?? h;

      if (!moodByUser.has(id) || Math.random() >= P_KEEP_MOOD) {
        moodByUser.set(id, pickRandomMood());
      }

      names.push(name);
      user_moods.push({ id, mood: moodByUser.get(id) });
    }

    const out = { room, names, user_moods, count: names.length, ts: Date.now() };
    client.publish(PUB_TOPIC(room),  JSON.stringify(out),       { qos: 0 });
    client.publish(MOOD_TOPIC(room), JSON.stringify(user_moods), { qos: 0 });
    console.log("📤", PUB_TOPIC(room), out);
  };
}

// --- Start server ---
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

  const moodByUser = new Map();

  client.on("connect", () => {
    console.log("✅ MQTT connected:", BROKER_URL);
    client.subscribe(SUB_TOPIC, { qos: 0 });
    console.log("📡 Subscribed to:", SUB_TOPIC);
  });

  client.on("message", buildMessageHandler({ col, client, moodByUser }));
  client.on("error",   (err) => console.error("❌ MQTT error:", err.message));

  process.on("SIGINT", () => {
    try { mcli.close(); } catch {}
    client.end(true);
    process.exit(0);
  });
})().catch((err) => {
  console.error("❌ Startup failed:", err.message);
  process.exit(1);
});

module.exports = { buildMessageHandler };

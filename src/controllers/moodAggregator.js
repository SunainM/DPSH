const mqtt = require("mqtt");
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { averageMoods } = require("../common/moodAverage");

// --- CONFIG ---
const BROKER_URL = process.env.BROKER_URL || "mqtt://localhost:1883";
const MONGO_URL  = process.env.MONGO_URL;
if (!MONGO_URL) throw new Error("MONGO_URL env var is required (hosted Mongo URI).");

const DB_NAME   = process.env.DB_NAME   || "smarthome";
const MOOD_COLL = process.env.MOOD_COLL || "moods";

// MQTT topics
const SUB_TOPIC = "homeA/+/mood/in"; // published by faceMLSim
const PUB_TOPIC = (room) => `homeA/${room}/mood/out`;

(async () => {
  const mongoClient = new MongoClient(MONGO_URL);
  await mongoClient.connect();
  const moodsCol = mongoClient.db(DB_NAME).collection(MOOD_COLL);
  console.log("✅ Mongo connected to", `${DB_NAME}/${MOOD_COLL}`);

  const client = mqtt.connect(BROKER_URL, {
    clientId: "mood-aggregator-" + Math.random().toString(16).slice(2),
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

  client.on("error", (err) => console.error("MQTT Error:", err));

  client.on("message", async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (!Array.isArray(payload) || payload.length === 0) {
        console.warn("⚠️ Invalid or empty payload:", payload);
        return;
      }

      const parts = topic.split("/");
      const room  = parts[1] || "unknown";

      // Fetch mood preferences for each user
      const resolved = [];
      for (const user of payload) {
        const doc = await moodsCol.findOne({ user_id: user.id });
        if (!doc?.moods?.[user.mood]) continue;
        resolved.push(doc.moods[user.mood]);
      }

      const avg = averageMoods(resolved);
      if (!avg) {
        console.warn("⚠️ No valid mood entries found for averaging.");
        return;
      }

      const outTopic = PUB_TOPIC(room);
      client.publish(outTopic, JSON.stringify(avg), { qos: 0 });
      console.log(`📤 Published avg mood data to ${outTopic}:`, avg);
    } catch (err) {
      console.error("❌ Error handling message:", err);
    }
  });

  process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down...");
    await mongoClient.close();
    client.end();
    process.exit(0);
  });
})().catch((err) => {
  console.error("❌ Startup failed:", err.message);
  process.exit(1);
});

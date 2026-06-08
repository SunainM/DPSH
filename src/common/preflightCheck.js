// Pre-flight check: validates env vars, MongoDB connectivity, and MQTT connectivity.
// Run before starting any service: node src/common/preflightCheck.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const mqtt         = require("mqtt");
const { MongoClient } = require("mongodb");
const { checkRequiredEnv } = require("./envCheck");

async function run() {
  const failed = [];

  // 1. Required env vars
  const { ok, missing } = checkRequiredEnv(["MONGO_URL", "BROKER_URL"]);
  if (!ok) {
    console.error("❌ Missing env vars:", missing.join(", "));
    failed.push("env");
    // No point trying network checks without the URLs
    console.error("\n🚫 Pre-flight failed:", failed.join(", "));
    process.exit(1);
  }
  console.log("✅ Env vars OK");

  // 2. MongoDB connectivity
  const mongoClient = new MongoClient(process.env.MONGO_URL, {
    connectTimeoutMS:        5000,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await mongoClient.connect();
    await mongoClient.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB reachable");
  } catch (err) {
    console.error("❌ MongoDB:", err.message);
    failed.push("mongodb");
  } finally {
    await mongoClient.close().catch(() => {});
  }

  // 3. MQTT connectivity
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        c.end(true);
        reject(new Error("connection timed out after 5s"));
      }, 5000);

      const c = mqtt.connect(process.env.BROKER_URL, {
        connectTimeout:  5000,
        reconnectPeriod: 0,
      });
      c.on("connect", () => { clearTimeout(timer); c.end(true); resolve(); });
      c.on("error",   (err) => { clearTimeout(timer); c.end(true); reject(err); });
    });
    console.log("✅ MQTT broker reachable:", process.env.BROKER_URL);
  } catch (err) {
    console.error("❌ MQTT:", err.message);
    failed.push("mqtt");
  }

  if (failed.length > 0) {
    console.error("\n🚫 Pre-flight failed:", failed.join(", "));
    process.exit(1);
  }

  console.log("\n✅ All pre-flight checks passed. Safe to start services.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});

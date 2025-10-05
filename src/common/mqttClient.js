const mqtt = require('mqtt');
require('dotenv').config();

/**
 * Connect to the MQTT broker using BROKER_URL from .env.
 * Returns a connected client.
 */
function connectClient(clientId) {
  const url = process.env.BROKER_URL || 'mqtt://localhost:1883';
  const client = mqtt.connect(url, {
    clientId: clientId || `psh-${Math.random().toString(16).slice(2)}`,
    clean: true,
  });

  client.on('connect', () => console.log(`✅ MQTT connected as ${client.options.clientId}`));
  client.on('error', (err) => console.error('❌ MQTT error:', err.message));

  return client;
}

/**
 * Build a topic like: homeA/<room>/<sensor>
 * e.g., topic('living','temp') -> 'homeA/living/temp'
 */
function topic(room, sensor) {
  const prefix = process.env.TOPIC_PREFIX || 'homeA';
  return `${prefix}/${room}/${sensor}`;
}

module.exports = { connectClient, topic };

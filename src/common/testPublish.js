const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: 'psh-test-pub-' + Math.random().toString(16).slice(2),
  protocolVersion: 4,       // MQTT 3.1.1
  clean: true,
  reconnectPeriod: 0,       // one-shot (don’t auto-reconnect)
  keepalive: 30
});

client.on('connect', () => {
  console.log('✅ Connected (publisher)');
  const topic = 'homeA/living/temp';
  const payload = JSON.stringify({ temp_c: 24.2, ts: new Date().toISOString() });

  // Small delay to be extra safe; Node-RED is usually already subscribed.
  setTimeout(() => {
    client.publish(topic, payload, { qos: 1, retain: true }, (err) => {
      if (err) {
        console.error('❌ Publish error:', err.message);
      } else {
        console.log('📤 Sent:', topic, payload, '(qos=0, retain=true)');
      }
      client.end(true, () => console.log('👋 Disconnected publisher'));
    });
  }, 300);
});

client.on('error', (err) => {
  console.error('❌ MQTT client error:', err.message);
});

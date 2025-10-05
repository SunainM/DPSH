const { connectClient } = require('./mqttClient');

const client = connectClient('tester-connect');

client.on('connect', () => {
    console.log('🔌 Test client connected. Now disconnecting...');
    client.end(true, () => console.log('👋 Disconnected. Test OK.'));
});

const http = require('http');

console.log('Starting test...');

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/brokers/bitget/ping',
  method: 'GET'
};

console.log('Making request to:', `http://localhost:3002/brokers/bitget/ping`);

const req = http.request(options, (res) => {
  console.log('Got response! Status:', res.statusCode);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
    console.log('Received chunk:', chunk.toString());
  });
  
  res.on('end', () => {
    console.log('Response complete. Full body:', body);
    try {
      const parsed = JSON.parse(body);
      console.log('Parsed response:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Could not parse JSON:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.setTimeout(10000, () => {
  console.log('Request timed out');
  req.destroy();
});

console.log('Sending request...');
req.end();
console.log('Request sent, waiting for response...');

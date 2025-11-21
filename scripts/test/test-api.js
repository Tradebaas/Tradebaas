const http = require('http');

function testEndpoint(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3001,
      path: path,
      method: 'GET'
    };

    console.log(`Testing: http://127.0.0.1:3001${path}`);
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data}`);
        console.log('---');
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`Error: ${err.message}`);
      console.log('---');
      resolve();
    });

    req.setTimeout(5000, () => {
      console.log('Request timeout');
      req.destroy();
      resolve();
    });

    req.end();
  });
}

async function runTests() {
  console.log('Starting endpoint tests...\n');
  
  await testEndpoint('/health');
  await testEndpoint('/brokers/bitget/status');
  await testEndpoint('/brokers/bitget/ping');
  
  console.log('Tests completed.');
}

runTests().catch(console.error);

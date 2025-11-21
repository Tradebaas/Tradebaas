const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/brokers/bitget/ping',
  method: 'GET',
  timeout: 10000
};

console.log('🔗 Testing Bitget ping via server API...');

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response Body:', data);
    
    try {
      const response = JSON.parse(data);
      console.log('✅ Parsed Response:', JSON.stringify(response, null, 2));
      
      if (response.ok === false && response.error) {
        console.log('\n🔍 Analyzing error...');
        if (response.error.includes('404')) {
          console.log('❌ Still getting 404 - endpoint may not be fixed yet');
        } else if (response.error.includes('401')) {
          console.log('✅ 401 means endpoint is correct, authentication issue');
        }
      } else if (response.ok === true) {
        console.log('🎉 SUCCESS! USDC balance accessible!');
      }
    } catch (e) {
      console.log('Raw response (not JSON):', data);
    }
  });
});

req.on('error', (err) => {
  console.log('❌ Request Error:', err.message);
});

req.on('timeout', () => {
  console.log('❌ Request timeout');
  req.destroy();
});

req.end();

const fs = require('fs');

// Test functie die resultaat naar bestand schrijft
async function testEndpoints() {
    const results = [];
    
    try {
        // Test 1: Health endpoint
        results.push('=== TESTING HEALTH ENDPOINT ===');
        
        const healthResponse = await makeRequest('localhost', 4000, '/health');
        results.push(`Health Status: ${healthResponse.statusCode}`);
        results.push(`Health Response: ${healthResponse.body}`);
        
        // Test 2: Bitget ping
        results.push('\n=== TESTING BITGET PING ===');
        
        const pingResponse = await makeRequest('localhost', 4000, '/brokers/bitget/ping');
        results.push(`Ping Status: ${pingResponse.statusCode}`);
        results.push(`Ping Response: ${pingResponse.body}`);
        
    } catch (error) {
        results.push(`ERROR: ${error.message}`);
    }
    
    // Schrijf resultaat naar bestand
    const output = results.join('\n');
    fs.writeFileSync('/root/Tradebaas/test-output.txt', output);
    console.log('Results written to /root/Tradebaas/test-output.txt');
    console.log(output);
}

function makeRequest(hostname, port, path) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const options = { hostname, port, path, method: 'GET' };
        
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ 
                statusCode: res.statusCode, 
                body: body,
                headers: res.headers 
            }));
        });
        
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// Run de test
testEndpoints().then(() => {
    console.log('Test completed');
    process.exit(0);
}).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});

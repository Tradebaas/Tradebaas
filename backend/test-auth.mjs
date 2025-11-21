#!/usr/bin/env node
/**
 * Quick test script for Phase 1 auth endpoints
 */

const API_BASE = 'http://localhost:3000';

async function testAuth() {
  console.log('🧪 Testing Phase 1 Auth Endpoints\n');

  const testEmail = `test-${Date.now()}@tradebaas.nl`;
  const testPassword = 'SuperSecurePassword123!';
  
  try {
    // 1. Test Register
    console.log('1️⃣  Testing POST /auth/register');
    const registerRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        fullName: 'Test User'
      })
    });
    
    const registerData = await registerRes.json();
    console.log('   Status:', registerRes.status);
    console.log('   Response:', JSON.stringify(registerData, null, 2));
    
    if (!registerData.success) {
      throw new Error('Register failed: ' + registerData.error);
    }
    console.log('   ✅ Register successful\n');
    
    // 2. Test Login
    console.log('2️⃣  Testing POST /auth/login');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });
    
    const loginData = await loginRes.json();
    console.log('   Status:', loginRes.status);
    console.log('   Response:', JSON.stringify(loginData, null, 2));
    
    if (!loginData.success || !loginData.accessToken) {
      throw new Error('Login failed: ' + loginData.error);
    }
    
    const accessToken = loginData.accessToken;
    console.log('   ✅ Login successful\n');
    
    // 3. Test /auth/me (protected)
    console.log('3️⃣  Testing GET /auth/me (protected)');
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const meData = await meRes.json();
    console.log('   Status:', meRes.status);
    console.log('   Response:', JSON.stringify(meData, null, 2));
    
    if (!meData.success || !meData.user) {
      throw new Error('Auth/me failed');
    }
    console.log('   ✅ Protected endpoint works\n');
    
    // 4. Test with invalid token
    console.log('4️⃣  Testing GET /auth/me with invalid token');
    const invalidRes = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        'Authorization': 'Bearer invalid_token_here'
      }
    });
    
    const invalidData = await invalidRes.json();
    console.log('   Status:', invalidRes.status);
    console.log('   Response:', JSON.stringify(invalidData, null, 2));
    
    if (invalidRes.status !== 401) {
      throw new Error('Should have returned 401 for invalid token');
    }
    console.log('   ✅ Invalid token correctly rejected\n');
    
    console.log('✅ All auth tests passed!');
    console.log('\n📊 Summary:');
    console.log('   - User registration: ✅');
    console.log('   - User login with JWT: ✅');
    console.log('   - Protected endpoint access: ✅');
    console.log('   - Token validation: ✅');
    console.log('\n🎉 Phase 1 auth foundation is working correctly!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testAuth();

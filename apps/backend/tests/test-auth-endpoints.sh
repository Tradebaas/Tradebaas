#!/bin/bash
# Quick auth endpoints test script
# Usage: ./test-auth-endpoints.sh

set -e

echo "================================================"
echo "Testing Tradebaas Auth Endpoints (Fase 1)"
echo "================================================"
echo ""

BASE_URL="http://localhost:3000"

echo "1️⃣  Testing user registration..."
REGISTER_RESPONSE=$(curl -s -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"TestPassword123!","fullName":"Test User"}')

echo "$REGISTER_RESPONSE" | jq .

if echo "$REGISTER_RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo "✅ Registration successful"
else
  echo "❌ Registration failed"
  exit 1
fi

echo ""
echo "2️⃣  Testing user login..."
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"TestPassword123!"}')

echo "$LOGIN_RESPONSE" | jq .

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo "✅ Login successful - Token received"
else
  echo "❌ Login failed - No token"
  exit 1
fi

echo ""
echo "3️⃣  Testing /auth/me with token..."
ME_RESPONSE=$(curl -s $BASE_URL/auth/me \
  -H "Authorization: Bearer $TOKEN")

echo "$ME_RESPONSE" | jq .

if echo "$ME_RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo "✅ Auth verification successful"
else
  echo "❌ Auth verification failed"
  exit 1
fi

echo ""
echo "4️⃣  Testing duplicate registration..."
DUP_RESPONSE=$(curl -s -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"AnotherPassword123!"}')

echo "$DUP_RESPONSE" | jq .

if echo "$DUP_RESPONSE" | jq -e '.error' | grep -q "already in use"; then
  echo "✅ Duplicate email correctly rejected"
else
  echo "❌ Duplicate email should be rejected"
  exit 1
fi

echo ""
echo "5️⃣  Testing wrong password..."
WRONG_PASS=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"WrongPassword!"}')

echo "$WRONG_PASS" | jq .

if echo "$WRONG_PASS" | jq -e '.error' | grep -q "Invalid credentials"; then
  echo "✅ Wrong password correctly rejected"
else
  echo "❌ Wrong password should be rejected"
  exit 1
fi

echo ""
echo "6️⃣  Testing invalid token..."
INVALID_TOKEN=$(curl -s $BASE_URL/auth/me \
  -H "Authorization: Bearer invalid.fake.token")

echo "$INVALID_TOKEN" | jq .

if echo "$INVALID_TOKEN" | jq -e '.error' | grep -q "Invalid token"; then
  echo "✅ Invalid token correctly rejected"
else
  echo "❌ Invalid token should be rejected"
  exit 1
fi

echo ""
echo "================================================"
echo "✅ ALL AUTH TESTS PASSED!"
echo "================================================"
echo ""
echo "Fase 1 is volledig functioneel:"
echo "  ✅ PostgreSQL database connected"
echo "  ✅ User registration working"
echo "  ✅ JWT-based login working"
echo "  ✅ Token verification working"
echo "  ✅ Security validations working"
echo ""
echo "Next: Fase 2 - Per-user credentials storage"

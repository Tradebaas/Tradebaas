#!/bin/bash
# Test backend analysis endpoints
# Usage: ./test-backend-analysis.sh [BACKEND_URL]
# Example: ./test-backend-analysis.sh http://localhost:3000

BACKEND_URL=${1:-http://localhost:3000}

echo "=== Testing Backend Analysis Endpoint ==="
echo "Backend URL: $BACKEND_URL"
echo ""

# Get all strategies first
echo "1. Getting all strategies..."
curl -s "$BACKEND_URL/api/strategy/status" | jq '.strategies[] | {id, name, status, hasAnalysis: (.analysisState != null)}'

echo ""
echo "2. Getting debug info..."
curl -s "$BACKEND_URL/api/debug/strategies" | jq '.'

echo ""
echo "3. Testing analysis endpoint with a specific ID..."
# Get the first strategy ID
STRATEGY_ID=$(curl -s "$BACKEND_URL/api/strategy/status" | jq -r '.strategies[0].id')
echo "Using strategy ID: $STRATEGY_ID"
curl -s "$BACKEND_URL/api/strategy/analysis/$STRATEGY_ID" | jq '.'

echo ""
echo "=== Test Complete ==="

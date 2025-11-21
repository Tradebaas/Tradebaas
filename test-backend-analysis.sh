#!/bin/bash

echo "=== Testing Backend Analysis Endpoint ==="
echo ""

# Get all strategies first
echo "1. Getting all strategies..."
curl -s http://YOUR_SERVER_IP:3000/api/strategy/status | jq '.strategies[] | {id, name, status, hasAnalysis: (.analysisState != null)}'

echo ""
echo "2. Getting debug info..."
curl -s http://YOUR_SERVER_IP:3000/api/debug/strategies | jq '.'

echo ""
echo "3. Testing analysis endpoint with a specific ID..."
# Get the first strategy ID
STRATEGY_ID=$(curl -s http://YOUR_SERVER_IP:3000/api/strategy/status | jq -r '.strategies[0].id')
echo "Using strategy ID: $STRATEGY_ID"
curl -s "http://YOUR_SERVER_IP:3000/api/strategy/analysis/$STRATEGY_ID" | jq '.'

echo ""
echo "=== Test Complete ==="

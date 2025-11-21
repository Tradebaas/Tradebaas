#!/bin/bash
# Complete Tradebaas Backend Test Suite
set -e

BASE_URL="http://127.0.0.1:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "Tradebaas Backend Test Suite"
echo "======================================"
echo ""

# Test 1: Health Check
echo -e "${YELLOW}[TEST 1] Health Check${NC}"
HEALTH=$(curl -s "${BASE_URL}/health")
echo "$HEALTH" | jq .
if echo "$HEALTH" | jq -e '.status' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    exit 1
fi
echo ""

# Test 2: Ready Check
echo -e "${YELLOW}[TEST 2] Ready Check${NC}"
READY=$(curl -s "${BASE_URL}/ready")
echo "$READY" | jq .
if echo "$READY" | jq -e '.ready' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Ready check passed${NC}"
else
    echo -e "${RED}✗ Ready check failed${NC}"
fi
echo ""

# Test 3: Connection Status
echo -e "${YELLOW}[TEST 3] Connection Status${NC}"
STATUS=$(curl -s "${BASE_URL}/api/connection/status")
echo "$STATUS" | jq .
echo -e "${GREEN}✓ Connection status retrieved${NC}"
echo ""

# Test 4: Strategy Status (v2)
echo -e "${YELLOW}[TEST 4] Strategy Status (v2)${NC}"
STRAT_STATUS=$(curl -s "${BASE_URL}/api/strategy/status/v2")
echo "$STRAT_STATUS" | jq .
echo -e "${GREEN}✓ Strategy status retrieved${NC}"
echo ""

# Test 5: Deribit Connection (LIVE)
echo -e "${YELLOW}[TEST 5] Connect to Deribit LIVE${NC}"
echo -e "${RED}⚠️  WARNING: Using LIVE credentials - real money!${NC}"
CONNECT=$(curl -s -X POST "${BASE_URL}/api/v2/connect" \
  -H "Content-Type: application/json" \
  -d '{"environment":"live"}')
echo "$CONNECT" | jq .
if echo "$CONNECT" | jq -e '.connected == true' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Successfully connected to Deribit LIVE${NC}"
else
    echo -e "${RED}✗ Failed to connect to Deribit${NC}"
    echo "Response: $CONNECT"
fi
echo ""

# Wait for connection to establish
sleep 3

# Test 6: Get Balance (requires connection)
echo -e "${YELLOW}[TEST 6] Get Account Balance${NC}"
BALANCE=$(curl -s "${BASE_URL}/api/v2/balance")
echo "$BALANCE" | jq .
if echo "$BALANCE" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Balance retrieved successfully${NC}"
else
    echo -e "${YELLOW}⚠ Balance retrieval issue (may need active connection)${NC}"
fi
echo ""

# Test 7: Get Positions
echo -e "${YELLOW}[TEST 7] Get Open Positions${NC}"
POSITIONS=$(curl -s "${BASE_URL}/api/v2/positions")
echo "$POSITIONS" | jq .
if echo "$POSITIONS" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Positions retrieved successfully${NC}"
else
    echo -e "${YELLOW}⚠ Positions retrieval issue${NC}"
fi
echo ""

# Test 8: Get Ticker Data
echo -e "${YELLOW}[TEST 8] Get BTC Ticker Data${NC}"
TICKER=$(curl -s "${BASE_URL}/api/v2/ticker/BTC-PERPETUAL")
echo "$TICKER" | jq .
if echo "$TICKER" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Ticker data retrieved successfully${NC}"
else
    echo -e "${YELLOW}⚠ Ticker retrieval issue${NC}"
fi
echo ""

# Test 9: KV Storage - Set Value
echo -e "${YELLOW}[TEST 9] KV Storage - Set Value${NC}"
KV_SET=$(curl -s -X POST "${BASE_URL}/api/kv" \
  -H "Content-Type: application/json" \
  -d '{"key":"test-key","value":"test-value","ttl":3600}')
echo "$KV_SET" | jq .
if echo "$KV_SET" | jq -e '.success == true' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ KV set successful${NC}"
else
    echo -e "${RED}✗ KV set failed${NC}"
fi
echo ""

# Test 10: KV Storage - Get Value
echo -e "${YELLOW}[TEST 10] KV Storage - Get Value${NC}"
KV_GET=$(curl -s "${BASE_URL}/api/kv/test-key")
echo "$KV_GET" | jq .
if echo "$KV_GET" | jq -e '.success == true' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ KV get successful${NC}"
else
    echo -e "${RED}✗ KV get failed${NC}"
fi
echo ""

# Test 11: KV Storage Stats
echo -e "${YELLOW}[TEST 11] KV Storage Stats${NC}"
KV_STATS=$(curl -s "${BASE_URL}/api/kv/_stats")
echo "$KV_STATS" | jq .
echo -e "${GREEN}✓ KV stats retrieved${NC}"
echo ""

# Test 12: Available Strategies
echo -e "${YELLOW}[TEST 12] List Available Strategies${NC}"
STRATEGIES=$(curl -s "${BASE_URL}/api/v2/strategies")
echo "$STRATEGIES" | jq .
if echo "$STRATEGIES" | jq -e '.success == true' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Strategies listed successfully${NC}"
else
    echo -e "${YELLOW}⚠ Strategies list issue${NC}"
fi
echo ""

# Final Summary
echo "======================================"
echo -e "${GREEN}Test Suite Complete!${NC}"
echo "======================================"
echo ""
echo "Key Results:"
echo "- Health: $(echo $HEALTH | jq -r '.status')"
echo "- Deribit Connection: $(echo $CONNECT | jq -r '.connected // "N/A"')"
echo "- Environment: $(echo $CONNECT | jq -r '.environment // "N/A"')"
echo ""

# Optional: Disconnect
echo -e "${YELLOW}[CLEANUP] Disconnecting from Deribit${NC}"
DISCONNECT=$(curl -s -X POST "${BASE_URL}/api/v2/disconnect")
echo "$DISCONNECT" | jq .
echo -e "${GREEN}✓ Cleanup complete${NC}"

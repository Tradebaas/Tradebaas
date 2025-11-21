#!/bin/bash
# Test Auto-Resume Functionality
# Simulates: Start strategy → Open position → Close position → Verify resume

set -e

BASE_URL="http://127.0.0.1:3000"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "Razor Strategy Auto-Resume Test"
echo "=========================================="
echo ""

echo -e "${YELLOW}[TEST] Checking current position status${NC}"
POSITIONS=$(curl -s "${BASE_URL}/api/v2/positions")
echo "$POSITIONS" | jq .
HAS_POSITION=$(echo "$POSITIONS" | jq '.positions | length > 0')

if [ "$HAS_POSITION" = "true" ]; then
    echo -e "${GREEN}✓ Position found${NC}"
    POSITION_SIZE=$(echo "$POSITIONS" | jq -r '.positions[0].size')
    POSITION_INSTRUMENT=$(echo "$POSITIONS" | jq -r '.positions[0].instrument_name')
    echo "Position: $POSITION_SIZE $POSITION_INSTRUMENT"
    echo ""
    
    echo -e "${YELLOW}[TEST] Checking strategy status${NC}"
    STATUS=$(curl -s "${BASE_URL}/api/strategy/status/v2")
    echo "$STATUS" | jq .
    STRATEGY_STATE=$(echo "$STATUS" | jq -r '.strategy.state')
    
    if [ "$STRATEGY_STATE" = "IDLE" ]; then
        echo -e "${RED}⚠ Strategy is IDLE - should be monitoring position${NC}"
    else
        echo -e "${GREEN}✓ Strategy state: $STRATEGY_STATE${NC}"
    fi
    echo ""
    
    echo -e "${YELLOW}[INSTRUCTION] To test auto-resume:${NC}"
    echo "1. Close the position manually via Deribit UI or:"
    echo "   curl -X POST ${BASE_URL}/api/v2/positions/close"
    echo "2. Watch backend logs for: '[Razor] ✅ Position closed - RESUMING strategy analysis'"
    echo "3. Verify strategy status changes from position_open → analyzing"
    echo "4. Verify cooldown is activated"
else
    echo -e "${RED}✗ No position found${NC}"
    echo ""
    echo -e "${YELLOW}[INSTRUCTION] To test auto-resume:${NC}"
    echo "1. Start a strategy with: POST /api/v2/start"
    echo "2. Wait for trade execution (check /api/strategy/status/v2)"
    echo "3. Position should auto-pause strategy (status: position_open)"
    echo "4. Close position (SL/TP or manual)"
    echo "5. Verify auto-resume triggers"
fi

echo ""
echo -e "${GREEN}Auto-resume code location:${NC}"
echo "File: backend/src/strategies/razor-executor.ts"
echo "Function: checkPositionAndResume()"
echo "Trigger: Called every tick when status='position_open'"
echo ""

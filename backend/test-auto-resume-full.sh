#!/bin/bash
# Test Auto-Resume Functionality
# Tests the complete flow: Start strategy → Trade → Close → Auto-resume

set -e

echo "════════════════════════════════════════════════════════"
echo "  AUTO-RESUME TEST SCRIPT"
echo "════════════════════════════════════════════════════════"
echo ""

BASE_URL="http://127.0.0.1:3000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Test 1: Check if backend is running
print_step "1. Checking backend status..."
if curl -s -f "$BASE_URL/health" > /dev/null 2>&1; then
    print_success "Backend is running"
else
    print_error "Backend is NOT running - start it first with: cd backend && npm run dev"
    exit 1
fi

# Test 2: Check connection status
print_step "2. Checking Deribit connection..."
CONNECTION=$(curl -s "$BASE_URL/api/connection/status")
CONNECTED=$(echo "$CONNECTION" | jq -r '.connection.connected // false')

if [ "$CONNECTED" = "true" ]; then
    ENV=$(echo "$CONNECTION" | jq -r '.connection.environment')
    print_success "Connected to Deribit ($ENV)"
else
    print_error "NOT connected to Deribit"
    echo "   Run: curl -X POST $BASE_URL/api/v2/connect -H 'Content-Type: application/json' -d '{\"environment\":\"live\"}'"
    exit 1
fi

# Test 3: Check current strategy status
print_step "3. Checking current strategy status..."
STRATEGY_STATUS=$(curl -s "$BASE_URL/api/strategy/status/v2")
IS_ACTIVE=$(echo "$STRATEGY_STATUS" | jq -r '.strategy.isActive // false')
STRATEGY_NAME=$(echo "$STRATEGY_STATUS" | jq -r '.strategy.name // "none"')
STATE=$(echo "$STRATEGY_STATUS" | jq -r '.strategy.state // "unknown"')

echo "   Strategy: $STRATEGY_NAME"
echo "   State: $STATE"
echo "   Active: $IS_ACTIVE"
echo ""

# Test 4: Check active strategies in state file
print_step "4. Checking state file for active strategies..."
if [ -f "/root/Tradebaas/state/backend-state.json" ]; then
    ACTIVE_STRATEGIES=$(cat /root/Tradebaas/state/backend-state.json | jq -r '.activeStrategies | length')
    echo "   Active strategies in state: $ACTIVE_STRATEGIES"
    
    if [ "$ACTIVE_STRATEGIES" -gt 0 ]; then
        cat /root/Tradebaas/state/backend-state.json | jq '.activeStrategies[]' | head -20
    fi
else
    print_warning "State file not found"
fi
echo ""

# Test 5: Check current positions
print_step "5. Checking current positions..."
POSITIONS=$(curl -s "$BASE_URL/api/v2/positions")
HAS_POSITION=$(echo "$POSITIONS" | jq -r '.positions[] | select(.size != 0) | .size' | head -1)

if [ -n "$HAS_POSITION" ]; then
    INSTRUMENT=$(echo "$POSITIONS" | jq -r '.positions[] | select(.size != 0) | .instrument_name' | head -1)
    SIZE=$(echo "$POSITIONS" | jq -r '.positions[] | select(.size != 0) | .size' | head -1)
    PNL=$(echo "$POSITIONS" | jq -r '.positions[] | select(.size != 0) | .floating_profit_loss' | head -1)
    print_warning "Position OPEN: $INSTRUMENT, Size: $SIZE, PnL: $PNL"
    echo ""
    
    # If position is open and strategy is active
    if [ "$IS_ACTIVE" = "true" ]; then
        print_warning "Strategy is paused (position open) - waiting for position to close..."
        echo ""
        echo "To test auto-resume:"
        echo "1. Close the position manually via Deribit"
        echo "2. Watch backend logs for: '[Razor] ✅ Position closed - RESUMING strategy analysis'"
        echo "3. Strategy should resume after 5 min cooldown"
        echo ""
        echo "Watch logs with: tail -f /root/Tradebaas/backend/logs/backend.log"
    else
        print_error "Position exists but NO strategy is running!"
        echo ""
        echo "This position was NOT created by the strategy."
        echo "Auto-resume will NOT work because there's no strategy to resume."
        echo ""
        echo "To fix: Start a strategy first, then let IT execute trades."
    fi
else
    print_success "No open positions"
    echo ""
    
    # If no position and strategy is active
    if [ "$IS_ACTIVE" = "true" ]; then
        print_success "Strategy is running and analyzing market"
        echo ""
        echo "Current status: $STATE"
        echo "Waiting for signal to execute trade..."
        echo ""
        echo "Watch logs with: tail -f /root/Tradebaas/backend/logs/backend.log"
    else
        print_warning "No strategy is running"
        echo ""
        echo "Start a strategy to test auto-resume:"
        echo ""
        echo "curl -X POST $BASE_URL/api/strategy/start \\"
        echo "  -H 'Content-Type: application/json' \\"
        echo "  -d '{"
        echo "    \"strategyName\": \"Razor\","
        echo "    \"instrument\": \"BTC_USDC-PERPETUAL\","
        echo "    \"environment\": \"live\","
        echo "    \"disclaimerAccepted\": true,"
        echo "    \"config\": {"
        echo "      \"candleInterval\": 60000,"
        echo "      \"cooldownMinutes\": 5"
        echo "    }"
        echo "  }'"
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "  TEST SUMMARY"
echo "════════════════════════════════════════════════════════"
echo ""

# Summary
if [ "$CONNECTED" = "true" ] && [ "$IS_ACTIVE" = "true" ]; then
    if [ -n "$HAS_POSITION" ]; then
        echo "Status: ✓ Strategy ACTIVE with OPEN position"
        echo "Action: Wait for position to close, watch for auto-resume"
    else
        echo "Status: ✓ Strategy ACTIVE and ANALYZING"
        echo "Action: Wait for signal, then position, then auto-resume test"
    fi
elif [ "$CONNECTED" = "true" ] && [ "$IS_ACTIVE" = "false" ]; then
    if [ -n "$HAS_POSITION" ]; then
        echo "Status: ✗ Position exists but NO strategy running (ORPHAN)"
        echo "Action: This is the BUG scenario - auto-resume can't work!"
    else
        echo "Status: ⚠ Connected but no strategy running"
        echo "Action: Start a strategy to begin testing"
    fi
else
    echo "Status: ✗ Not ready for testing"
    echo "Action: Connect to Deribit and start a strategy"
fi

echo ""
echo "════════════════════════════════════════════════════════"

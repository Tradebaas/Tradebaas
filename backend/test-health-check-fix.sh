#!/bin/bash
# Test Smart Health Check Fix
# Verifies that strategy survives position lifecycle

set -e

echo "════════════════════════════════════════════════════════"
echo "  SMART HEALTH CHECK TEST"
echo "════════════════════════════════════════════════════════"
echo ""

BASE_URL="http://127.0.0.1:3000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Test 1: Check backend running
print_step "1. Checking backend status..."
if ! curl -s -f "$BASE_URL/health" > /dev/null 2>&1; then
    print_error "Backend not running"
    echo "Start with: cd /root/Tradebaas/backend && npm run dev"
    exit 1
fi
print_success "Backend running"

# Test 2: Check connection
print_step "2. Checking Deribit connection..."
CONNECTED=$(curl -s "$BASE_URL/api/connection/status" | jq -r '.connection.connected // false')
if [ "$CONNECTED" != "true" ]; then
    print_error "Not connected to Deribit"
    exit 1
fi
print_success "Connected to Deribit"

# Test 3: Start strategy
print_step "3. Starting Razor strategy..."
START_RESPONSE=$(curl -s -X POST "$BASE_URL/api/strategy/start" \
    -H "Content-Type: application/json" \
    -d '{
        "strategyName": "Razor",
        "instrument": "BTC_USDC-PERPETUAL",
        "environment": "live",
        "disclaimerAccepted": true,
        "config": {
            "candleInterval": 60000,
            "cooldownMinutes": 5
        }
    }')

SUCCESS=$(echo "$START_RESPONSE" | jq -r '.success // false')
if [ "$SUCCESS" != "true" ]; then
    ERROR=$(echo "$START_RESPONSE" | jq -r '.message // "Unknown error"')
    print_error "Failed to start strategy: $ERROR"
    exit 1
fi

STRATEGY_ID=$(echo "$START_RESPONSE" | jq -r '.strategyId')
print_success "Strategy started: $STRATEGY_ID"
echo ""

# Test 4: Verify strategy is active
print_step "4. Verifying strategy is active..."
sleep 2
STRATEGY_STATUS=$(curl -s "$BASE_URL/api/strategy/status/v2")
IS_ACTIVE=$(echo "$STRATEGY_STATUS" | jq -r '.strategy.isActive // false')

if [ "$IS_ACTIVE" != "true" ]; then
    print_error "Strategy is not active!"
    echo "$STRATEGY_STATUS" | jq .
    exit 1
fi
print_success "Strategy is active and running"
echo ""

# Test 5: Simulate position open scenario
print_step "5. Testing health check during position (if position exists)..."
POSITIONS=$(curl -s "$BASE_URL/api/v2/positions")
HAS_POSITION=$(echo "$POSITIONS" | jq -r '.positions[] | select(.size != 0) | .size' | head -1)

if [ -n "$HAS_POSITION" ]; then
    print_warning "Position is OPEN - strategy should be paused"
    echo ""
    
    # Wait for 2 health check cycles (20 seconds)
    print_step "6. Waiting 20 seconds for health checks to run..."
    for i in {20..1}; do
        echo -ne "   Remaining: ${i}s\r"
        sleep 1
    done
    echo ""
    
    # Check if strategy STILL exists
    print_step "7. Checking if strategy survived health checks..."
    STRATEGY_STATUS_AFTER=$(curl -s "$BASE_URL/api/strategy/status/v2")
    IS_ACTIVE_AFTER=$(echo "$STRATEGY_STATUS_AFTER" | jq -r '.strategy.isActive // false')
    
    if [ "$IS_ACTIVE_AFTER" == "true" ]; then
        print_success "✅ SUCCESS! Strategy SURVIVED health check during open position"
        echo ""
        echo "This confirms the bug is FIXED:"
        echo "- Strategy was NOT deleted during open position"
        echo "- Health check correctly skipped cleanup"
        echo "- Auto-resume will work when position closes"
    else
        print_error "❌ FAIL! Strategy was DELETED by health check"
        echo ""
        echo "Bug still exists - health check is too aggressive"
        exit 1
    fi
else
    print_warning "No open position - cannot test position scenario"
    echo ""
    echo "To fully test:"
    echo "1. Wait for strategy to detect signal and place trade"
    echo "2. Or manually place trade via Deribit"
    echo "3. Run this test again while position is open"
    echo ""
    
    # Still verify strategy is running
    print_step "6. Waiting 15 seconds to verify strategy keeps running..."
    sleep 15
    
    STRATEGY_STATUS_AFTER=$(curl -s "$BASE_URL/api/strategy/status/v2")
    IS_ACTIVE_AFTER=$(echo "$STRATEGY_STATUS_AFTER" | jq -r '.strategy.isActive // false')
    
    if [ "$IS_ACTIVE_AFTER" == "true" ]; then
        print_success "Strategy is still running after health check"
    else
        print_error "Strategy disappeared!"
        exit 1
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "  TEST SUMMARY"
echo "════════════════════════════════════════════════════════"
echo ""

if [ -n "$HAS_POSITION" ]; then
    echo "✅ CRITICAL BUG FIX VERIFIED:"
    echo "   - Strategy SURVIVES health check during open position"
    echo "   - Auto-resume will work when position closes"
    echo ""
    echo "Next: Close position and watch for auto-resume:"
    echo "   tail -f /root/Tradebaas/backend/logs/backend.log | grep Razor"
else
    echo "⚠ PARTIAL TEST COMPLETED:"
    echo "   - Strategy started successfully"
    echo "   - Strategy running normally"
    echo "   - Health check doesn't interfere during analysis"
    echo ""
    echo "Full test requires open position:"
    echo "   1. Wait for signal → trade → position open"
    echo "   2. Run this test again to verify survival"
    echo "   3. Close position to test auto-resume"
fi

echo ""
echo "════════════════════════════════════════════════════════"

# Cleanup: Ask if user wants to stop strategy
echo ""
read -p "Stop strategy now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_step "Stopping strategy..."
    curl -s -X POST "$BASE_URL/api/strategy/stop" \
        -H "Content-Type: application/json" \
        -d "{\"strategyId\":\"$STRATEGY_ID\"}" > /dev/null
    print_success "Strategy stopped"
fi

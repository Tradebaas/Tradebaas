# API Reference - Tradebaas Backend

**Complete REST API Documentation**

Base URL (Production): `https://app.tradebazen.nl/api`  
Base URL (Local): `http://localhost:3000`

---

## 📋 Table of Contents

1. [Health & Status](#health--status)
2. [Strategy Management](#strategy-management)
3. [Analysis & Metrics](#analysis--metrics)
4. [Emergency Controls](#emergency-controls)
5. [Error Responses](#error-responses)

---

## Health & Status

### GET /health

Check backend service health.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1730643123000,
  "uptime": 12345,
  "version": "1.0.0"
}
```

**Status Codes:**
- `200 OK` - Service healthy
- `503 Service Unavailable` - Service unhealthy

**Example:**
```bash
curl https://app.tradebazen.nl/api/health
```

---

## Strategy Management

### GET /api/strategy/status

Get current strategy status.

**Response:**
```json
{
  "active": true,
  "strategy": {
    "id": "strategy-1762180359724",
    "name": "Razor",
    "status": "analyzing",
    "startTime": 1730642359724,
    "instrument": "BTC_USDC-PERPETUAL",
    "environment": "live"
  },
  "config": {
    "riskMode": "percent",
    "riskValue": 5,
    "stopLossPercent": 0.5,
    "takeProfitPercent": 1.0,
    "maxDailyTrades": 10,
    "cooldownMinutes": 15
  },
  "connection": {
    "status": "connected",
    "websocket": "active",
    "lastTicker": 1730643120000
  }
}
```

**Status Values:**
- `initializing` - Loading historical data (< 20 candles)
- `analyzing` - Monitoring market, evaluating signals
- `signal-detected` - Entry conditions met, preparing trade
- `in-position` - Active trade open
- `cooldown` - Waiting after position close

**Status Codes:**
- `200 OK` - Strategy status retrieved
- `404 Not Found` - No active strategy

**Example:**
```bash
curl https://app.tradebazen.nl/api/strategy/status | jq .
```

---

### POST /api/strategy/start

Start automated trading strategy.

**Request Body:**
```json
{
  "strategyName": "Razor",
  "instrument": "BTC_USDC-PERPETUAL",
  "environment": "live",
  "config": {
    "riskMode": "percent",
    "riskValue": 5,
    "stopLossPercent": 0.5,
    "takeProfitPercent": 1.0,
    "maxDailyTrades": 10,
    "cooldownMinutes": 15
  },
  "credentials": {
    "apiKey": "your_deribit_key",
    "apiSecret": "your_deribit_secret"
  }
}
```

**Response:**
```json
{
  "success": true,
  "strategyId": "strategy-1762180359724",
  "message": "Strategy started successfully",
  "initialStatus": "initializing"
}
```

**Validation:**
- `strategyName` - Must be valid strategy ("Razor")
- `instrument` - Must be valid Deribit instrument
- `environment` - "live" or "testnet"
- `riskValue` - 1-10 for percent mode, >0 for fixed
- `stopLossPercent` - 0.1-10 (0.1% to 10%)
- `takeProfitPercent` - Must be > stopLossPercent

**Status Codes:**
- `200 OK` - Strategy started
- `400 Bad Request` - Invalid parameters
- `409 Conflict` - Strategy already running
- `401 Unauthorized` - Invalid credentials

**Example:**
```bash
curl -X POST https://app.tradebazen.nl/api/strategy/start \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "Razor",
    "instrument": "BTC_USDC-PERPETUAL",
    "environment": "live",
    "config": {
      "riskMode": "percent",
      "riskValue": 5,
      "stopLossPercent": 0.5,
      "takeProfitPercent": 1.0
    },
    "credentials": {
      "apiKey": "YOUR_KEY",
      "apiSecret": "YOUR_SECRET"
    }
  }'
```

---

### POST /api/strategy/stop

Stop running strategy gracefully.

**Request Body:**
```json
{
  "immediate": false
}
```

**Parameters:**
- `immediate` (optional) - If true, stops immediately. If false (default), waits for current position to close.

**Response:**
```json
{
  "success": true,
  "message": "Strategy stopped",
  "finalStatus": "stopped",
  "openPosition": false
}
```

**Status Codes:**
- `200 OK` - Strategy stopped
- `404 Not Found` - No active strategy
- `409 Conflict` - Cannot stop (open position, use /api/killswitch)

**Example:**
```bash
# Graceful stop
curl -X POST https://app.tradebazen.nl/api/strategy/stop

# Immediate stop (with open position warning)
curl -X POST https://app.tradebazen.nl/api/strategy/stop \
  -H "Content-Type: application/json" \
  -d '{"immediate": true}'
```

---

## Analysis & Metrics

### GET /api/strategy/analysis/:strategyId

Get real-time analysis state with indicators and checkpoints.

**Path Parameters:**
- `strategyId` - Strategy ID from /api/strategy/status

**Response:**
```json
{
  "strategyId": "strategy-1762180359724",
  "timestamp": 1730643120000,
  "analysis": {
    "status": "analyzing",
    "dataPoints": 105,
    "currentPrice": 107843.5,
    "indicators": {
      "emaFast": 107742.97,
      "emaSlow": 107707.97,
      "rsi": 61.3,
      "volatility": 0.0012,
      "momentum": 0.0008
    },
    "checkpoints": [
      {
        "id": 1,
        "label": "RSI Oversold/Overbought",
        "status": "pending",
        "description": "RSI: 61.3 (need <30 or >70)"
      },
      {
        "id": 2,
        "label": "Volatiliteit binnen bereik",
        "status": "met",
        "description": "Volatility: 0.12% (range: 0.1%-2%)"
      },
      {
        "id": 3,
        "label": "EMA Trend richting",
        "status": "met",
        "description": "Bullish trend (Fast $107742.97 > Slow $107707.97)"
      },
      {
        "id": 4,
        "label": "Prijs momentum",
        "status": "met",
        "description": "Momentum: +0.08% (>0.1% threshold)"
      }
    ],
    "signals": {
      "long": 45,
      "short": 12
    },
    "nextAction": null
  }
}
```

**Checkpoint Status:**
- `met` - ✅ Condition satisfied
- `pending` - ⏳ Waiting for condition

**Signal Scores:**
- 0-30: Weak signal
- 30-50: Moderate signal
- 50-70: Strong signal
- 70-100: Very strong signal (trade threshold)

**Next Action (when signal >70):**
```json
{
  "type": "LONG",
  "confidence": 85,
  "entry": 107843.5,
  "stopLoss": 107303.5,
  "takeProfit": 108923.5,
  "riskReward": 2.0
}
```

**Status Codes:**
- `200 OK` - Analysis retrieved
- `404 Not Found` - Strategy not found or not analyzing

**Example:**
```bash
curl https://app.tradebazen.nl/api/strategy/analysis/strategy-1762180359724 | jq .
```

---

### GET /api/strategy/metrics/:strategyId

Get performance metrics for running strategy.

**Response:**
```json
{
  "strategyId": "strategy-1762180359724",
  "runtime": {
    "startTime": 1730642359724,
    "uptime": 7200000,
    "uptimeFormatted": "2h 0m"
  },
  "trades": {
    "total": 5,
    "wins": 3,
    "losses": 2,
    "winRate": 60,
    "currentStreak": 1
  },
  "performance": {
    "totalPnL": 150.50,
    "totalPnLPercent": 1.5,
    "averageWin": 80.25,
    "averageLoss": -35.00,
    "largestWin": 120.00,
    "largestLoss": -50.00,
    "profitFactor": 2.29
  },
  "risk": {
    "maxDrawdown": -50.00,
    "maxDrawdownPercent": -0.5,
    "sharpeRatio": null,
    "dailyTradesUsed": 5,
    "dailyTradesLimit": 10
  },
  "market": {
    "instrument": "BTC_USDC-PERPETUAL",
    "currentPrice": 107843.5,
    "ticksReceived": 7200,
    "candlesBuilt": 120,
    "avgTickLatency": 75
  }
}
```

**Status Codes:**
- `200 OK` - Metrics retrieved
- `404 Not Found` - Strategy not found

**Example:**
```bash
curl https://app.tradebazen.nl/api/strategy/metrics/strategy-1762180359724 | jq .
```

---

## Emergency Controls

### POST /api/killswitch

**⚠️ EMERGENCY STOP - Immediately halt all trading**

Stops strategy, cancels all orders, closes WebSocket connection.

**Request Body:**
```json
{
  "reason": "Manual intervention required"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Kill switch activated",
  "actions": [
    "Strategy stopped",
    "WebSocket disconnected",
    "State persisted"
  ],
  "timestamp": 1730643200000
}
```

**⚠️ WARNING:** 
- Does NOT close open positions
- Only stops new trades and disconnects
- Manually close positions via Deribit if needed

**Status Codes:**
- `200 OK` - Kill switch activated
- `404 Not Found` - No active strategy

**Example:**
```bash
curl -X POST https://app.tradebazen.nl/api/killswitch \
  -H "Content-Type: application/json" \
  -d '{"reason": "Market volatility too high"}'
```

---

## Error Responses

### Standard Error Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PARAMS",
    "message": "Stop loss percent must be between 0.1 and 10",
    "details": {
      "field": "stopLossPercent",
      "value": 15,
      "expected": "0.1 - 10"
    }
  },
  "timestamp": 1730643123000
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_PARAMS` | 400 | Invalid request parameters |
| `STRATEGY_EXISTS` | 409 | Strategy already running |
| `STRATEGY_NOT_FOUND` | 404 | No active strategy |
| `AUTH_FAILED` | 401 | Deribit authentication failed |
| `INSUFFICIENT_BALANCE` | 402 | Not enough funds |
| `WEBSOCKET_ERROR` | 503 | WebSocket connection failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limits

**Current Limits:**
- Strategy start/stop: 10 requests per minute
- Analysis endpoint: 100 requests per minute
- Kill switch: No limit (emergency use)

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1730643180
```

---

## WebSocket (Future)

**Status:** Not yet implemented. Use polling for now.

**Planned Endpoints:**
```
ws://localhost:3000/ws/strategy/:strategyId
- Real-time analysis updates
- Ticker events
- Trade notifications
```

---

## Authentication

**Current:** API is open (internal use only)

**Future:** JWT tokens with:
```
Authorization: Bearer <jwt_token>
```

---

## Examples

### Complete Trading Flow

```bash
#!/bin/bash

# 1. Check backend health
curl https://app.tradebazen.nl/api/health

# 2. Start strategy
STRATEGY_ID=$(curl -s -X POST https://app.tradebazen.nl/api/strategy/start \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "Razor",
    "instrument": "BTC_USDC-PERPETUAL",
    "environment": "live",
    "config": {
      "riskMode": "percent",
      "riskValue": 5,
      "stopLossPercent": 0.5,
      "takeProfitPercent": 1.0
    },
    "credentials": {
      "apiKey": "'$DERIBIT_KEY'",
      "apiSecret": "'$DERIBIT_SECRET'"
    }
  }' | jq -r '.strategyId')

echo "Strategy ID: $STRATEGY_ID"

# 3. Monitor status
watch -n 3 "curl -s https://app.tradebazen.nl/api/strategy/status | jq ."

# 4. Check analysis
curl https://app.tradebazen.nl/api/strategy/analysis/$STRATEGY_ID | jq '.analysis.checkpoints'

# 5. Get metrics
curl https://app.tradebazen.nl/api/strategy/metrics/$STRATEGY_ID | jq '.performance'

# 6. Stop strategy
curl -X POST https://app.tradebazen.nl/api/strategy/stop
```

### Monitor Checkpoints

```bash
#!/bin/bash
STRATEGY_ID="strategy-1762180359724"

while true; do
  clear
  echo "=== Razor Strategy Checkpoints ==="
  echo ""
  
  curl -s https://app.tradebazen.nl/api/strategy/analysis/$STRATEGY_ID \
    | jq -r '.analysis.checkpoints[] | "[\(.status | if . == "met" then "✅" else "⏳" end)] \(.label): \(.description)"'
  
  echo ""
  echo "Signal Scores:"
  curl -s https://app.tradebazen.nl/api/strategy/analysis/$STRATEGY_ID \
    | jq '.analysis.signals'
  
  sleep 3
done
```

---

**Version:** 1.0.0  
**Last Updated:** November 3, 2025  
**Base URL:** https://app.tradebazen.nl/api  

For implementation details, see: `backend/src/api.ts`, `backend/src/strategy-service.ts`

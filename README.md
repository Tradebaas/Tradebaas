# Tradebaas - 24/7 Automated Crypto Trading Platform

**Production-Ready MVP with Backend Strategy Execution**

A professional, automated trading platform for Deribit crypto derivatives with 24/7 backend execution, real-time technical analysis, and glassmorphism design.

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React 19)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Strategy  │  │    Live     │  │  Position   │          │
│  │  Dashboard  │  │  Analysis   │  │  Monitor    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│         │                 │                 │                 │
│         └─────────────────┴─────────────────┘                │
│                           │                                   │
│                    REST API Polling                           │
│                    (3s intervals)                             │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                  BACKEND (Node.js + Fastify)                 │
│  ┌──────────────────────────────────────────────────────────┐│
│  │            Strategy Service (24/7)                       ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        ││
│  │  │   Razor    │  │   State    │  │ Credentials│        ││
│  │  │  Executor  │  │  Manager   │  │  Manager   │        ││
│  │  └────────────┘  └────────────┘  └────────────┘        ││
│  └──────────────────────────────────────────────────────────┘│
│                           │                                   │
│                    WebSocket (Live)                           │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    DERIBIT API (Live)                         │
│  • WebSocket: Real-time market data (ticker subscriptions)   │
│  • REST API: Historical candles + Order execution            │
│  • Instrument: BTC_USDC-PERPETUAL                            │
└───────────────────────────────────────────────────────────────┘
```

See `ARCHITECTURE_OVERVIEW.md` for detailed system design.

## 🚀 Quick Start

```bash
# Backend (Terminal 1)
cd backend
npm install
cp .env.example .env  # Add your Deribit API keys
npm start

# Frontend (Terminal 2)
npm install
npm run dev

# Open: http://localhost:5173
```

## 📊 Current Features

### ✅ Backend (24/7 Execution)
- Persistent strategy execution (survives server restarts)
- WebSocket market data streaming
- Historical candle loading (100x 1-min on startup)
- Real-time technical analysis (EMA, RSI, Volatility, Momentum)
- State persistence (JSON)
- systemd service integration

### ✅ Razor Strategy
**Entry Conditions (All Required):**
- Volatility: 0.1% - 2.0%
- RSI: <30 (oversold) or >70 (overbought)
- EMA: Trend confirmation (9 vs 21 period)
- Momentum: >0.1% movement (5 candles)

**Risk Management:**
- Stop Loss: 0.5%
- Take Profit: 1.0%
- Max Daily Trades: 10
- Cooldown: 15 minutes

### ✅ Frontend
- Real-time strategy monitoring (3s polling)
- Live analysis dialog (checkpoints, indicators, signals)
- Position tracking
- Compact minimalist UI (no scrolling needed)
- Robust error handling (timeouts, retries)

## 📡 API Endpoints

```bash
# Strategy Management
GET  /api/strategy/status
POST /api/strategy/start
POST /api/strategy/stop
POST /api/killswitch

# Analysis & Metrics
GET /api/strategy/analysis/:strategyId
GET /api/strategy/metrics/:strategyId

# Health
GET /health
```

See `TECHNICAL_DOCS.md` for complete API reference.

## �� Configuration

### Backend Environment (.env)

```bash
# Deribit API
DERIBIT_API_KEY=your_key_here
DERIBIT_API_SECRET=your_secret_here

# Server
PORT=3000
NODE_ENV=production
```

### Strategy Config (JSON)

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
  }
}
```

## 🎯 Strategy Checkpoints

Live monitoring shows 4 technical checkpoints:

1. **⏳ Volatiliteit binnen bereik**: 0.1% - 2% (prevents low-volatility false signals)
2. **⏳/✅ RSI Oversold/Overbought**: <30 or >70 (extreme market conditions)
3. **✅ EMA Trend richting**: Bullish (Fast > Slow) or Bearish (Fast < Slow)
4. **⏳/✅ Prijs momentum**: >0.1% movement (confirms trend strength)

**Trade executes when**: All 4 checkpoints ✅ AND signal strength >70%

## �� Performance Metrics

### Backend
- **Startup**: <2s (includes 100 candle load)
- **Memory**: ~60 MB
- **CPU**: <5% idle, <20% active
- **WebSocket Latency**: <100ms
- **Candle Processing**: ~1s for 100 candles

### Frontend
- **Bundle**: 703 KB (197 KB gzipped)
- **First Paint**: <1s
- **Polling Overhead**: Minimal (<1% CPU)

## 🔐 Security

- **Credentials**: Encrypted at rest (AES-GCM 256-bit)
- **Transport**: HTTPS only (production)
- **API Keys**: Never committed to git
- **Permissions**: Read + Trade only (no withdraw)
- **State**: JSON persistence (no sensitive data)

See `SECURITY.md` for complete security guidelines.

## 🐛 Troubleshooting

### Backend Won't Start

```bash
sudo systemctl status tradebaas-backend
sudo journalctl -u tradebaas-backend -n 100
curl http://127.0.0.1:3000/health
```

### Strategy Not Trading

```bash
# Check status
curl http://127.0.0.1:3000/api/strategy/status | jq .

# Check checkpoints
curl http://127.0.0.1:3000/api/strategy/analysis/[ID] | jq '.analysis.checkpoints'

# Watch logs
sudo journalctl -u tradebaas-backend -f
```

### Common Issues

- **Empty JSON errors (frontend)**: Network timing, handled gracefully ✅
- **404 on strategy endpoints**: No active strategy, start via UI ✅
- **WebSocket disconnect**: Auto-reconnects on backend restart ✅

## 📚 Documentation

| Document | Description |
|----------|-------------|
| `README.md` | **This file** - Quick start guide |
| `ARCHITECTURE_OVERVIEW.md` | System design & data flow |
| `DEPLOYMENT.md` | Production deployment (systemd, Nginx, SSL) |
| `TECHNICAL_DOCS.md` | API specs & code architecture |
| `RISK_ENGINE.md` | Risk management & position sizing |
| `TESTING.md` | Test procedures & coverage |
| `SECURITY.md` | Security best practices |
| `backend/README.md` | Backend-specific setup |

## ⚠️ Disclaimer

**CRYPTOCURRENCY TRADING INVOLVES SUBSTANTIAL RISK OF LOSS.**

- Software provided AS-IS without warranties
- No guarantee of profits
- User assumes all trading risks
- Start with Testnet and small positions
- Never trade funds you can't afford to lose

**USE AT YOUR OWN RISK.**

---

**Version**: 1.0.0 Production  
**Last Updated**: November 3, 2025  
**Status**: ✅ Live Trading Active

Built for algorithmic trading with ❤️

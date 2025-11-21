# Trading Backend Foundation

Multi-broker architecture for crypto exchange integration with leverage trading support.

## Structure

# Tradebaas Backend - 24/7 Trading Service

**Production-ready Node.js backend with automated strategy execution**

## 🏗️ Architecture

```
backend/
├── src/
│   ├── server.ts                   # Fastify server + systemd entry
│   ├── api.ts                      # REST API routes
│   ├── config.ts                   # Environment configuration
│   ├── deribit-client.ts           # WebSocket + REST client
│   ├── strategy-service.ts         # Strategy lifecycle manager
│   ├── state-manager.ts            # JSON persistence
│   ├── credentials-manager.ts      # Encrypted credentials
│   ├── strategies/
│   │   └── razor-executor.ts       # Razor strategy implementation
│   ├── types/
│   │   └── strategy.ts             # Type definitions
│   └── brokers/                    # (Legacy - not in use)
├── dist/                           # Compiled JavaScript
├── backend-state.json              # Strategy persistence
└── tests/                          # Unit + integration tests
```

## 🚀 Current Status

**Production Deployment:**
- Service: `tradebaas-backend.service` (systemd)
- Port: 3000 (localhost only)
- Environment: Live trading on Deribit
- Uptime: Continuous since November 3, 2025

**Active Strategy:**
- Name: Razor
- Instrument: BTC_USDC-PERPETUAL
- Status: Analyzing (3/4 checkpoints met)
- Data: 100+ candles loaded, live streaming

## 📦 Installation

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Deribit credentials

# Build (if needed)
npm run build

# Run development
npm run dev

# Run production
npm start
```

## 🔑 Key Components

### DeribitClient (deribit-client.ts)

WebSocket + REST API client for Deribit.

**Features:**
- WebSocket connection management
- Ticker subscriptions
- Historical candle fetching
- Order execution
- Auto-reconnect on disconnect

**Methods:**
```typescript
connect(credentials): Promise<void>
subscribeTicker(instrument, callback): Promise<void>
getCandles(instrument, resolution, count): Promise<CandleData>
sendRequest(method, params): Promise<any>
```

### StrategyService (strategy-service.ts)

Manages strategy lifecycle and executor instances.

**Responsibilities:**
- Start/stop strategies
- Pass market data to executors
- Handle WebSocket callbacks
- Persist state

**Current Strategy:** Razor executor monitoring BTC_USDC-PERPETUAL

### RazorExecutor (strategies/razor-executor.ts)

Mean-reversion strategy with technical analysis.

**Technical Indicators:**
- EMA (9/21 periods)
- RSI (14 periods)
- Volatility (standard deviation)
- Momentum (5 candle change)

**Entry Logic:**
- All 4 checkpoints must be met
- Signal strength >70 (0-100 scale)
- Risk/reward: 1:2 (0.5% SL, 1% TP)

**See:** `/STRATEGY_DETAILS.md` for complete documentation

### StateManager (state-manager.ts)

JSON-based state persistence.

**Persists:**
- Active strategy ID
- Strategy configuration
- Current status
- Start time

**File:** `/root/tradebaas/backend-state.json`

**Auto-resume:** Strategy resumes after backend restarts

## 📡 API Endpoints

**Complete API documentation:** `/API_REFERENCE.md`

### Strategy Management

```bash
GET  /api/strategy/status         # Get current strategy
POST /api/strategy/start          # Start trading
POST /api/strategy/stop           # Stop trading
POST /api/killswitch              # Emergency stop
```

### Analysis & Metrics

```bash
GET /api/strategy/analysis/:id    # Real-time analysis
GET /api/strategy/metrics/:id     # Performance metrics
```

### Health

```bash
GET /health                       # Backend health check
```

## 🔧 Environment Variables

```bash
# Deribit API
DERIBIT_API_KEY=your_live_key
DERIBIT_API_SECRET=your_live_secret
DERIBIT_ENVIRONMENT=live

# Server
PORT=3000
NODE_ENV=production
```

**⚠️ Security:** Never commit credentials to git

## 🏃‍♂️ Running in Production

### systemd Service

**File:** `/etc/systemd/system/tradebaas-backend.service`

```bash
# Start service
sudo systemctl start tradebaas-backend

# Stop service
sudo systemctl stop tradebaas-backend

# Restart service
sudo systemctl restart tradebaas-backend

# Check status
sudo systemctl status tradebaas-backend

# View logs
sudo journalctl -u tradebaas-backend -f
```

### Manual Start

```bash
cd /root/tradebaas/backend
tsx watch --clear-screen=false src/server.ts
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test
npm test deribit-broker

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## 📊 Performance

**Current Stats:**
- Startup: <2 seconds
- Memory: ~60 MB
- CPU: <5% idle, <20% active
- WebSocket latency: <100ms
- Candle processing: ~1s for 100 candles

## 🐛 Troubleshooting

### Backend Won't Start

```bash
# Check logs
sudo journalctl -u tradebaas-backend -n 100

# Check port
sudo netstat -tlnp | grep 3000

# Kill conflicting process
sudo pkill -f tsx

# Restart
sudo systemctl restart tradebaas-backend
```

### WebSocket Issues

```bash
# Check connection in logs
sudo journalctl -u tradebaas-backend -f | grep -E "(WebSocket|subscription)"

# Verify credentials
cat /root/tradebaas/backend/.env

# Test Deribit API
curl -X POST https://www.deribit.com/api/v2/public/test
```

### Strategy Not Trading

```bash
# Check strategy status
curl http://127.0.0.1:3000/api/strategy/status | jq .

# Check checkpoints
curl http://127.0.0.1:3000/api/strategy/analysis/[ID] | jq '.analysis.checkpoints'

# Watch live logs
sudo journalctl -u tradebaas-backend -f | grep Razor
```

## 📚 Documentation

| Document | Description |
|----------|-------------|
| `/README.md` | Main project overview |
| `/API_REFERENCE.md` | **Complete API specs** |
| `/STRATEGY_DETAILS.md` | **Razor strategy deep-dive** |
| `/PRODUCTION_DEPLOYMENT.md` | **Production setup guide** |
| `/TECHNICAL_DOCS.md` | Technical architecture |
| `/backend/README.md` | **This file** |

## 🔄 Development Workflow

```bash
# 1. Make changes to src/
vim src/strategy-service.ts

# 2. Restart backend
sudo systemctl restart tradebaas-backend

# 3. Verify logs
sudo journalctl -u tradebaas-backend -f --since "1 minute ago"

# 4. Check health
curl http://127.0.0.1:3000/health

# 5. Test API
curl http://127.0.0.1:3000/api/strategy/status | jq .
```

## 🚧 Future Enhancements

**Phase 2:**
- [ ] Multiple concurrent strategies
- [ ] WebSocket API for frontend
- [ ] Advanced backtesting
- [ ] ML-based signal scoring
- [ ] Multi-broker support
- [ ] Portfolio management

---

**Version:** 1.0.0 Production  
**Last Updated:** November 3, 2025  
**Status:** ✅ Live & Running  

For questions, see: `/TECHNICAL_DOCS.md` or `/API_REFERENCE.md`

## 🚀 Current Status

**Production Deployment:**
- Service: `tradebaas-backend.service` (systemd)
- Port: 3000 (localhost only)
- Environment: Live trading on Deribit
- Uptime: Continuous since November 3, 2025

**Active Strategy:**
- Name: Razor
- Instrument: BTC_USDC-PERPETUAL
- Status: Analyzing (3/4 checkpoints met)
- Data: 100+ candles loaded, live streaming

## 📦 Installation

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Deribit credentials

# Build (if needed)
npm run build

# Run development
npm run dev

# Run production
npm start
```

## Supported Brokers

All 15 brokers in whitelist:

1. **Deribit** (fully implemented) - Options & perpetuals
2. **Binance** - Max 125x leverage
3. **Bybit** - Max 100x leverage
4. **OKX** - Max 125x leverage
5. **Kraken** - Max 5x leverage
6. **Bitget** - Max 125x leverage
7. **KuCoin** - Max 100x leverage
8. **MEXC** - Max 200x leverage
9. **Gate.io** - Max 100x leverage
10. **BitMEX** - Max 100x leverage
11. **Huobi** - Max 125x leverage
12. **Phemex** - Max 100x leverage
13. **Coinbase Advanced** - Spot only
14. **Bitstamp** - Spot only
15. **Bitfinex** - Max 10x leverage

## IBroker Interface

Unified interface for all brokers:

### Connection
- `connect(credentials)` - Authenticate with broker
- `disconnect()` - Close connection
- `getConnectionStatus()` - Get current status

### Trading
- `placeOrder(params)` - Place order with optional OTOCO (TP/SL)
- `cancelOrder(orderId, instrument)` - Cancel single order
- `cancelAllOrders(instrument?)` - Cancel all orders
- `getOrder(orderId, instrument)` - Get order status

### Data
- `getBalance(currency?)` - Fetch account balance
- `getCandles(instrument, timeframe, limit)` - Get historical candles
- `getInstrumentInfo(instrument)` - Get trading constraints

### WebSocket
- `subscribeTrades(instrument, callback)` - Subscribe to trades
- `subscribeOrders(instrument, callback)` - Subscribe to order updates
- `unsubscribe(channel)` - Unsubscribe from channel

## API Endpoints

### GET /brokers
Returns list of 15 supported brokers with metadata:
```json
{
  "success": true,
  "brokers": [
    {
      "id": "deribit",
      "name": "Deribit",
      "logo": "/brokers/deribit.svg",
      "maxLeverage": 50,
      "supportedPairs": ["BTC_USDC-PERPETUAL", ...],
      "docsURL": "https://docs.deribit.com",
      "features": {
        "spot": false,
        "futures": true,
        "perpetuals": true,
        "options": true,
        "websocket": true
      },
      "testnetAvailable": true
    },
    ...
  ]
}
```

### POST /connect
Test credentials and establish connection:
```json
{
  "brokerId": "deribit",
  "credentials": {
    "apiKey": "...",
    "apiSecret": "...",
    "testnet": false
  }
}
```

Response:
```json
{
  "success": true,
  "brokerId": "deribit",
  "message": "Connection successful"
}
```

## Environment Variables

Credentials per broker (example for Deribit):
```
DERIBIT_API_KEY=your_api_key
DERIBIT_API_SECRET=your_api_secret
```

Same pattern for other brokers: `{BROKER}_API_KEY` and `{BROKER}_API_SECRET`.

## Strategy Runner Service (24/7)

The Strategy Runner Service enables automated trading by executing DSL-based strategies continuously. See `/backend/src/strategy-runner/README.md` for detailed documentation.

### Features

- **Candle Aggregation**: Pulls 1-minute candles and aggregates to 5m/15m/1h/4h
- **DSL Strategies**: JSON-based strategy configuration with rules
- **Risk Engine**: Position sizing with percent/fixed risk (≤50x leverage)
- **OTOCO Orders**: Automated stop-loss and take-profit brackets
- **State Persistence**: JSON-based bracket state storage
- **24/7 Execution**: Runs every minute when no open position

### REST Endpoints

#### Load Strategy
```json
POST /strategy/load
{
  "config": { /* StrategyConfig */ },
  "brokerId": "deribit"
}
```

#### Start Runner
```json
POST /strategy/start
```

#### Stop Runner
```json
POST /strategy/stop
```

#### Get Status
```json
GET /strategy/status
```

### Example Strategy

```json
{
  "id": "ema-rsi-scalper",
  "instrument": "BTC_USDC-PERPETUAL",
  "timeframe": "5m",
  "rules": [
    {
      "type": "indicator",
      "indicator": "ema",
      "condition": "crossover"
    },
    {
      "type": "indicator",
      "indicator": "rsi",
      "condition": "oversold",
      "value": 30
    }
  ],
  "risk": {
    "mode": "percent",
    "value": 2,
    "maxLeverage": 10
  },
  "stopLoss": { "type": "percent", "value": 1.5 },
  "takeProfit": { "type": "risk_reward", "value": 2 }
}
```

See `/backend/strategies/` for pre-configured examples.

## Configuration

See `config.ts` for:
- `BROKER_WHITELIST` - All 15 supported brokers
- Retry/backoff settings
- WebSocket reconnect parameters
- Rate limiting

## Running Tests

```bash
npm test backend/tests
```

Tests cover:
- Deribit connection flow
- Order placement (simple & OTOCO)
- Balance fetching
- Instrument info
- API endpoint responses

## Implementation Status

- ✅ **Deribit**: Fully implemented with OTOCO support
- 🚧 **Others**: Stub implementations (throw "not yet implemented")

## Next Steps

Phase 2 will add:
- Retry logic with exponential backoff
- WebSocket auto-reconnect
- Instrument cache
- Telemetry hooks

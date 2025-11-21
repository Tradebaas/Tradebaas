# Trade History System

Complete persistent trade tracking voor Tradebaas met SQLite database en real-time UI updates.

## Overzicht

Het trade history systeem registreert ALLE trades van begin tot eind, inclusief:
- Entry/exit prices en timestamps
- SL/TP order IDs (OTOCO tracking)
- Exit reason detection (SL hit / TP hit / manual close)
- PnL berekening (absolute + percentage)
- Strategy attribution
- Orphan order cleanup

## Architectuur

### Backend Components

```
services/
├── ITradeHistoryStore.ts      # Interface voor storage backends
├── KvTradeHistoryStore.ts     # In-memory implementation (development)
├── SqlTradeHistoryStore.ts    # SQLite implementation (production)
└── trade-history.ts           # Service layer met singleton pattern
```

### Storage Backends

**KV Store (in-memory):**
- ✅ Snel, eenvoudig
- ❌ Data verloren bij restart
- 🎯 Voor: Development, testing

**SQL Store (SQLite):**
- ✅ Persistent, queryable
- ✅ Indexed voor performance
- ✅ WAL mode voor concurrency
- 🎯 Voor: Production, analytics

### Configuration

Set via environment variable:

```bash
# .env file
DB_PROVIDER=sql                    # Use SQLite (default: kv)
TRADE_DB_PATH=../state/trades.db  # Database location
```

## Database Schema

```sql
CREATE TABLE trades (
  id TEXT PRIMARY KEY,              -- Unique trade ID
  strategyName TEXT NOT NULL,       -- e.g., 'razor'
  instrument TEXT NOT NULL,         -- e.g., 'BTC-PERPETUAL'
  side TEXT NOT NULL,               -- 'buy' or 'sell'
  entryOrderId TEXT NOT NULL,       -- Entry order ID
  slOrderId TEXT,                   -- Stop loss order ID
  tpOrderId TEXT,                   -- Take profit order ID
  entryPrice REAL NOT NULL,         -- Entry price
  exitPrice REAL,                   -- Exit price (if closed)
  amount REAL NOT NULL,             -- Position size
  stopLoss REAL NOT NULL,           -- SL price
  takeProfit REAL NOT NULL,         -- TP price
  entryTime INTEGER NOT NULL,       -- Unix timestamp (ms)
  exitTime INTEGER,                 -- Exit timestamp (ms)
  exitReason TEXT,                  -- 'sl_hit', 'tp_hit', 'manual', etc.
  pnl REAL,                         -- Realized PnL ($)
  pnlPercentage REAL,               -- PnL percentage
  status TEXT NOT NULL,             -- 'open' or 'closed'
  metadata TEXT                     -- JSON metadata (future)
);

-- Indices for fast queries
CREATE INDEX idx_trades_strategy ON trades(strategyName);
CREATE INDEX idx_trades_instrument ON trades(instrument);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_entryTime ON trades(entryTime);
CREATE INDEX idx_trades_exitReason ON trades(exitReason);
```

## API Endpoints

### GET /api/trades/history

Query trade history with filters.

**Query Parameters:**
- `strategyName` (optional): Filter by strategy
- `instrument` (optional): Filter by instrument
- `status` (optional): 'open' or 'closed'
- `limit` (optional): Max results (default: 50)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "success": true,
  "trades": [
    {
      "id": "trade_1731670800000_abc123",
      "strategyName": "razor",
      "instrument": "BTC-PERPETUAL",
      "side": "buy",
      "entryOrderId": "12345",
      "slOrderId": "12346",
      "tpOrderId": "12347",
      "entryPrice": 99800,
      "exitPrice": 100200,
      "amount": 0.001,
      "stopLoss": 99300,
      "takeProfit": 100300,
      "entryTime": 1731670800000,
      "exitTime": 1731671400000,
      "exitReason": "tp_hit",
      "pnl": 0.40,
      "pnlPercentage": 0.40,
      "status": "closed"
    }
  ],
  "total": 1
}
```

### GET /api/trades/stats

Get aggregated statistics.

**Query Parameters:**
- `strategyName` (optional)
- `instrument` (optional)
- `startTime` (optional): Unix timestamp (ms)
- `endTime` (optional): Unix timestamp (ms)

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalTrades": 100,
    "winningTrades": 80,
    "losingTrades": 20,
    "winRate": 80.0,
    "totalPnl": 245.50,
    "avgPnl": 2.455,
    "bestTrade": 15.30,
    "worstTrade": -5.20,
    "slHits": 20,
    "tpHits": 75
  }
}
```

## Frontend Integration

### Components

**TradeHistoryTable** (`src/components/metrics/TradeHistoryTable.tsx`):
- Toont alle trades in tabel format
- Filters op strategy
- Auto-refresh elke 10 seconden
- Color-coded PnL (green/red)
- Badge voor exit reasons

**TradeStatsCards** (`src/components/metrics/TradeStatsCards.tsx`):
- Aggregated statistics cards
- Win rate, total PnL, avg PnL
- Best/worst trades
- Auto-refresh elke 10 seconden

**MetricsPage** (`src/components/metrics/MetricsPage.tsx`):
- Integrates beide components
- Strategy filter dropdown
- Real-time updates

## Strategy Integration (Razor)

### Trade Lifecycle

```typescript
// 1. ENTRY - Record trade
const tradeId = await tradeHistory.recordTrade({
  strategyName: 'razor',
  instrument: 'BTC-PERPETUAL',
  side: 'buy',
  entryOrderId: 'ORDER_123',
  slOrderId: 'SL_456',
  tpOrderId: 'TP_789',
  entryPrice: 99800,
  amount: 0.001,
  stopLoss: 99300,
  takeProfit: 100300
});

// 2. MONITORING - checkPositionAndResume()
// Checks if position closed every tick

// 3. EXIT - Close trade with reason detection
await tradeHistory.closeTrade({
  tradeId,
  exitPrice: 100200,
  exitReason: 'tp_hit',  // or 'sl_hit', 'manual'
  pnl: 0.40,
  pnlPercentage: 0.40
});
```

### Exit Reason Detection

Smart detection based on exit price distance:

```typescript
// Distance from SL vs TP
const slDistance = Math.abs(exitPrice - stopLoss);
const tpDistance = Math.abs(exitPrice - takeProfit);

if (slDistance < tpDistance) {
  exitReason = 'sl_hit';
} else if (tpDistance < slDistance) {
  exitReason = 'tp_hit';
} else {
  exitReason = 'manual';
}
```

## Orphan Cleanup

### Orphan Order Cleanup

Na positie close worden alle reduce_only orders (SL/TP) expliciet gecanceld:

```typescript
private async cleanupOrphanOrders(): Promise<void> {
  const openOrders = await this.client.getOpenOrders(instrument);
  const orphanOrders = openOrders.filter(o => o.reduce_only === true);
  
  for (const order of orphanOrders) {
    await this.client.cancelOrder(order.order_id);
  }
}
```

### Orphan Position Detection

Pre-trade check voorkomt dubbele trades:

```typescript
const existingPosition = positions.find(p => 
  p.instrument_name === instrument && p.size !== 0
);

if (existingPosition) {
  throw new Error('ORPHAN POSITION DETECTED');
}
```

## Production Deployment

### 1. Environment Setup

```bash
# backend/.env
DB_PROVIDER=sql
TRADE_DB_PATH=../state/trades.db
```

### 2. PM2 Start

```bash
# Uses config/ecosystem.config.cjs
./scripts/pm2-startup.sh
```

### 3. Database Initialization

Database wordt automatisch aangemaakt bij eerste gebruik:
- Schema creation
- Index creation
- WAL mode enablement

### 4. Verify

```bash
# Check database exists
ls -lh state/trades.db

# Query via API
curl http://127.0.0.1:3000/api/trades/stats

# Check PM2 logs
pm2 logs tradebaas-backend | grep "TradeHistory"
```

## Testing

### Manual Test Flow

1. Start strategy
2. Place test trade
3. Wait for SL/TP hit of manual close
4. Check trade history table in UI
5. Verify stats update
6. Check database:
   ```bash
   sqlite3 state/trades.db "SELECT * FROM trades;"
   ```

### API Testing

```bash
# Get all trades
curl http://127.0.0.1:3000/api/trades/history

# Filter by strategy
curl "http://127.0.0.1:3000/api/trades/history?strategyName=razor"

# Get stats
curl http://127.0.0.1:3000/api/trades/stats
```

## Troubleshooting

### Database Not Created

**Problem:** SQLite file niet aangemaakt
**Solution:**
```bash
# Check state directory exists
mkdir -p state

# Check DB_PROVIDER env var
cat backend/.env | grep DB_PROVIDER

# Check backend logs
pm2 logs tradebaas-backend | grep "SqlTradeHistoryStore"
```

### No Trades Showing

**Problem:** Frontend toont geen trades
**Solution:**
```bash
# Check API response
curl http://127.0.0.1:3000/api/trades/history

# Check frontend console for errors
# Open browser dev tools → Console tab

# Verify backend running
pm2 list | grep backend
```

### Orphan Orders Not Cleaned

**Problem:** SL/TP orders blijven staan
**Solution:**
- Check `cleanupOrphanOrders()` logs
- Verify `reduce_only` flag op orders
- Manually cancel via Deribit UI

## Future Enhancements

- [ ] Export to CSV
- [ ] Advanced filtering (date ranges, PnL ranges)
- [ ] Trade journal notes (metadata field)
- [ ] Performance charts (equity curve)
- [ ] PostgreSQL support voor enterprise
- [ ] Trade replay/analysis tools

## References

- **Implementation:** `backend/src/services/trade-history.ts`
- **Database Schema:** `backend/src/services/SqlTradeHistoryStore.ts`
- **API Handlers:** `backend/src/api.ts` + `backend/src/server.ts`
- **UI Components:** `src/components/metrics/`
- **Documentation:** `MASTER.md` sectie 2.6

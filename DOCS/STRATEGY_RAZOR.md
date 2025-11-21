# Razor Strategy Documentatie

## Overzicht

**Razor** is de primaire trading strategie van Tradebaas Monster (9:11). Het is een **trend-following + momentum** strategie die RSI en moving averages combineert voor entry/exit signalen.

## Architectuur: Dual Implementation

### Frontend (Analyse Tool)
- **Locatie**: `src/lib/strategies/razorStrategy.ts`
- **Rol**: Real-time analyse, signal visualization, backtesting
- **Output**: UI updates, chart indicators, hypothetische trades
- **Execution**: **GEEN ECHTE ORDERS** - alleen voor monitoring

### Backend (Executor)
- **Locatie**: `backend/src/strategies/razor-executor.ts`
- **Rol**: Daadwerkelijke order placement, position management, 24/7 runtime
- **Output**: Live trades op Deribit exchange
- **Execution**: **PRODUCTIE ORDERS** met echt geld

## Signal Logic

### Entry Voorwaarden (LONG)
```typescript
// Micro signals (alle 3 vereist):
1. RSI > 50 (bullish momentum)
2. price > SMA(14) (boven moving average)
3. RSI stijgend laatste 3 candles (accelererende momentum)

// Exit conditions:
- RSI < 40 (momentum verlies)
- Price < SMA(14) (trend breuk)
- Take Profit bereikt (default: +1.5%)
- Stop Loss geraakt (default: -0.7%)
```

### Entry Voorwaarden (SHORT)
```typescript
// Micro signals (alle 3 vereist):
1. RSI < 50 (bearish momentum)
2. price < SMA(14) (onder moving average)
3. RSI dalend laatste 3 candles (accelererende momentum)

// Exit conditions:
- RSI > 60 (momentum verlies)
- Price > SMA(14) (trend breuk)
- Take Profit bereikt (default: +1.5%)
- Stop Loss geraakt (default: -0.7%)
```

## Configuratie

### Default Settings
```typescript
{
  enabled: false,           // Must be manually activated
  rsi_period: 14,          // RSI calculation window
  ma_period: 14,           // Moving average period
  rsi_overbought: 70,      // Upper threshold (not used for entries)
  rsi_oversold: 30,        // Lower threshold (not used for entries)
  
  // Risk management
  position_size: 0.1,      // BTC amount
  leverage: 10,            // 10x leverage default
  stop_loss: 0.7,          // 0.7% SL
  take_profit: 1.5,        // 1.5% TP
  
  // Timeframe
  timeframe: '1m',         // 1-minute candles
}
```

### Aanpasbare Parameters (via UI)
- ✅ RSI Period (5-50)
- ✅ MA Period (5-200)
- ✅ Overbought/Oversold Levels
- ✅ Position Size (BTC)
- ✅ Leverage (1-50x)
- ✅ Stop Loss % (0.1-10%)
- ✅ Take Profit % (0.1-20%)
- ❌ Timeframe (hardcoded to 1m)

## Execution Flow

### 1. Frontend Analyse Loop
```
[WebSocket] → Ticker updates
   ↓
[razorStrategy.ts] → Calculate indicators
   ↓
[checkMicroSignals()] → Evaluate entry/exit
   ↓
[Zustand Store] → Update UI state
   ↓
[StrategyTradingCard] → Display signals
```

### 2. Backend Execution Loop
```
[Deribit WS] → Market data stream
   ↓
[RazorExecutor] → Build candles + indicators
   ↓
[evaluateEntry()] → Check all 3 micro signals
   ↓
[PositionSizer] → Calculate safe position size
   ↓
[DeribitBroker.placeOTOCO()] → Execute with TP/SL
   ↓
[StateManager] → Persist position data
```

## Risk Management

### Per-Trade Risk
- **Default**: 2% van account balance
- **Max Leverage**: 50x (capped door PositionSizer)
- **Risk/Reward**: ~2.14:1 (1.5% TP / 0.7% SL)

### Position Limits
- **Max Concurrent Positions**: 1 (per strategy instance)
- **Re-entry**: Allowed after position close
- **Cooldown**: None (immediate re-entry mogelijk)

### Failure Modes
- ❌ **Insufficient Balance** → Order rejected, error logged
- ❌ **Leverage Too High** → Auto-reduced to 50x max
- ❌ **Exchange Error** → Retry 3x, then abort + alert
- ❌ **WebSocket Disconnect** → Auto-reconnect with exponential backoff

## Performance Metrics

### Tracked KPIs (Frontend)
- Total Profit/Loss (USD)
- Win Rate (%)
- Average Win/Loss (USD)
- Total Trades Count
- Current Drawdown (%)

### Backend Metrics
- Real-time P&L tracking
- Position duration (entry → exit time)
- Slippage analysis (expected vs actual fill)
- Error count per session

## Code Synchronisatie

⚠️ **CRITICAL**: Frontend en backend implementaties moeten logisch gelijk blijven:

| Component | Frontend | Backend |
|-----------|----------|---------|
| **RSI Calculation** | `calculateRSI()` | `RazorExecutor.calculateRSI()` |
| **SMA Calculation** | `calculateSMA()` | `RazorExecutor.calculateSMA()` |
| **Entry Logic** | `checkMicroSignals()` | `evaluateEntry()` |
| **Exit Logic** | `checkExitSignals()` | `evaluateExit()` |

### Difference Tolerance
- Frontend mag **extra features** hebben (backtesting, visualization)
- Backend mag **extra safety checks** hebben (balance validation, rate limits)
- **Signal logic MOET identiek zijn** anders divergeren UI en trades!

## Testing

### Frontend Testing (UI Validatie)
```bash
npm run dev
# Open browser → Strategies tab
# Enable Razor → Observe signals in real-time
# Verify TP/SL calculations correct
```

### Backend Testing (Paper Trading)
```bash
cd backend
npm run dev -- --testnet
# Connects to Deribit testnet
# Real execution flow met fake geld
```

## Deployment

### Frontend (Vite Build)
```bash
npm run build
# Output: dist/ folder
# Deploy via Netlify/Vercel
```

### Backend (PM2)
```bash
cd backend
npm run build
pm2 start ecosystem.config.js
# 24/7 runtime met auto-restart
```

## Troubleshooting

### "Razor niet trading ondanks signalen"
1. Check `enabled: true` in config
2. Verify WebSocket connected (backend logs)
3. Confirm sufficient account balance
4. Check leverage not exceeded (max 50x)

### "Frontend toont andere signalen dan backend"
1. Sync indicator periods (RSI/MA)
2. Verify timeframe consistent (1m)
3. Check candle data source (same exchange)
4. Compare calculated RSI values in logs

### "Stop Loss niet triggered"
1. OTOCO orders require **reduce_only** flag
2. Verify Deribit API key heeft trade permissions
3. Check position direction matches SL side
4. Examine backend logs voor placement errors

## Roadmap

- [ ] **Multi-timeframe Analysis**: Add 5m/15m confirmation
- [ ] **Dynamic TP/SL**: Adjust based on volatility (ATR)
- [ ] **Adaptive Sizing**: Kelly criterion with historical win rate
- [ ] **Correlation Filter**: Skip trades if correlated with other strategies
- [ ] **ML Enhancement**: Train model on historical micro signals

## Referenties

- **Frontend Code**: `src/lib/strategies/razorStrategy.ts`
- **Backend Code**: `backend/src/strategies/razor-executor.ts`
- **Config**: `src/state/store.ts` → `DEFAULT_RAZOR_CONFIG`
- **UI Component**: `src/components/trading/StrategyTradingCard.tsx`
- **Risk Engine**: `DOCS/RISK_ENGINE.md`

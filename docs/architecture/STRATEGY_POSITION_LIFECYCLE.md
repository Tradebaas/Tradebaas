# Strategy Position Lifecycle

## Overview

Dit document beschrijft de **complete lifecycle** van een strategy trade: van signal detectie tot position close en het automatic resuming van strategy evaluation voor nieuwe trades.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   STRATEGY RUNNING                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  TICK (elke 60 seconden)                                     │
│  - Fetch candles                                             │
│  - Build aggregated timeframe candles                        │
│  - Strategy.evaluate(candles) → Signal                       │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
        [Signal = 'none']      [Signal = 'buy' or 'sell']
                │                       │
                │                       ▼
                │         ┌─────────────────────────────────────┐
                │         │  EXECUTE SIGNAL                      │
                │         │  1. Calculate position size          │
                │         │  2. Calculate SL/TP levels           │
                │         │  3. Place OTOCO order                │
                │         │  4. Save position to state           │
                │         │  5. Start monitorPosition()          │
                │         └─────────────────────────────────────┘
                │                       │
                │                       ▼
                │         ┌─────────────────────────────────────┐
                │         │  POSITION OPEN                       │
                │         │  State: { position: {...} }          │
                │         └─────────────────────────────────────┘
                │                       │
                ▼                       ▼
        ┌───────────────────────────────────────────────────────┐
        │  NEXT TICK                                             │
        │  Check: if (state.position) → SKIP evaluation          │
        │  → Strategy paused while position open                 │
        └───────────────────────────────────────────────────────┘
                                        │
                                        ▼
        ┌────────────────────────────────────────────────────────┐
        │  MONITOR POSITION (interval: 5 seconds)                 │
        │  1. Get open orders for instrument                      │
        │  2. Check if SL/TP orders still exist                   │
        │  3. If BOTH gone → Position closed                      │
        │  4. Calculate PnL and update stats                      │
        │  5. setState({ position: null })                        │
        │  6. Clear interval                                      │
        └────────────────────────────────────────────────────────┘
                                        │
                                        ▼
        ┌────────────────────────────────────────────────────────┐
        │  POSITION CLOSED                                        │
        │  State: { position: null }                              │
        │  → Strategy evaluation resumes on next tick             │
        └────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                        (Back to TICK - loop continues)
```

## Detailed Steps

### 1. Strategy Evaluation (tick)

**Locatie**: `StrategyRunner.ts` → `tick()`  
**Frequentie**: Elke 60 seconden  
**Conditie**: `if (state.position)` → **SKIP** (geen evaluatie tijdens open position)

```typescript
private async tick(): Promise<void> {
  const state = this.stateStore.getState();
  
  if (state.position) {
    console.log('[StrategyRunner] Position open, skipping evaluation');
    return; // ✅ Paused tijdens positie
  }
  
  // Get candles, evaluate strategy
  const signal = this.strategyEngine.evaluate(targetCandles);
  
  if (signal.action === 'buy' || signal.action === 'sell') {
    await this.executeSignal(signal, targetCandles);
  }
}
```

**Belangrijke punten**:
- ✅ Strategy evalueert **NIET** tijdens open position
- ✅ Na position close (state.position = null) → evaluatie **resumes automatisch**
- ✅ Volgende tick (max 60 seconden later) detecteert nieuwe signals

### 2. Signal Execution

**Locatie**: `StrategyRunner.ts` → `executeSignal()`  
**Wat gebeurt er**:

```typescript
private async executeSignal(signal: StrategySignal, candles: Candle[]): Promise<void> {
  // 1. Calculate position size (via RiskEngine)
  const positionSize = RiskEngine.calculatePositionSize(
    this.equity,
    entryPrice,
    stopLoss,
    this.currentConfig.riskSettings
  );
  
  // 2. Calculate SL/TP levels
  const stopLoss = RiskEngine.calculateStopLoss(...);
  const takeProfit = RiskEngine.calculateTakeProfit(...);
  
  // 3. Place OTOCO order (entry + SL + TP in one go)
  const order = await this.broker.placeOrder({
    instrument: this.currentConfig.instrument,
    side: signal.action,
    type: 'market',
    amount: positionSize,
    otocoConfig: {
      stopLoss: { triggerPrice: stopLoss, ... },
      takeProfit: { price: takeProfit, ... }
    }
  });
  
  // 4. Save position to state
  const position: Position = {
    orderId: order.orderId,
    instrument: order.instrument,
    side: order.side,
    amount: order.amount,
    entryPrice: order.price || entryPrice,
    stopLoss, takeProfit
  };
  
  await this.stateStore.setState({
    position,
    lastExecutionTime: Date.now(),
    totalTrades: state.totalTrades + 1
  });
  
  // 5. Start monitoring
  this.monitorPosition(position);
}
```

**Output**:
- ✅ Entry order filled
- ✅ SL order placed (stop_market @ stopLoss price)
- ✅ TP order placed (take_limit @ takeProfit price)
- ✅ Position saved to state
- ✅ Monitor interval started

### 3. Position Monitoring

**Locatie**: `StrategyRunner.ts` → `monitorPosition()`  
**Frequentie**: Elke 5 seconden  
**Logica**: Check of SL/TP orders nog bestaan

```typescript
private async monitorPosition(position: Position): Promise<void> {
  const checkInterval = setInterval(async () => {
    // Safety checks
    if (!this.broker || !this.isRunning) {
      clearInterval(checkInterval);
      return;
    }
    
    // Get all open orders for this instrument
    const openOrders = await this.broker.getOpenOrders(position.instrument);
    
    // Find SL and TP orders
    const slOrder = openOrders.find(o => 
      o.type === 'stop_market' || o.type === 'stop_limit'
    );
    const tpOrder = openOrders.find(o => 
      o.type === 'take_limit' || o.type === 'take_market'
    );
    
    // ✅ Position closed = both SL and TP orders gone
    if (!slOrder && !tpOrder) {
      clearInterval(checkInterval);
      
      // Calculate PnL
      const pnl = /* ... */;
      
      // Reset position state
      await this.stateStore.setState({
        position: null,
        totalPnL: state.totalPnL + pnl,
        winningTrades: pnl > 0 ? state.winningTrades + 1 : state.winningTrades,
        losingTrades: pnl < 0 ? state.losingTrades + 1 : state.losingTrades
      });
      
      console.log('▶️  Resuming strategy evaluation for new signals...');
    } else {
      // Position still open
      console.log(`📈 Position still open (${remainingOrders} orders active)`);
    }
  }, 5000);
}
```

**Close Detection Methods**:

| Scenario | SL Order | TP Order | Detection |
|----------|----------|----------|-----------|
| **TP Hit** | Still open | ❌ Filled | Both gone (SL auto-cancelled) → Close detected ✅ |
| **SL Hit** | ❌ Filled | Still open | Both gone (TP auto-cancelled) → Close detected ✅ |
| **Manual Close** | ❌ Cancelled | ❌ Cancelled | Both gone → Close detected ✅ |
| **Position Open** | ✅ Open | ✅ Open | Both present → Position still open |

**Belangrijke punten**:
- ✅ Checkt **SL/TP orders**, niet de entry order (die is al filled)
- ✅ Als **beide orders weg** zijn → positie is gesloten
- ✅ Werkt voor: TP hit, SL hit, manual close, reduce only orders
- ✅ Interval wordt **altijd** gestopt na close detection
- ✅ State wordt **gereset** (`position: null`)

### 4. Automatic Resume

**Wat gebeurt er na close**:

```
Position Closed (time: 14:23:45)
  ↓
setState({ position: null })
  ↓
Monitor interval cleared
  ↓
Next tick (max 60s later, e.g. 14:24:00)
  ↓
Check: if (state.position) → FALSE
  ↓
✅ Strategy evaluation resumes
  ↓
Evaluate candles → New signal?
  ↓
If signal → Execute → New position
```

**Timeline Example**:

```
14:20:00 - Tick: Signal detected → Place order
14:20:05 - Position monitoring started
14:20:10 - Position still open
14:20:15 - Position still open
...
14:23:40 - TP hit → Orders cancelled
14:23:45 - Monitor detects close → setState({ position: null })
14:24:00 - Next tick → Resume evaluation
14:24:00 - New signal? → Execute if conditions met
```

## Code Changes (2025-11-08)

### Problem

**OLD**: Monitor checkte de **entry order** via `broker.getOrder(position.orderId)`:
```typescript
// ❌ WRONG - entry order is already filled!
const order = await this.broker.getOrder(position.orderId, position.instrument);
if (order.status === 'filled' || order.status === 'cancelled') {
  // This never triggered because entry order was already filled
}
```

**Issues**:
- ❌ Entry order was already filled when position opened
- ❌ SL/TP orders were never checked
- ❌ Position close was never detected
- ❌ Strategy never resumed after position opened

### Solution

**NEW**: Check **SL/TP orders** via `broker.getOpenOrders()`:
```typescript
// ✅ CORRECT - check if SL/TP orders still exist
const openOrders = await this.broker.getOpenOrders(position.instrument);
const slOrder = openOrders.find(o => o.type === 'stop_market' || o.type === 'stop_limit');
const tpOrder = openOrders.find(o => o.type === 'take_limit' || o.type === 'take_market');

if (!slOrder && !tpOrder) {
  // ✅ Position closed - both orders gone
  clearInterval(checkInterval);
  setState({ position: null });
}
```

### Improved Logging

```
[StrategyRunner] 🔍 Started monitoring position: BTC_USDC-PERPETUAL buy 100
[StrategyRunner] 📈 Position still open (stop_market + take_limit orders active)
[StrategyRunner] 📈 Position still open (stop_market + take_limit orders active)
[StrategyRunner] ✅ Position closed detected (SL/TP orders filled or cancelled)
[StrategyRunner] 💰 Position closed. PnL: 12.50 USDC (Total: 45.80 USDC)
[StrategyRunner] 📊 Stats: 3W / 1L
[StrategyRunner] ▶️  Resuming strategy evaluation for new signals...
```

## Testing Scenarios

### Scenario 1: Normal TP Hit

```
1. Strategy detects buy signal → Place OTOCO order
2. Position opens with SL @ 95,000, TP @ 105,000
3. Monitor starts checking every 5s
4. Price reaches 105,000 → TP fills
5. Deribit auto-cancels SL order
6. Next monitor check: both orders gone → close detected
7. PnL calculated, state reset
8. Next tick: strategy resumes → new signal evaluation
```

✅ **Expected**: Automatic resume, new trade possible

### Scenario 2: SL Hit

```
1. Position open with SL @ 95,000, TP @ 105,000
2. Price drops to 95,000 → SL fills
3. Deribit auto-cancels TP order
4. Monitor detects both orders gone → close detected
5. State reset, strategy resumes
```

✅ **Expected**: Automatic resume, new trade possible

### Scenario 3: Manual Close

```
1. Position open
2. User manually closes position via UI or Deribit
3. Deribit cancels both SL and TP orders
4. Monitor detects both orders gone → close detected
5. State reset, strategy resumes
```

✅ **Expected**: Automatic resume, new trade possible

### Scenario 4: Strategy Stop During Position

```
1. Position open
2. User stops strategy
3. Monitor check: isRunning = false
4. Interval cleared immediately
5. Position remains in state (for reconciliation on restart)
```

✅ **Expected**: Clean shutdown, position preserved

## State Persistence

### Backend State (backend-state.json)

```json
{
  "position": {
    "orderId": "ETH-12345",
    "instrument": "BTC_USDC-PERPETUAL",
    "side": "buy",
    "amount": 100,
    "entryPrice": 100000,
    "stopLoss": 95000,
    "takeProfit": 105000
  },
  "totalPnL": 125.50,
  "winningTrades": 5,
  "losingTrades": 2,
  "totalTrades": 7
}
```

**Gedrag bij restart**:
- ✅ Position wordt **reconciled** via `performReconciliation()`
- ✅ Als position nog bestaat → monitor wordt **herstart**
- ✅ Als position niet meer bestaat → state wordt **gereset**

## FAQ

### Q: Wat gebeurt er als de backend restart tijdens een open position?

**A**: Position reconciliation:
1. Bij start: `performReconciliation()` wordt aangeroepen
2. Checkt of saved position nog bestaat op exchange
3. Als ja: monitor wordt herstart
4. Als nee: state wordt gereset, strategy resumes

### Q: Kan de strategy een nieuwe trade plaatsen terwijl er nog een position open staat?

**A**: **NEE**. De `tick()` functie checkt `if (state.position)` en skipped evaluatie.
- ✅ Safety: Nooit multiple positions tegelijk
- ✅ Risk management: Wacht altijd op position close

### Q: Hoe lang duurt het voordat de strategy een nieuwe trade kan plaatsen na close?

**A**: **Max 60 seconden** (tick interval)
- Monitor detecteert close binnen 5 seconden (monitor interval)
- Volgende tick (max 60s later) evalueert nieuwe signals
- Als signal present → immediate execution

### Q: Wat als de SL/TP orders manually cancelled worden maar position nog open staat?

**A**: Monitor detecteert "beide orders weg" en markeert position als closed.
- ⚠️ **Issue**: Actual position kan nog open staan op exchange
- 🔧 **Solution**: Reconciliation bij volgende start detecteert dit
- 💡 **Best Practice**: Gebruik altijd reduce_only orders, never manual cancel

### Q: Werkt dit ook als ik handmatig een position sluit via Deribit UI?

**A**: **JA**. Deribit cancelt automatisch alle related orders (SL/TP) wanneer een position handmatig gesloten wordt.
- ✅ Monitor detecteert "beide orders weg"
- ✅ State wordt gereset
- ✅ Strategy resumes automatic

## Monitoring Commands

```bash
# Check strategy status
curl -X GET http://localhost:3000/api/v2/strategy/status

# Check if position is being monitored
pm2 logs tradebaas-backend --lines 50 | grep "Position still open"

# Check position close detection
pm2 logs tradebaas-backend --lines 100 | grep "Position closed"

# Verify strategy resume
pm2 logs tradebaas-backend --lines 100 | grep "Resuming strategy evaluation"
```

## Summary

### ✅ Working Flow

1. **Signal Detection** → Strategy evaluates candles every 60s
2. **Order Placement** → OTOCO order met SL + TP
3. **Position Monitoring** → Check SL/TP orders every 5s
4. **Close Detection** → Both orders gone = position closed
5. **State Reset** → `position: null`
6. **Automatic Resume** → Next tick resumes evaluation
7. **New Signal** → Cycle repeats

### 🔧 Key Fixes (2025-11-08)

- ✅ Fixed: Monitor checkt nu **SL/TP orders** ipv entry order
- ✅ Fixed: Close detection werkt voor TP, SL, manual close
- ✅ Fixed: Interval wordt altijd gestopt na close
- ✅ Improved: Extensive logging voor debugging
- ✅ Verified: Strategy resumes automatisch na close

### 📊 Expected Behavior

**Als strategie draait EN broker connected**:
- ✅ Signal → Order → Position
- ✅ TP/SL hit → Close detected binnen 5s
- ✅ State reset → Position = null
- ✅ Resume → Nieuwe signals binnen 60s
- ✅ Cycle → Infinite loop tot manual stop

**Perfect voor 24/7 automated trading!** 🚀

---

**Last Updated**: 2025-11-08  
**Status**: ✅ WORKING

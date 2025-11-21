# Persistence & Reconciliation System

## Overview

The Persistence & Reconciliation system ensures that trading positions and runner state survive daemon restarts. On cold start, the system matches saved positions against live broker orders and restores active monitoring, enabling zero-downtime position management.

## Architecture

### Components

1. **StateStore**: KV-backed persistent storage for position and stats
2. **ReconciliationService**: Order matching and cleanup logic
3. **StrategyRunner**: Integrated initialization and reconciliation flow
4. **DeribitClient/Broker**: Extended with getOpenOrders() support

### Data Flow

```
Cold Start
  ↓
StateStore.init() → Load persisted state from KV
  ↓
StrategyRunner.start() → performReconciliation()
  ↓
ReconciliationService.reconcile(savedPosition)
  ↓
Broker.getOpenOrders() → Fetch live orders
  ↓
Match by label/orderId → Verify protection orders
  ↓
Generate ReconciliationActions
  ↓
Execute actions (cancel orphans, restore position)
  ↓
Resume monitorPosition() loop
  ↓
Continue trading
```

## StateStore

### KV-Based Persistence

The StateStore now uses Spark KV instead of localStorage for server-side persistence compatible with backend daemon architecture.

```typescript
// Per-user, per-worker isolation
const store = new StateStore(userId, workerId);
await store.init();

// Storage key pattern
const key = `runner_state_${userId}_${workerId}`;

// Async state updates
await store.setState({ position, totalTrades: 5 });
await store.setPosition(newPosition);
```

### Stored State Structure

```typescript
interface BracketState {
  position: Position | null;
  lastExecutionTime: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
}

interface Position {
  orderId: string;
  instrument: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
  slOrderId?: string;    // Stop loss order ID
  tpOrderId?: string;    // Take profit order ID
}
```

## Reconciliation

### Order Matching Logic

The reconciliation service matches saved positions against live broker orders using multiple strategies:

1. **By Order ID**: Exact match on `orderId`, `slOrderId`, `tpOrderId`
2. **By Label**: Match on order label (e.g., `strategy_ema-rsi-scalper_entry`)
3. **By OCO Ref**: Group related orders by OCO reference

```typescript
const result = await reconciliationService.reconcile(
  savedPosition,
  'strategy_ema-rsi-scalper'
);
```

### Reconciliation Outcomes

#### Scenario 1: Position Fully Matched
```
Saved Position: BTC_USDC-PERPETUAL long @ 95000
Live Orders:
  - Entry: FILLED
  - Stop Loss: OPEN @ 94500
  - Take Profit: OPEN @ 96500

Result: ✓ Position restored, monitoring resumed
```

#### Scenario 2: Missing Protection Orders
```
Saved Position: BTC_USDC-PERPETUAL long @ 95000
Live Orders:
  - Entry: FILLED
  - Stop Loss: NOT FOUND
  - Take Profit: NOT FOUND

Result: ⚠ Alert - Position missing protection, manual intervention required
```

#### Scenario 3: Entry Not Filled
```
Saved Position: BTC_USDC-PERPETUAL long @ 95000
Live Orders:
  - Entry: OPEN (pending)

Result: → Cancel unfilled entry order, clear saved state
```

#### Scenario 4: Position Closed
```
Saved Position: BTC_USDC-PERPETUAL long @ 95000
Live Orders:
  - Entry: NOT FOUND (likely filled and closed)
  - Stop Loss: OPEN (orphaned)
  - Take Profit: OPEN (orphaned)

Result: → Cancel orphaned protection orders, clear saved state
```

#### Scenario 5: Unknown Orders
```
Saved Position: null
Live Orders:
  - strategy_old_session_entry: FILLED
  - strategy_old_session_sl: OPEN

Result: → Cancel unknown orders with our label prefix
```

### Reconciliation Actions

The service generates structured actions:

```typescript
interface ReconciliationAction {
  type: 'restore_position' | 'cancel_order' | 'alert';
  orderId?: string;
  message: string;
  order?: Order;
}
```

Actions are executed in order:
1. `cancel_order`: Remove orphaned/unknown orders
2. `alert`: Log warnings for manual review
3. `restore_position`: Resume monitoring if position valid

## Integration

### StrategyRunner Changes

#### Constructor
```typescript
// BEFORE
const runner = new StrategyRunner();

// AFTER
const runner = new StrategyRunner(userId, workerId);
await runner.init();
```

#### Startup Flow
```typescript
async start(): Promise<void> {
  // ... validate broker connection, fetch equity
  
  // NEW: Perform reconciliation
  console.log('[StrategyRunner] Starting reconciliation...');
  await this.performReconciliation();
  
  this.isRunning = true;
  this.runLoop();
}
```

#### Reconciliation Implementation
```typescript
private async performReconciliation(): Promise<void> {
  const state = this.stateStore.getState();
  const savedPosition = state.position;
  
  const labelPrefix = `strategy_${this.currentConfig.id}`;
  const result = await this.reconciliationService.reconcile(
    savedPosition,
    labelPrefix
  );
  
  if (result.matched) {
    await this.stateStore.setPosition(result.matched.position);
    this.monitorPosition(result.matched.position);
  } else if (savedPosition) {
    await this.stateStore.setPosition(null);
  }
  
  if (result.actions.length > 0) {
    await this.reconciliationService.executeActions(
      result.actions,
      this.currentConfig.instrument
    );
  }
}
```

### Broker Interface Extensions

#### IBroker
```typescript
interface IBroker {
  // ... existing methods
  getOpenOrders(instrument?: string): Promise<Order[]>;
}
```

#### Order Interface
```typescript
interface Order {
  orderId: string;
  instrument: string;
  side: 'buy' | 'sell';
  type: string;
  amount: number;
  price?: number;
  filled: number;
  status: 'open' | 'filled' | 'cancelled' | 'rejected';
  timestamp: number;
  label?: string;      // NEW: Order label for matching
  ocoRef?: string;     // NEW: OCO reference for grouping
}
```

#### DeribitClient
```typescript
async getOpenOrders(instrumentName?: string): Promise<OrderResponse[]> {
  const params: Record<string, unknown> = {};
  if (instrumentName) {
    params.instrument_name = instrumentName;
  }
  
  return await this.callRPC<OrderResponse[]>(
    'private/get_open_orders_by_instrument',
    params
  );
}
```

## Label Convention

Orders are labeled with a consistent pattern for reliable matching:

```
strategy_{strategyId}_entry
strategy_{strategyId}_sl
strategy_{strategyId}_tp
```

Examples:
- `strategy_ema-rsi-scalper_entry`
- `strategy_ema-rsi-scalper_sl`
- `strategy_ema-rsi-scalper_tp`

This allows reconciliation to:
- Identify orders belonging to our system
- Match orders to saved positions
- Detect unknown orders from previous sessions

## Acceptance Criteria

✅ **Cold-start herkent lopende posities**

The system successfully:
1. Persists open positions to KV storage
2. Loads persisted state on daemon restart
3. Matches saved positions against live broker orders
4. Restores active monitoring for valid positions
5. Cleans up orphaned orders from crashed sessions
6. Alerts on anomalies (missing protection, unknown orders)
7. Continues trading with zero manual intervention

## Testing Scenarios

### Test 1: Normal Cold Start
1. Open position with SL and TP
2. Restart daemon
3. Verify position restored and monitoring resumed

### Test 2: Position Closed While Offline
1. Open position with SL and TP
2. Stop daemon
3. Manually close position via broker UI
4. Start daemon
5. Verify orphaned SL/TP orders canceled

### Test 3: Crashed Session Cleanup
1. Open position with SL and TP
2. Simulate crash (delete persisted state)
3. Start daemon with no saved state
4. Verify orders with our label prefix are canceled

### Test 4: Missing Protection
1. Open position with SL and TP
2. Stop daemon
3. Manually cancel SL order via broker UI
4. Start daemon
5. Verify alert logged for missing protection

### Test 5: Multiple Workers
1. Start worker1 with position A
2. Start worker2 with position B
3. Restart both
4. Verify worker1 restores position A only
5. Verify worker2 restores position B only

## Logging

The system logs detailed reconciliation information:

```
[StrategyRunner] Starting reconciliation...
[Reconciliation] Found 3 open orders
[Reconciliation] Attempting to match saved position for BTC_USDC-PERPETUAL
[Reconciliation] ✓ Matched entry order - position still active
[Reconciliation] Position fully reconciled with protection orders
[StrategyRunner] ✓ Position reconciled: BTC_USDC-PERPETUAL
[StrategyRunner] Started with equity: 1000 USDC
```

For orphaned orders:
```
[Reconciliation] Found 2 orphaned orders from previous session
[Reconciliation] Executing: Canceling orphaned order ABC123
[StrategyRunner] Cleaned up 2 orphaned orders
```

For unknown orders:
```
[Reconciliation] Found 1 unknown orders with our label prefix
[Reconciliation] Alert: Unknown order detected: DEF456
```

## Future Enhancements

1. **Position Migration**: Transfer positions between workers
2. **Manual Reconciliation**: Admin endpoint to trigger reconciliation
3. **Reconciliation Report**: Detailed report of all actions taken
4. **Partial Fills**: Handle partially filled entry orders
5. **OCO Group Matching**: Use OCO refs as primary matching strategy
6. **Multi-Instrument**: Reconcile positions across multiple instruments
7. **Historical Reconciliation**: Reconcile past trades for PnL accuracy

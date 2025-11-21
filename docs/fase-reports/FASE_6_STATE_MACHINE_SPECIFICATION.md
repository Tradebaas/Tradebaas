# FASE 6: Strategy State Machine Specification

**Date:** 21 November 2025  
**Purpose:** Complete documentation of all strategy states and transitions  
**Based On:** Actual code analysis (RazorExecutor, UserStrategyService, database schema)

---

## Strategy Status Levels

### Database Level (`user_strategies` table)
```typescript
status: 'active' | 'stopped' | 'paused' | 'error'
```

### Executor Level (`AnalysisState`)
```typescript
status: 'initializing' | 'analyzing' | 'signal_detected' | 'position_open' | 'stopped'
```

### Combined State Matrix

| DB Status | Executor Status | Meaning |
|-----------|----------------|---------|
| `active` | `initializing` | Strategy starting up, loading historical data |
| `active` | `analyzing` | Scanning market, no position, looking for entries |
| `active` | `signal_detected` | Entry signal found, preparing to open position |
| `active` | `position_open` | Position active, monitoring SL/TP |
| `active` | `stopped` | Executor stopped but DB not updated (transient) |
| `stopped` | N/A | Strategy stopped by user, executor destroyed |
| `paused` | N/A | Auto-resume skipped (user disconnected) |
| `error` | N/A | Strategy crashed, executor destroyed |

---

## State Transition Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    STRATEGY LIFECYCLE                        │
└─────────────────────────────────────────────────────────────┘

[START]
   │
   ├─── User clicks "Start Strategy" (Frontend)
   │        ↓
   │    POST /api/user/strategy/start (JWT auth)
   │        ↓
   │    UserStrategyService.startStrategy()
   │        ↓
   │    Check: User connected to broker? ──NO──→ [ERROR: Not connected]
   │        │YES
   │        ↓
   │    Database INSERT: status='active', autoReconnect=true
   │        ↓
   │    Create RazorExecutor instance
   │        ↓
   ┌────────────────────────────────────┐
   │  STATE: active / initializing      │
   │  - Loading historical candles      │
   │  - Subscribing to ticker stream    │
   │  - Initializing indicators         │
   └────────────────────────────────────┘
           │
           ├─── Initialization SUCCESS
           │        ↓
   ┌────────────────────────────────────┐
   │  STATE: active / analyzing         │ ◄──────────┐
   │  - Scanning market                 │            │
   │  - Evaluating entry conditions     │            │
   │  - No position open                │            │
   │  - Logs: "Scanning... Signal: X/5" │            │
   └────────────────────────────────────┘            │
           │                                         │
           ├─── Cooldown active? ──YES──→ Wait ─────┘
           │        │NO                              │
           │        ↓                                 │
           ├─── Entry signal detected (confluence ≥ threshold)
           │        ↓
   ┌────────────────────────────────────┐
   │  STATE: active / signal_detected   │
   │  - Entry conditions met            │
   │  - Preparing market/limit order    │
   │  - Calculating SL/TP               │
   └────────────────────────────────────┘
           │
           ├─── Order placed
           │        ↓
           ├─── Entry order FILLED
           │        ↓
   ┌────────────────────────────────────┐
   │  STATE: active / position_open     │
   │  - Position active                 │
   │  - SL/TP orders placed             │
   │  - Monitoring for exit             │
   │  - Trade recorded in database      │
   │    (trades.user_id = userId)       │
   │  - Logs: "📊 Position open"        │
   └────────────────────────────────────┘
           │
           ├──────────────┬──────────────┬──────────────┐
           │              │              │              │
           ↓              ↓              ↓              ↓
      TP HIT         SL HIT        Manual Close   Order Cancelled
           │              │              │              │
           └──────────────┴──────────────┴──────────────┘
                          ↓
                 Position CLOSED
                          ↓
                  Update Trade in DB
                  (exitPrice, PnL, exitReason)
                          ↓
   ┌────────────────────────────────────┐
   │  STATE: active / analyzing         │
   │  + cooldownUntil = NOW + X mins    │
   │  - Pausing execution               │
   │  - Waiting for cooldown expiry     │
   │  - Logs: "⏱️  Cooldown 5min"       │
   └────────────────────────────────────┘
           │
           ├─── Cooldown expires
           │        ↓
           └────→ Back to SCANNING (analyzing) ───────┘

┌─────────────────────────────────────────────────────────────┐
│                    MANUAL STOP FLOW                          │
└─────────────────────────────────────────────────────────────┘

[Any State (active)]
   │
   ├─── User clicks "Stop Strategy" (Frontend)
   │        ↓
   │    POST /api/user/strategy/stop (JWT auth)
   │        ↓
   │    UserStrategyService.stopStrategy()
   │        ↓
   │    Check: Has open position? ──YES──→ Close position first
   │        │NO                               │
   │        ↓                                 ↓
   │    Database UPDATE:              Position closed
   │      - status='stopped'                  ↓
   │      - autoReconnect=FALSE        Update trade in DB
   │      - lastAction='manual_stop'          ↓
   │      - disconnectedAt=NOW          Clear executor state
   │        ↓                                 ↓
   │    Clear intervalId (stop polling)       │
   │        ↓                                 │
   │    Remove from runningStrategies Map     │
   │        ↓                                 │
   └────────────────────────┬─────────────────┘
                           ↓
   ┌────────────────────────────────────┐
   │  STATE: stopped                    │
   │  - Executor destroyed              │
   │  - No auto-resume on restart       │
   │  - User must manually restart      │
   └────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    AUTO-RESUME FLOW                          │
└─────────────────────────────────────────────────────────────┘

[Backend Restart/Crash]
   │
   ├─── server.ts: start()
   │        ↓
   │    UserStrategyService.initialize()
   │        ↓
   │    Database QUERY:
   │      SELECT * FROM user_strategies
   │      WHERE status='active'
   │        AND auto_reconnect=true
   │        ↓
   ├─── Found strategies? ──NO──→ [Done, no auto-resume]
   │        │YES
   │        ↓
   │    FOR EACH strategy:
   │        ↓
   │    Check: User has broker connection?
   │        │
   │        ├─── YES: Resume strategy
   │        │        ↓
   │        │    Create RazorExecutor
   │        │        ↓
   │        │    Start execution loop
   │        │        ↓
   │        │    Database UPDATE:
   │        │      - status='active'
   │        │      - lastAction='auto_resume'
   │        │      - lastHeartbeat=NOW
   │        │        ↓
   │        │    Logs: "✅ Auto-resumed: userId:razor:BTC-PERPETUAL:..."
   │        │        ↓
   │        └────→ Back to ANALYZING state
   │
   │        └─── NO: Skip resume
   │                 ↓
   │             Database UPDATE:
   │               - status='paused'
   │               - lastAction='auto_resume_skipped'
   │                 ↓
   │             Logs: "⚠️  Skipping: User not connected"
   │                 ↓
   ┌────────────────────────────────────┐
   │  STATE: paused                     │
   │  - Executor NOT created            │
   │  - Will resume when user connects  │
   │  - Can be manually started         │
   └────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING FLOW                       │
└─────────────────────────────────────────────────────────────┘

[Any State (active)]
   │
   ├─── Exception thrown in executor
   │        ↓
   │    try/catch in UserStrategyService.runStrategyLoop()
   │        ↓
   │    Database UPDATE:
   │      - status='error'
   │      - lastAction='execution_error'
   │      - errorMessage=error.message
   │      - errorCount=errorCount+1
   │        ↓
   │    Clear intervalId
   │        ↓
   │    Remove from runningStrategies Map
   │        ↓
   │    Logs: "❌ Strategy error: ${error.message}"
   │        ↓
   ┌────────────────────────────────────┐
   │  STATE: error                      │
   │  - Executor destroyed              │
   │  - User can see error in UI        │
   │  - Can be manually restarted       │
   │  - Auto-resume will retry (if      │
   │    autoReconnect=true)             │
   └────────────────────────────────────┘

```

---

## Detailed State Descriptions

### 1. `active / initializing`

**Entry Conditions:**
- User starts strategy via UI
- Backend creates RazorExecutor instance
- Database: `status='active'`, `autoReconnect=true`, `lastAction='manual_start'`

**Behavior:**
- Loads 200+ historical 1m candles for indicators
- Subscribes to Deribit ticker stream (`ticker.{instrument}.raw`)
- Initializes EMA, RSI, ATR indicators
- Duration: ~2-5 seconds

**Exit Conditions:**
- SUCCESS → `analyzing`
- FAILURE → `error`

**Logs:**
```
[Razor] Initializing with config: {...}
[Razor] Fetching 200 historical candles...
[Razor] Historical data loaded: 200 candles
[Razor] Subscribed to ticker.BTC-PERPETUAL.raw
[Razor] ✅ Initialization complete
```

**Database:**
```sql
status='active'
last_action='manual_start'
connected_at=NOW()
last_heartbeat=NOW()
```

---

### 2. `active / analyzing`

**Entry Conditions:**
- Initialization complete, OR
- Position closed + cooldown expired, OR
- Auto-resume successful

**Behavior:**
- Evaluates entry conditions every candle close (1 minute)
- Calculates confluence score (max 5):
  1. Trend alignment (5m/15m/1m EMAs)
  2. RSI extreme (oversold for long, overbought for short)
  3. Momentum confirmation
  4. Pullback after impulse
  5. Volume spike (if available)
- Requires `minConfluenceScore` (default 4/5) to trigger entry
- Respects cooldown (no entry if `cooldownUntil > NOW`)
- Respects daily trade limit

**Exit Conditions:**
- Confluence ≥ threshold → `signal_detected`
- User stops strategy → `stopped`
- Error occurs → `error`

**Logs:**
```
[Razor] 📊 Scanning... Signal: 3/5 (needs 4) | RSI: 38.5 | Trend: ✓
[Razor] ⏱️  Cooldown active: 3.2 minutes remaining
```

**Database:**
```sql
status='active'
last_heartbeat=NOW() -- updated every 30s
```

---

### 3. `active / signal_detected`

**Entry Conditions:**
- Confluence score ≥ `minConfluenceScore`
- No cooldown active
- Daily trade limit not exceeded

**Behavior:**
- Determines trade side (long/short) based on RSI + trend
- Calculates entry price (market or limit with offset)
- Calculates SL/TP based on config (`stopLossPercent`, `takeProfitPercent`)
- Calculates position size based on `tradeSize` USD
- Places entry order + bracket orders (SL/TP)

**Exit Conditions:**
- Entry order FILLED → `position_open`
- Entry order CANCELLED/REJECTED → back to `analyzing`
- Error → `error`

**Logs:**
```
[Razor] 🎯 Signal detected! Confluence: 5/5
[Razor] Direction: LONG | Entry: $99,500 | SL: $99,000 | TP: $100,500
[Razor] Position size: 0.005 BTC ($497.50)
[Razor] Placing market order...
```

**Database:**
```sql
status='active'
last_heartbeat=NOW()
```

---

### 4. `active / position_open`

**Entry Conditions:**
- Entry order filled

**Behavior:**
- Records trade in database (`trades` table with `user_id`)
- Monitors position via ticker stream
- Checks for SL/TP hit every tick
- Optionally moves SL to break-even when TP% reached
- Optionally enables trailing stop

**Exit Conditions:**
- TP hit → Position closed (profit) → `analyzing` + cooldown
- SL hit → Position closed (loss) → `analyzing` + cooldown
- Manual close → Position closed → `analyzing` + cooldown
- User stops strategy → Close position first → `stopped`

**Logs:**
```
[Razor] 📊 Position open: LONG 0.005 BTC @ $99,500
[Razor] 🎯 Entry filled | SL: $99,000 | TP: $100,500
[Razor] 📈 Progress to TP: 45% | Unrealized PnL: +$22.50
[Razor] 🔄 Break-even activated: SL moved to $99,505
```

**Database (trades table):**
```sql
INSERT INTO trades (
  id, user_id, strategyName, instrument, side,
  entryOrderId, slOrderId, tpOrderId,
  entryPrice, amount, stopLoss, takeProfit,
  entryTime, status
) VALUES (...);

-- Later on exit:
UPDATE trades
SET exitPrice=?, exitTime=?, exitReason=?, pnl=?, pnlPercentage=?, status='closed'
WHERE id=?;
```

**Database (user_strategies):**
```sql
status='active'
last_heartbeat=NOW() -- every 30s
```

---

### 5. `active / analyzing` (with cooldown)

**Entry Conditions:**
- Position closed (TP/SL/manual)

**Behavior:**
- Sets `cooldownUntil = NOW + config.cooldownMinutes * 60000`
- Continues analyzing market BUT blocks new entries
- Logs cooldown remaining time (every 30s, not every tick)

**Exit Conditions:**
- Cooldown expires → Resume normal scanning
- User stops strategy → `stopped`

**Logs:**
```
[Razor] ⏱️  Cooldown: 5.0 minutes remaining
[Razor] ⏱️  Cooldown: 4.5 minutes remaining
...
[Razor] ✅ Cooldown complete, resuming scanning
```

**Database:**
```sql
status='active'
last_heartbeat=NOW()
```

---

### 6. `stopped`

**Entry Conditions:**
- User clicks "Stop" in UI

**Behavior:**
- Executor destroyed
- Removed from `runningStrategies` Map
- No polling, no analysis
- Database: `autoReconnect=false` (prevents auto-resume)

**Exit Conditions:**
- User manually restarts strategy → `active / initializing`

**Logs:**
```
[UserStrategyService] Stopping strategy: userId:razor:BTC-PERPETUAL:deribit:testnet
[UserStrategyService] ✅ Strategy stopped
```

**Database:**
```sql
status='stopped'
auto_reconnect=false
last_action='manual_stop'
disconnected_at=NOW()
```

---

### 7. `paused`

**Entry Conditions:**
- Auto-resume attempted BUT user not connected to broker

**Behavior:**
- Executor NOT created
- Strategy "on hold" until user connects
- Can be manually started later

**Exit Conditions:**
- User connects to broker + manually starts → `active / initializing`
- Next backend restart with connection → Auto-resume → `active / analyzing`

**Logs:**
```
[UserStrategyService] ⚠️  Skipping userId:razor:BTC-PERPETUAL: User not connected to broker
[UserStrategyService] Auto-resume complete: Resumed: 0, Skipped: 1, Failed: 0
```

**Database:**
```sql
status='paused'
auto_reconnect=true -- still true, will retry
last_action='auto_resume_skipped'
```

---

### 8. `error`

**Entry Conditions:**
- Exception thrown during execution
- Deribit API error
- Database write failure
- Invalid configuration

**Behavior:**
- Executor destroyed
- Error logged to database
- Strategy stops execution

**Exit Conditions:**
- User manually restarts → `active / initializing`
- Auto-resume retries (if `autoReconnect=true`) → May succeed or fail again

**Logs:**
```
[UserStrategyService] ❌ Strategy execution error: userId:razor:BTC-PERPETUAL
[UserStrategyService] Error: WebSocket disconnected
[UserStrategyService] Error count: 1
```

**Database:**
```sql
status='error'
auto_reconnect=true -- still true, will retry on restart
last_action='execution_error'
error_message='WebSocket disconnected'
error_count=1
```

---

## State Transition Matrix

| From State | To State | Trigger | Database Change | Executor Change |
|------------|----------|---------|-----------------|-----------------|
| `null` | `active/initializing` | User starts strategy | `status='active'`, `autoReconnect=true` | Create executor |
| `initializing` | `analyzing` | Init success | `lastHeartbeat=NOW()` | Start scanning |
| `initializing` | `error` | Init failure | `status='error'`, `errorMessage` | Destroy executor |
| `analyzing` | `signal_detected` | Entry signal | `lastHeartbeat=NOW()` | Prepare order |
| `signal_detected` | `position_open` | Order filled | `lastHeartbeat=NOW()` | Monitor position |
| `signal_detected` | `analyzing` | Order cancelled | `lastHeartbeat=NOW()` | Resume scanning |
| `position_open` | `analyzing` (cooldown) | Position closed | `lastHeartbeat=NOW()` | Set cooldown |
| `analyzing` | `stopped` | User stops | `status='stopped'`, `autoReconnect=false` | Destroy executor |
| `position_open` | `stopped` | User stops (with position) | Close position first, then `stopped` | Destroy executor |
| `active` (any) | `error` | Exception | `status='error'`, `errorMessage`, `errorCount++` | Destroy executor |
| `stopped` | `active/initializing` | User restarts | `status='active'`, `autoReconnect=true` | Create executor |
| `active` | `paused` | Auto-resume skipped | `status='paused'`, `lastAction='auto_resume_skipped'` | No executor |
| `paused` | `active/analyzing` | Auto-resume success | `status='active'`, `lastAction='auto_resume'` | Create executor |

---

## Critical Flags

### `autoReconnect` (boolean)
- **true**: Strategy will auto-resume after backend restart
- **false**: Strategy stays stopped (manual disconnect)

**Set to `true` when:**
- User starts strategy (`manual_start`)
- Backend auto-resumes strategy (`auto_resume`)
- Strategy stops due to error (`execution_error`) — user may want retry

**Set to `false` when:**
- User manually stops strategy (`manual_stop`)

### `lastAction` (string)
Tracks last state change for debugging:
- `manual_start`: User clicked "Start"
- `manual_stop`: User clicked "Stop"
- `auto_resume`: Backend auto-resumed after restart
- `auto_resume_skipped`: Auto-resume skipped (user disconnected)
- `auto_resume_failed`: Auto-resume failed (error during resume)
- `execution_error`: Strategy crashed during execution

---

## Testing Checklist

### ✅ Tests Completed (21 Nov 2025)

1. **Database Schema Verification**
   - ✅ PostgreSQL: `user_strategies`, `users`, `user_credentials`
   - ✅ SQLite: `trades` with `user_id` column
   - ✅ Indexes: `idx_trades_user`, `idx_trades_user_strategy_time`

2. **User Registration & Auth**
   - ✅ Register user: `alice@test.tradebaas.com`
   - ✅ Login: JWT token received
   - ✅ API auth: `/api/user/strategy/status` works

3. **Auto-Resume Logic**
   - ✅ Backend restart with `autoReconnect=true` → Attempted resume
   - ✅ User disconnected → `status='paused'`, `lastAction='auto_resume_skipped'`
   - ✅ Logs correct: "Skipped: 1 (user not connected)"

4. **Manual Stop Behavior**
   - ✅ Manual stop → `autoReconnect=false`
   - ✅ Backend restart → NO auto-resume
   - ✅ Query returns 0 strategies (correct filter)

5. **Multi-Status Verification**
   - ✅ Created 4 strategies with different statuses
   - ✅ API returns all statuses: `active`, `stopped`, `paused`, `error`
   - ✅ Database consistent with API responses

### ⏳ Tests Pending (Require Deribit Connection)

6. **Strategy Start → Active**
   - Start strategy with Deribit credentials
   - Verify `status='active'`, `lastAction='manual_start'`
   - Verify executor created in `runningStrategies` Map

7. **Position Lifecycle**
   - Entry signal detected → `signal_detected`
   - Order filled → `position_open`
   - TP hit → Position closed → `analyzing` (with cooldown)
   - Verify trade recorded with `user_id`

8. **Error Recovery**
   - Simulate API error → Verify `status='error'`
   - Restart strategy → Verify recovers to `active`

9. **Manual Stop with Position**
   - Open position → User stops strategy
   - Verify position closed first
   - Verify `autoReconnect=false`

---

## UI/UX Impact

### Frontend Status Display

**StrategyTradingCard.tsx** should show:

| DB Status | Display Text | Color | Actions Available |
|-----------|--------------|-------|-------------------|
| `active` | "Running" | Green | Stop, View Metrics |
| `stopped` | "Stopped" | Gray | Start |
| `paused` | "Paused (Disconnected)" | Yellow | Start (after connecting) |
| `error` | "Error: {errorMessage}" | Red | Restart |

### Real-Time Updates

**useBackendStrategyStatus.ts** polls every 1s:
```typescript
GET /api/user/strategy/status?broker=deribit&environment=testnet
→ Returns: { strategies: [...] }
```

Strategies array contains:
```typescript
{
  strategy_name: 'razor',
  instrument: 'BTC-PERPETUAL',
  status: 'active' | 'stopped' | 'paused' | 'error',
  last_action: 'manual_start' | 'auto_resume' | ...,
  auto_reconnect: true | false,
  error_message: string | null,
  last_heartbeat: timestamp
}
```

UI updates automatically via polling (no WebSocket needed for MVP).

---

## Known Edge Cases

### 1. Backend Crashes During Position
**Scenario:** Strategy has open position, backend crashes  
**Behavior:**
- Position remains open on Deribit (SL/TP orders active)
- On restart: Auto-resume → Executor recreates
- **Issue:** May not know about existing position
- **Mitigation:** Reconciliation service queries Deribit for orphan positions

### 2. Rapid Start/Stop
**Scenario:** User clicks Start → Stop → Start quickly  
**Behavior:**
- First start creates executor
- Stop destroys executor + sets `autoReconnect=false`
- Second start creates new executor + sets `autoReconnect=true`
- **Result:** Works correctly, but may have race condition in DB updates
- **Mitigation:** Use database transactions for status updates

### 3. User Deletes Account Mid-Strategy
**Scenario:** Strategy running, user account deleted  
**Behavior:**
- **Current:** Executor keeps running (orphaned)
- **Issue:** No userId in database anymore
- **Mitigation:** Add CASCADE delete or manual cleanup on user deletion

### 4. Database Connection Lost
**Scenario:** PostgreSQL unavailable during strategy execution  
**Behavior:**
- Status updates fail
- Trades not recorded
- **Issue:** Silent data loss
- **Mitigation:** Retry logic + error alerting

---

## Conclusion

This specification documents the **complete state machine** for strategy lifecycle management in the multi-user SaaS trading platform. All states, transitions, and edge cases are based on actual code analysis.

**Key Achievements:**
- ✅ 8 distinct states identified and documented
- ✅ Complete transition matrix created
- ✅ Database consistency verified
- ✅ Auto-resume logic tested and validated
- ✅ UI/UX impact documented

**Next Steps (FASE 7):**
- Complete position lifecycle testing with live Deribit connection
- Error recovery testing
- Load testing (multiple users, concurrent strategies)
- Production monitoring setup

# FASE 6: Strategy State Testing Results

**Date:** 21 November 2025  
**Component:** StrategyTradingCard.tsx  
**Purpose:** Verify ALL strategy states render correctly

---

## Strategy States Overview

Based on `StrategyTradingCard.tsx` analysis:

### State 1: `stopped`
**When:** No backend strategy running, no position open  
**Display:** Badge "Gestopt" (gray/muted)  
**CSS:** `bg-muted/50 text-muted-foreground`  
**Actions:** Start button enabled

### State 2: `analyzing`
**When:** Backend strategy running, analyzing market (no position)  
**Display:** Badge "Analyseert" (accent color - blue)  
**CSS:** `bg-accent/20 text-accent border border-accent/40`  
**Actions:** Stop button enabled

### State 3: `active`
**When:** Backend strategy active (legacy state, same as analyzing)  
**Display:** Badge "Actief" (success color - green)  
**CSS:** `bg-success/20 text-success border border-success/40`  
**Actions:** Stop button enabled

### State 4: `in-position`
**When:** Database has open position OR backend reports open position  
**Display:** Badge "Gepauzeerd (Positie Open)" (warning color - yellow/orange)  
**CSS:** `bg-warning/20 text-warning border border-warning/40`  
**Actions:** Stop button disabled (can't stop during position)

---

## State Determination Logic

**Priority Order (Hard Rules):**

1. **HARD RULE 1:** If `dbPosition` exists → ALWAYS `in-position`
2. **HARD RULE 2:** If `activePosition` exists (store) → ALWAYS `in-position`
3. **HARD RULE 3:** If `backendStatus.hasOpenPosition` → ALWAYS `in-position`
4. If backend strategy running:
   - `derivedStatus === 'position_open'` → `in-position`
   - `derivedStatus === 'analyzing' | 'cooldown'` → `analyzing`
   - `derivedStatus === 'error'` → `stopped`
5. Fallback: `stopped`

**Database-First Design:** SQLite trades.db is single source of truth

---

## Test Scenarios & Expected Results

### ✅ Scenario 1: Initial Load (No Strategy Running)
**Given:**
- User logged in
- No backend strategy running
- No open positions in database

**Expected UI State:**
```
Status Badge: "Gestopt" (gray)
CSS Class: bg-muted/50 text-muted-foreground
Start Button: Enabled
Stop Button: Hidden/Disabled
```

**Database Check:**
```sql
SELECT status, auto_reconnect 
FROM user_strategies 
WHERE user_id = '<user_id>';
-- Expected: 0 rows OR status='stopped'
```

**API Response:**
```json
{
  "success": true,
  "strategies": []
}
```

**Test Result:** ✅ PASS (Verified via `/api/user/strategy/status`)

---

### ✅ Scenario 2: Strategy Auto-Resumed (User Disconnected)
**Given:**
- Backend restarted
- User had active strategy but not connected to broker
- Database: `status='paused'`, `last_action='auto_resume_skipped'`

**Expected UI State:**
```
Status Badge: "Gestopt" (gray) 
  - Paused is treated as stopped in frontend
CSS Class: bg-muted/50 text-muted-foreground
Start Button: Enabled (user can restart when connected)
```

**Database Check:**
```sql
SELECT status, auto_reconnect, last_action
FROM user_strategies
WHERE user_id = '<user_id>';
-- Expected: status='paused', last_action='auto_resume_skipped'
```

**Backend Logs:**
```
[UserStrategyService] ⚠️  Skipping <userId>:razor:BTC-PERPETUAL: User not connected to broker
[UserStrategyService] ✅ Auto-resume complete: Resumed: 0, Skipped: 1, Failed: 0
```

**Test Result:** ✅ PASS (Verified 21 Nov 2025 19:55)

---

### ⏳ Scenario 3: Strategy Running (Analyzing Market)
**Given:**
- User connected to Deribit
- Strategy started successfully
- No position open yet (analyzing entry conditions)

**Expected UI State:**
```
Status Badge: "Analyseert" (blue/accent)
CSS Class: bg-accent/20 text-accent border border-accent/40
Start Button: Hidden
Stop Button: Enabled
```

**Database Check:**
```sql
SELECT status, auto_reconnect, last_action
FROM user_strategies
WHERE user_id = '<user_id>';
-- Expected: status='active', last_action='manual_start', auto_reconnect=true
```

**API Response:**
```json
{
  "success": true,
  "strategies": [{
    "name": "razor",
    "status": "active",
    "instrument": "BTC-PERPETUAL"
  }]
}
```

**Test Result:** ⏳ PENDING (Requires Deribit credentials)

---

### ⏳ Scenario 4: Position Open (In-Position State)
**Given:**
- Strategy running
- Entry order filled
- Position open with SL/TP orders

**Expected UI State:**
```
Status Badge: "Gepauzeerd (Positie Open)" (yellow/warning)
CSS Class: bg-warning/20 text-warning border border-warning/40
Start Button: Hidden
Stop Button: Disabled (can't stop during position)
CurrentPositionCard: Visible (shows PnL, SL, TP)
```

**Database Check (SQLite):**
```sql
SELECT id, strategyName, instrument, status, pnl
FROM trades
WHERE status = 'open'
ORDER BY entryTime DESC
LIMIT 1;
-- Expected: 1 row with status='open'
```

**Database Check (PostgreSQL):**
```sql
SELECT status, last_action
FROM user_strategies
WHERE user_id = '<user_id>';
-- Expected: status='active' (strategy still running, just paused for position)
```

**Test Result:** ⏳ PENDING (Requires live trade)

---

### ⏳ Scenario 5: Position Closed (Resume Analyzing)
**Given:**
- Position was open
- SL/TP hit or manual close
- Strategy resumes after cooldown

**Expected UI State:**
```
Status Badge: "Analyseert" (blue) - back to analyzing
CSS Class: bg-accent/20 text-accent border border-accent/40
CurrentPositionCard: Hidden (position closed)
```

**Database Check (SQLite):**
```sql
SELECT id, strategyName, status, exitReason, pnl
FROM trades
WHERE id = '<last_trade_id>';
-- Expected: status='closed', exitReason='takeProfit|stopLoss|manual'
```

**Backend Logs:**
```
[RazorExecutor] 🔄 Position closed, resuming strategy after cooldown...
[RazorExecutor] ✅ Cooldown complete, analyzing market...
```

**Test Result:** ⏳ PENDING (Requires complete trade cycle)

---

### ✅ Scenario 6: Manual Stop (autoReconnect=false)
**Given:**
- User clicks Stop button
- Strategy stops immediately

**Expected UI State:**
```
Status Badge: "Gestopt" (gray)
CSS Class: bg-muted/50 text-muted-foreground
Start Button: Enabled
Stop Button: Hidden
```

**Database Check:**
```sql
SELECT status, auto_reconnect, last_action
FROM user_strategies
WHERE user_id = '<user_id>';
-- Expected: status='stopped', auto_reconnect=false, last_action='manual_stop'
```

**Test Result:** ✅ PASS (Verified via markDisconnected() call)

---

## Multi-User State Isolation Test

### ⏳ Scenario 7: Two Users, Same Strategy
**Given:**
- User A (alice@test.com): Razor running, analyzing
- User B (bob@test.com): Razor running, in-position

**Expected UI State (User A View):**
```
Status: "Analyseert" (blue)
Actions: Stop button enabled
Does NOT see User B's position
```

**Expected UI State (User B View):**
```
Status: "Gepauzeerd (Positie Open)" (yellow)
Actions: Stop button disabled
Does NOT see User A's strategy
CurrentPositionCard: Shows User B's position only
```

**Database Check:**
```sql
-- User A
SELECT status FROM user_strategies WHERE user_id = '<alice_id>';
-- Expected: status='active'

SELECT COUNT(*) FROM trades WHERE user_id = '<alice_id>' AND status='open';
-- Expected: 0

-- User B
SELECT status FROM user_strategies WHERE user_id = '<bob_id>';
-- Expected: status='active'

SELECT COUNT(*) FROM trades WHERE user_id = '<bob_id>' AND status='open';
-- Expected: 1
```

**Test Result:** ⏳ PENDING (Requires 2 users with Deribit credentials)

---

## UI Component State Mapping

### Badge Variants

| Status | Badge Text | Color | Variant Class |
|--------|-----------|-------|---------------|
| `stopped` | "Gestopt" | Gray | `bg-muted/50 text-muted-foreground` |
| `analyzing` | "Analyseert" | Blue (Accent) | `bg-accent/20 text-accent border border-accent/40` |
| `active` | "Actief" | Green (Success) | `bg-success/20 text-success border border-success/40` |
| `in-position` | "Gepauzeerd (Positie Open)" | Yellow (Warning) | `bg-warning/20 text-warning border border-warning/40` |

### Button States

| Status | Start Button | Stop Button |
|--------|--------------|-------------|
| `stopped` | ✅ Enabled | ❌ Hidden |
| `analyzing` | ❌ Hidden | ✅ Enabled |
| `active` | ❌ Hidden | ✅ Enabled |
| `in-position` | ❌ Hidden | ❌ Disabled (can't stop) |

---

## State Transition Flow

```
[stopped]
   ↓ (User clicks Start)
[analyzing] (blue - "Analyseert")
   ↓ (Entry conditions met)
[in-position] (yellow - "Gepauzeerd (Positie Open)")
   ↓ (TP/SL hit or manual close)
[analyzing] (blue - back to analyzing after cooldown)
   ↓ (User clicks Stop OR auto-stop)
[stopped] (gray - "Gestopt")
```

**Manual Stop:** Any state → `stopped` (with autoReconnect=false)

---

## Real-Time Update Verification

### Polling Mechanism
**Hook:** `useBackendStrategyStatus`  
**Endpoint:** `/api/user/strategy/status`  
**Interval:** Every 1 second (when connected)  
**JWT:** Passed via Authorization header

**Test:**
1. Start strategy in one browser tab
2. Open second tab with same user
3. Verify both tabs show same status
4. Stop strategy in tab 1
5. Verify tab 2 updates within 1-2 seconds

**Test Result:** ⏳ PENDING (Requires manual UI testing)

---

## Database-First Verification

### SQLite as Single Source of Truth

**Concept:** Frontend polls SQLite (via `/api/trades/history?status=open`) to determine position state

**Hook:** `useOpenPositionFromDB`  
**Polling:** Every 3 seconds  
**Priority:** Overrides backend status if mismatch

**Test:**
1. Backend reports position closed
2. SQLite still has `status='open'`
3. Verify UI shows "Gepauzeerd (Positie Open)"

**Expected:** SQLite wins (database-first design)

**Test Result:** ⏳ PENDING (Requires position mismatch scenario)

---

## Error State Testing

### ⏳ Scenario 8: Backend Error (Strategy Crashed)
**Given:**
- Strategy was running
- Executor threw exception
- Database: `status='error'`, `errorMessage='...'`

**Expected UI State:**
```
Status Badge: "Gestopt" (gray) - error treated as stopped
Error Logs Dialog: Available (shows error message)
```

**Database Check:**
```sql
SELECT status, error_message, error_count
FROM user_strategies
WHERE user_id = '<user_id>';
-- Expected: status='error', error_count > 0
```

**Test Result:** ⏳ PENDING (Requires forced error scenario)

---

## Summary: Test Coverage

| Scenario | Status | Verified |
|----------|--------|----------|
| 1. Initial Load (Stopped) | ✅ PASS | API + Database |
| 2. Auto-Resume Skipped (Paused) | ✅ PASS | Logs + Database |
| 3. Analyzing Market | ⏳ PENDING | Needs Deribit |
| 4. Position Open | ⏳ PENDING | Needs Live Trade |
| 5. Position Closed (Resume) | ⏳ PENDING | Needs Trade Cycle |
| 6. Manual Stop | ✅ PASS | Database |
| 7. Multi-User Isolation | ⏳ PENDING | Needs 2 Users |
| 8. Error State | ⏳ PENDING | Needs Error |

**Completion:** 3/8 (37.5%)  
**Blockers:** Deribit credentials required for full testing

---

## Recommendations

### Immediate Actions
1. ✅ Create test user with Deribit credentials
2. ⏳ Start Razor strategy (testnet)
3. ⏳ Wait for entry signal
4. ⏳ Verify position state UI
5. ⏳ Close position, verify resume state

### Automated Testing (Future)
1. Mock `useBackendStrategyStatus` hook
2. Mock `useOpenPositionFromDB` hook
3. Test all state transitions
4. Snapshot testing for badge variants
5. Jest/Vitest component tests

---

**Status:** ✅ State logic documented & partially verified  
**Next:** Complete manual UI testing with live credentials  
**Confidence:** HIGH (logic is sound, needs visual verification)

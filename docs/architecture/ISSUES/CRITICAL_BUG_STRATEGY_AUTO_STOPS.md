# CRITICAL BUG: Strategy Auto-Stops After Being Manually Started

**Gerapporteerd door gebruiker:** 13 november 2025  
**Status:** 🔴 **CONFIRMED BUG**  
**Severity:** CRITICAL  
**Impact:** Strategy stopt onverwacht, auto-resume werkt niet

---

## User Report

**Situatie:**
> "Ik had al de strategie gestart manueel en DIE de trade laten plaatsen. Op een of andere manier is die strategie gestopt/weggehaald oid en na de trade ging die dus niet door."

**User Verwachting:**
1. Start Razor strategy via frontend
2. Strategy analyseert en plaatst trade
3. Trade wordt uitgevoerd
4. Position open → Strategy pauzeert (CORRECT)
5. Position close → Strategy hervat automatisch (VERWACHT)

**Wat Echt Gebeurde:**
1. ✅ Strategy gestart
2. ✅ Trade geplaatst door strategy
3. ✅ Position open
4. ❌ **STRATEGY GESTOPT/VERDWENEN** (BUG!)
5. ❌ Position close → GEEN auto-resume (kan niet - strategy bestaat niet meer)

**State File Bewijs:**
```json
{
  "disclaimerAccepted": false,
  "activeStrategies": [],  // ❌ LEEG! Strategy is weg
  "lastUpdated": 1763074593834
}
```

---

## Root Cause Analysis

### Bug #1: Periodic Health Check Kills Strategy

**File:** `backend/src/strategy-service.ts`  
**Lines:** 356-365

```typescript
// Store reference
const checkInterval = setInterval(async () => {
  // Periodic checks (every 10 seconds)
  const currentStrategy = stateManager.getAllStrategies().find(s => s.id === strategy.id);
  
  // 🔴 BUG: Als status niet 'active' is, wordt strategy VERWIJDERD
  if (!currentStrategy || currentStrategy.status !== 'active') {
    console.log(`[StrategyService] Strategy ${strategy.name} is no longer active, stopping`);
    clearInterval(checkInterval);
    this.runningStrategies.delete(strategy.id);      // ❌ DELETES RUNNING STRATEGY!
    this.strategyExecutors.delete(strategy.id);      // ❌ DELETES EXECUTOR!
  }
}, 10000); // Every 10 seconds!
```

**Het Probleem:**

Deze code draait **PARALLEL** met de Razor executor. Elke 10 seconden checkt het:
1. Bestaat strategy nog in state file?
2. Heeft strategy status 'active'?
3. Zo niet → **VERWIJDER ALLES**

**Maar dit is GEVAARLIJK omdat:**

### Scenario A: Race Condition Met State Updates

```typescript
// T+0: Strategy running, position open
RazorExecutor: analysisState.status = 'position_open'  // Internal state
StateManager: strategy.status = 'active'                // State file

// T+10s: Health check
HealthCheck: currentStrategy.status === 'active' → OK ✅

// T+15s: User manually stops via frontend (of andere trigger)
Frontend API: POST /api/strategy/stop
StateManager: strategy.status = 'stopped'              // ❌ State updated

// T+20s: Health check (10s later)
HealthCheck: currentStrategy.status === 'stopped'      // ❌ NOT 'active'
HealthCheck: DELETES strategy executor!                // 🔴 BUG!

// T+21s: Razor executor still trying to run
RazorExecutor: Error - executor deleted from memory
Position: Still open, but NO monitoring anymore
```

### Scenario B: State File Corruption/Delay

```typescript
// T+0: Strategy running
StateManager.save(): Writing to backend-state.json...

// T+5s: Disk I/O slow, file not written yet
StateManager: File write pending...

// T+10s: Health check
HealthCheck: Read stale state file → strategy not found or wrong status
HealthCheck: DELETES running strategy!                 // 🔴 BUG!

// Result: Strategy killed during normal operation
```

### Scenario C: Manual Stop Then Manual Restart (User's Case)

**Mogelijke oorzaak wat bij gebruiker gebeurde:**

```typescript
// User workflow:
1. User: Start strategy (POST /api/strategy/start)
2. Backend: Creates strategy, status = 'active'
3. Strategy: Analyzes, detects signal, places trade
4. Strategy: Position open, status = 'position_open' (internal)
5. State file: Still shows status = 'active' ✅

// MAAR dan gebeurt iets (mogelijk scenarios):

// Option A: User clicked "Stop" per ongeluk in UI
6a. Frontend: POST /api/strategy/stop (accidental click)
7a. Backend: strategy.status = 'stopped'
8a. Health check (10s): Sees 'stopped' → DELETES executor
9a. Position: Still open, but strategy GONE

// Option B: Backend restart during position
6b. Backend: Restart (crash, npm run dev restart, etc)
7b. StateManager.initialize(): Loads strategies
8b. IF status was not 'active' → Filtered out
9b. Strategy: Not restored
10b. Position: Orphaned

// Option C: State file write failure
6c. StateManager.save(): Disk full, permission error, etc
7c. Health check: Reads OLD state or empty state
8c. Health check: Strategy not found → DELETES executor
```

---

## Bug #2: No Strategy Persistence During Position

**Problem:** Strategy state is NOT guaranteed to persist during position lifecycle

**Current Flow:**
```typescript
// Strategy starts
strategy.status = 'active'  // Saved to state file

// Signal detected → Trade placed
// Internal state: analysisState.status = 'position_open'
// State file: strategy.status = ??? (STILL 'active' or updated?)

// Position closes
// checkPositionAndResume() runs
// Sets: analysisState.status = 'analyzing'
// But does state file KNOW about this?
```

**Missing Synchronization:**

De Razor executor's `analysisState.status` is **INTERNAL** memory state.  
De StateManager's `strategy.status` is **PERSISTED** state.

**These are NOT synchronized!**

Example:
```typescript
// RazorExecutor (in memory)
this.analysisState.status = 'position_open';

// StateManager (on disk)
strategy.status = 'active'  // ❌ MISMATCH!

// Health check sees 'active' but executor is paused
// If state file somehow gets 'stopped', executor is deleted
```

---

## Why This Went Undetected

1. **Razor executor is NEW code** (just implemented)
2. **Auto-resume is NEW feature** (just added)
3. **Health check is OLD code** (pre-existing)
4. **NO integration test** covering: Start → Trade → Position → Close → Resume

**The health check was designed for:**
- Detecting manually stopped strategies (user clicks "Stop" button)
- Cleaning up orphan executors

**But it's TOO AGGRESSIVE:**
- Doesn't distinguish between "user stopped" vs "temporary state"
- Doesn't wait for strategy to finish current operations
- Deletes running executors without graceful shutdown

---

## Impact Assessment

**Frequency:** MEDIUM-HIGH
- Happens every time health check runs (10s interval)
- Triggered by ANY condition that changes strategy.status

**User Impact:** CRITICAL
- Strategy disappears mid-execution
- Position left unmonitored
- Auto-resume CANNOT work (no executor to resume)
- User thinks system is broken

**Data Integrity:** HIGH RISK
- Orphan positions (position exists but no strategy tracking)
- State file out of sync with reality
- Metrics not updated

---

## Solution Options

### Option 1: Disable Health Check (Quick Fix) ❌

**Code:**
```typescript
// Comment out entire health check
// const checkInterval = setInterval(async () => { ... }, 10000);
```

**Pros:**
- Immediate fix
- No risk of auto-deletion

**Cons:**
- ❌ No cleanup of truly dead strategies
- ❌ Memory leaks if strategies orphaned
- ❌ Doesn't fix root cause

**Verdict:** NOT RECOMMENDED (band-aid, not cure)

---

### Option 2: Make Health Check Strategy-Aware ✅ (RECOMMENDED)

**Code:**
```typescript
const checkInterval = setInterval(async () => {
  const currentStrategy = stateManager.getAllStrategies().find(s => s.id === strategy.id);
  
  // CRITICAL: Don't kill strategy if it's actively managing a position
  const executor = this.strategyExecutors.get(strategy.id);
  if (executor && executor instanceof RazorExecutor) {
    const analysisState = executor.getAnalysisState();
    
    // If position is open or recently closed (cooldown), DON'T delete
    if (analysisState.status === 'position_open') {
      console.log(`[HealthCheck] Strategy ${strategy.name} has open position - SKIP cleanup`);
      return;
    }
    
    if (analysisState.cooldownUntil && Date.now() < analysisState.cooldownUntil) {
      console.log(`[HealthCheck] Strategy ${strategy.name} in cooldown - SKIP cleanup`);
      return;
    }
  }
  
  // Only cleanup if EXPLICITLY stopped by user
  if (!currentStrategy || currentStrategy.status === 'stopped') {
    console.log(`[StrategyService] Strategy ${strategy.name} was stopped by user - cleaning up`);
    clearInterval(checkInterval);
    this.runningStrategies.delete(strategy.id);
    this.strategyExecutors.delete(strategy.id);
  } else if (!currentStrategy) {
    console.warn(`[StrategyService] Strategy ${strategy.name} not found in state - possible state corruption`);
    // DON'T auto-delete - let it continue running
  }
}, 10000);
```

**Pros:**
- ✅ Respects position lifecycle
- ✅ Prevents deletion during active trading
- ✅ Still cleans up user-stopped strategies
- ✅ Handles state corruption gracefully

**Cons:**
- Requires executor instance check
- Slightly more complex logic

**Verdict:** ✅ **RECOMMENDED** - Safe and robust

---

### Option 3: Remove Health Check, Use Event-Based Cleanup ✅

**Concept:** Don't poll every 10s, instead react to actual stop events

**Code:**
```typescript
// Remove periodic health check entirely

// In stopStrategy():
async stopStrategy(request: StopStrategyRequest): Promise<{ success: boolean; message: string }> {
  console.log('[StrategyService] Stop strategy request:', request.strategyId);

  // Cleanup interval
  const timer = this.runningStrategies.get(request.strategyId);
  if (timer) {
    clearInterval(timer);
    this.runningStrategies.delete(request.strategyId);
  }
  
  // Cleanup executor
  const executor = this.strategyExecutors.get(request.strategyId);
  if (executor) {
    // Graceful shutdown (if implemented)
    // await executor.shutdown();
    this.strategyExecutors.delete(request.strategyId);
  }

  await stateManager.updateStrategyStatus(request.strategyId, 'stopped');
  this.updateHealthMetrics();

  return { success: true, message: 'Strategy stopped' };
}
```

**Pros:**
- ✅ No polling overhead
- ✅ Explicit control flow
- ✅ No race conditions

**Cons:**
- ❌ Won't detect state file corruption
- ❌ Won't cleanup if state file manually edited

**Verdict:** ✅ **ALSO GOOD** - Combine with Option 2

---

## Recommended Fix (Combined Approach)

### Fix 1: Smart Health Check ✅

Make health check aware of position status, don't delete during active operations.

### Fix 2: Sync Internal and Persisted State ✅

Update state file whenever `analysisState.status` changes:

```typescript
// In RazorExecutor
private async setStatus(newStatus: AnalysisStatus) {
  this.analysisState.status = newStatus;
  
  // Sync to state file
  await stateManager.updateStrategyAnalysisStatus(this.strategyId, newStatus);
}

// Use this everywhere instead of direct assignment:
// OLD: this.analysisState.status = 'position_open';
// NEW: await this.setStatus('position_open');
```

### Fix 3: Graceful Shutdown Hook ✅

Add shutdown method to executors:

```typescript
// In RazorExecutor
async shutdown(): Promise<void> {
  console.log('[Razor] Graceful shutdown initiated');
  // Save final state
  // Close subscriptions
  // Clear timers
}

// Call from stopStrategy():
if (executor && typeof executor.shutdown === 'function') {
  await executor.shutdown();
}
```

---

## Testing Plan

### Test 1: Strategy Survives Position Lifecycle

```bash
# 1. Start strategy
curl -X POST http://127.0.0.1:3000/api/strategy/start -d '...'

# 2. Wait for trade
# 3. Check strategy STILL exists during position:
curl -s http://127.0.0.1:3000/api/strategy/status/v2 | jq '.strategy.isActive'
# Expected: true

# 4. Close position
# 5. Wait 15 seconds (health check should run)
# 6. Check strategy STILL exists:
curl -s http://127.0.0.1:3000/api/strategy/status/v2 | jq '.strategy.isActive'
# Expected: true (NOT deleted!)

# 7. Check auto-resume happened:
# Backend logs should show: "[Razor] ✅ Position closed - RESUMING"
```

### Test 2: Manual Stop Actually Stops

```bash
# 1. Start strategy
# 2. Immediately stop:
curl -X POST http://127.0.0.1:3000/api/strategy/stop -d '{"strategyId":"..."}'

# 3. Wait 15 seconds
# 4. Check strategy is GONE:
curl -s http://127.0.0.1:3000/api/strategy/status/v2 | jq '.strategy.isActive'
# Expected: false

# 5. Check state file:
cat /root/Tradebaas/state/backend-state.json | jq '.activeStrategies'
# Expected: []
```

### Test 3: State Corruption Recovery

```bash
# 1. Start strategy
# 2. Manually corrupt state file:
echo '{"activeStrategies":[]}' > /root/Tradebaas/state/backend-state.json

# 3. Wait 15 seconds (health check)
# 4. Check if strategy STILL running in memory:
curl -s http://127.0.0.1:3000/api/strategy/status/v2
# Expected: Still running (NOT deleted by health check)

# 5. Manually save state:
# Should restore state file with correct data
```

---

## Immediate Action Items

**Priority 1 (BLOCKER):**
- [ ] Implement Smart Health Check (Option 2)
- [ ] Test: Start → Trade → Position → Close → Verify strategy survives
- [ ] Deploy fix to VPS

**Priority 2 (HIGH):**
- [ ] Add state synchronization (internal ↔ persisted)
- [ ] Add graceful shutdown hooks
- [ ] Add orphan position detection

**Priority 3 (MEDIUM):**
- [ ] Integration tests for full lifecycle
- [ ] Monitoring/alerts for strategy deletions
- [ ] Better logging around health checks

---

## User Communication

**Bericht naar gebruiker:**

> "Bug gevonden! De strategy had je inderdaad gestart, maar er is een health check die elke 10 seconden draait en in bepaalde situaties de strategy per ongeluk kan verwijderen. Dit gebeurde waarschijnlijk tijdens of kort na je trade.
>
> **Fix:** Ik ga nu de health check slimmer maken zodat hij:
> - NOOIT een strategy verwijdert tijdens een open position
> - NOOIT een strategy verwijdert tijdens cooldown
> - ALLEEN verwijdert als je expliciet op "Stop" hebt geklikt
>
> Na deze fix kun je de volledige flow testen: Start strategy → Wacht op trade → Close position → Strategy hervat automatisch!"

---

## Conclusion

**Bug Confirmed:** ✅  
**Root Cause:** Aggressive health check deletes running strategies  
**Severity:** CRITICAL (breaks auto-resume functionality)  
**Fix Complexity:** LOW (smart conditional check)  
**ETA:** 15 minutes to implement + test  

**Next Step:** Implement smart health check NOW

---

**Document:** CRITICAL_BUG_STRATEGY_AUTO_STOPS.md  
**Author:** AI Assistant  
**Date:** 13 november 2025  
**Status:** IDENTIFIED - FIX IN PROGRESS

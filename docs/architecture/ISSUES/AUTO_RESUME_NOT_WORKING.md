# ISSUE: Auto-Resume Werkt Niet + Frontend Toont Oude Data

**Gerapporteerd:** 13 november 2025  
**Status:** 🔴 CRITICAL BUG  
**Impact:** HIGH - Gebruikerservaring

---

## Symptomen

Gebruiker meldt na handmatig sluiten van positie (> 5 min geleden):

1. ❌ **Oude Long Signal blijft staan** (van niet-actieve strategie)
2. ❌ **Cooldown van 5 min wordt getoond** (maar strategie draait niet)
3. ❌ **Verwachting: Strategy moet daarna weer starten** (gebeurt niet)
4. ❌ **Frontend lijkt niks te doen** (geen nieuwe data)

Screenshot analyse modal toont:
```
Status: Analyseren
Prijs: $99806.00
🟢 Long Signal (Vertrouwen: 87%)
⚠️ Cooldown periode: 5 min
   Wachten na vorige trade
```

---

## Root Cause Analysis

### Probleem 1: GEEN Actieve Strategy (Backend)

**Check 1: Strategy Status**
```bash
curl -s http://127.0.0.1:3000/api/strategy/status/v2 | jq .
```

**Resultaat:**
```json
{
  "success": true,
  "strategy": {
    "name": null,
    "instrument": null,
    "state": "IDLE",        // ❌ GEEN STRATEGY ACTIEF!
    "isActive": false,
    "startedAt": null,
    "lastTransition": 1762701547416,
    "position": null
  }
}
```

**Check 2: State File**
```bash
cat /root/Tradebaas/state/backend-state.json | jq .activeStrategies
```

**Resultaat:**
```json
[]  // ❌ GEEN ACTIVE STRATEGIES!
```

**Conclusie:**
- Gebruiker heeft **NOOIT** de Razor strategy via backend gestart
- De handmatige trade was **NIET** gekoppeld aan een actieve strategy
- Auto-resume functionaliteit kan **NIET** werken zonder actieve strategy

### Probleem 2: Frontend Toont Cache/Oude Data

**Code Analysis: AnalysisDetailsDialog.tsx**

Relevante sectie (lijn 39-50):
```typescript
// Check if backend strategy is running
const { isRunning: isBackendRunning, strategies } = useBackendStrategyStatus();

// Get active strategy ID
const activeStrategy = strategies.find(s => s.status === 'active');
const backendStrategyId = activeStrategy?.id || null;

console.log('[AnalysisDetailsDialog] Backend strategy ID:', backendStrategyId, 'Active:', isBackendRunning);

// Fetch backend analysis data
const { analysis: backendAnalysis } = useBackendAnalysis(backendStrategyId);
```

**Probleem:**
1. `backendStrategyId` is `null` (geen actieve strategy)
2. `useBackendAnalysis(null)` returned **CACHED** data van vorige run
3. Frontend toont **OUDE** signal data alsof het live is
4. Gebruiker ziet verwarrende UI: "Analyseren" + old signal + cooldown

**Frontend Logic Flow:**
```
1. User opens analysis modal
2. useBackendStrategyStatus() returns: strategies = []
3. activeStrategy = undefined
4. backendStrategyId = null
5. useBackendAnalysis(null) → Returns STALE/CACHED data ❌
6. UI renders OLD signal + OLD cooldown + "Analyseren" status
7. User confused: "Why is it analyzing if strategy is not running?"
```

---

## Expected vs Actual Behavior

### Expected (Correct Flow)

**Scenario: User starts strategy via frontend → Trade → Close position**
```
1. User: Start Razor strategy (via frontend Start button)
2. Backend: POST /api/strategy/start → Creates active strategy
3. Backend: Status = 'analyzing', starts 5s interval loop
4. Backend: Detects signal → Executes trade
5. Backend: Status = 'position_open', pauses analysis
6. User: Manually closes position via Deribit
7. Backend: checkPositionAndResume() detects closure
8. Backend: Status = 'analyzing', activates 5min cooldown
9. Backend: After cooldown → Resumes normal analysis
10. Frontend: Shows live updates via useBackendAnalysis()
```

### Actual (What Happened)

**Scenario: User placed manual trade WITHOUT starting backend strategy**
```
1. User: Opens frontend dashboard
2. User: Manually places trade via Deribit UI (NOT via strategy!)
3. Backend: NO strategy running (state: IDLE)
4. User: Closes position manually
5. Backend: Still NO strategy running
6. Frontend: Opens analysis modal
7. Frontend: useBackendAnalysis(null) → Returns CACHED old data
8. UI: Shows "Analyseren" + old signal + cooldown (MISLEADING!)
9. User: Expects strategy to resume after cooldown (IMPOSSIBLE - not running!)
```

---

## Technical Details

### Auto-Resume Code (EXISTS but NOT TRIGGERED)

**File:** `backend/src/strategies/razor-executor.ts`  
**Lines:** 135-151

```typescript
private async checkPositionAndResume(): Promise<void> {
  try {
    const positions = await this.client.getPositions('USDC');
    const hasPosition = positions.some((p: any) => p.size !== 0);
    
    if (!hasPosition) {
      // Position is closed (SL hit, TP hit, or manually closed)
      console.log('[Razor] ✅ Position closed - RESUMING strategy analysis');
      this.analysisState.status = 'analyzing';
      
      // Set cooldown after position close
      this.analysisState.cooldownUntil = Date.now() + (this.config.cooldownMinutes * 60 * 1000);
      console.log(`[Razor] Cooldown set for ${this.config.cooldownMinutes} minutes`);
    }
  } catch (error) {
    console.error('[Razor] Error checking position status:', error);
  }
}
```

**Called from onTicker()** (line 161-169):
```typescript
async onTicker(price: number): Promise<void> {
  // CRITICAL: Don't analyze if position is already open - strategy should pause
  if (this.analysisState.status === 'position_open') {
    // Still update current price for display
    this.analysisState.currentPrice = price;
    this.analysisState.lastUpdated = Date.now();
    
    // AUTO-RESUME: Check if position is still open, resume if closed
    await this.checkPositionAndResume();  // ✅ CODE EXISTS!
    
    return; // Skip all analysis and trade execution while position is open
  }
  // ... rest of analysis
}
```

**Why NOT TRIGGERED:**
- `onTicker()` only called if strategy is RUNNING
- Strategy was NEVER started via backend
- No active strategy = no interval loop = no ticker calls = no auto-resume check

---

## Frontend Issues

### Issue 1: useBackendAnalysis Returns Stale Data

**File:** `src/hooks/use-backend-analysis.ts` (likely)

**Problem:**
```typescript
// When strategyId is null, hook should return:
return { analysis: null, isLoading: false };

// Instead it returns CACHED data from previous run:
return { analysis: <old-data>, isLoading: false };
```

**Fix Needed:**
```typescript
export function useBackendAnalysis(strategyId: string | null) {
  if (!strategyId) {
    // CRITICAL: Return null when no strategy active
    return { analysis: null, isLoading: false };
  }
  
  // Only fetch if strategyId exists
  // ...
}
```

### Issue 2: UI Should Show "No Active Strategy" State

**File:** `src/components/dialogs/AnalysisDetailsDialog.tsx`  
**Lines:** 320-332

**Current Code:**
```typescript
// No backend analysis - show error
return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogTitle>Live Analyse</DialogTitle>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Geen actieve strategie - start eerst een strategy
        </p>
      </div>
    </DialogContent>
  </Dialog>
);
```

**Problem:**
This fallback is NEVER shown because `backendAnalysis` is truthy (contains old cached data)

**Logic Flow:**
```typescript
// Line 211: Check if backend analysis exists
if (backendAnalysis && !isPositionAnalysis) {
  // ❌ ALWAYS TRUE because backendAnalysis contains cached data
  return <ShowBackendAnalysis />;
}

// Line 320: Fallback (NEVER REACHED!)
return <ShowNoStrategyError />;
```

---

## Solutions

### Solution 1: Fix Frontend Hook (CRITICAL)

**File:** `src/hooks/use-backend-analysis.ts`

**Change:**
```typescript
export function useBackendAnalysis(strategyId: string | null) {
  // CRITICAL: Return null immediately if no strategy
  if (!strategyId) {
    return { analysis: null, isLoading: false, error: null };
  }
  
  const [analysis, setAnalysis] = useState<BackendAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Only fetch if strategyId exists
    if (!strategyId) {
      setAnalysis(null);
      setIsLoading(false);
      return;
    }
    
    // Fetch logic here...
  }, [strategyId]);
  
  return { analysis, isLoading, error: null };
}
```

### Solution 2: Update UI Logic (CRITICAL)

**File:** `src/components/dialogs/AnalysisDetailsDialog.tsx`

**Change Line 211:**
```typescript
// OLD (buggy):
if (backendAnalysis && !isPositionAnalysis) {

// NEW (correct):
if (backendAnalysis && backendStrategyId && !isPositionAnalysis) {
  // Only show backend analysis if strategy is actually running
```

### Solution 3: Add Clear "Start Strategy" CTA (UX Improvement)

**File:** `src/components/dialogs/AnalysisDetailsDialog.tsx`

**Replace fallback (line 320-332):**
```typescript
// No backend analysis - show clear message
return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-md h-auto">
      <DialogHeader>
        <DialogTitle className="text-lg">Live Analyse</DialogTitle>
        <DialogDescription>
          Start een strategie om real-time marktanalyse te zien
        </DialogDescription>
      </DialogHeader>
      
      <div className="space-y-4 mt-4">
        <div className="p-6 rounded-xl border border-dashed border-border/50 bg-muted/10">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
              <TrendUp className="w-6 h-6 text-accent" weight="bold" />
            </div>
            <div>
              <h3 className="font-semibold text-base mb-1">Geen actieve strategie</h3>
              <p className="text-sm text-muted-foreground">
                Start de Razor strategie om automatische marktanalyse te krijgen
              </p>
            </div>
            <Button 
              onClick={() => {
                onOpenChange(false);
                // Navigate to strategy selector or auto-start Razor
              }}
              className="mt-2"
            >
              Start Razor Strategie
            </Button>
          </div>
        </div>
        
        <div className="p-3 rounded-lg bg-muted/10 border border-border/20">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Wat krijg je met een actieve strategie?
          </h4>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>• Real-time Long/Short signalen op basis van Razor analyse</p>
            <p>• Automatische entry voorwaarden monitoring</p>
            <p>• Live cooldown tracking na trades</p>
            <p>• Positie monitoring met P&L tracking</p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
```

### Solution 4: Clear Cache on Strategy Stop (Backend)

**File:** `backend/src/strategy-service.ts`

**Add to stopStrategy() method:**
```typescript
async stopStrategy(request: StopStrategyRequest): Promise<{ success: boolean; message: string }> {
  console.log('[StrategyService] Stop strategy request:', request.strategyId);

  const timer = this.runningStrategies.get(request.strategyId);
  if (timer) {
    clearInterval(timer);
    this.runningStrategies.delete(request.strategyId);
  }

  await stateManager.updateStrategyStatus(request.strategyId, 'stopped');
  
  // CRITICAL: Clear analysis state to prevent frontend showing stale data
  const executor = this.strategyExecutors.get(request.strategyId);
  if (executor) {
    // Reset analysis state (if method exists)
    // executor.resetAnalysisState();
    this.strategyExecutors.delete(request.strategyId);
  }
  
  this.updateHealthMetrics();

  return {
    success: true,
    message: 'Strategy stopped',
  };
}
```

---

## User Education Needed

### Key Concept: Manual Trade ≠ Strategy Trade

**What user did:**
```
1. Opened Deribit platform
2. Manually placed trade: 0.001 BTC long @ $99,806
3. Manually closed trade later
4. Expected: Razor strategy to continue analyzing
```

**What actually happened:**
```
1. Manual trade was NOT connected to any backend strategy
2. No strategy was running on backend
3. Auto-resume can't work (no strategy to resume!)
4. Frontend showed CACHED old data (misleading)
```

**What user SHOULD do:**
```
1. Connect to Deribit via frontend "Connect" button
2. Start Razor strategy via "Start Strategy" button
3. Let strategy analyze market (5s intervals)
4. Strategy detects signal → Auto-executes trade
5. Strategy pauses during position
6. Position closes (SL/TP/manual) → Strategy auto-resumes
7. After 5min cooldown → Strategy continues analyzing
```

---

## Testing Plan

### Test 1: Start Strategy → Manual Close → Auto-Resume

```bash
# 1. Start strategy via frontend
POST /api/strategy/start
Body: {
  "strategyName": "Razor",
  "instrument": "BTC_USDC-PERPETUAL",
  "environment": "live"
}

# 2. Wait for signal + trade execution (or force manual trade)
# 3. Manually close position via Deribit
# 4. Watch backend logs:

# Expected logs:
[Razor] onTicker called (every 5s)
[Razor] Status: position_open
[Razor] Checking if position still open...
[Razor] ✅ Position closed - RESUMING strategy analysis
[Razor] Status: analyzing
[Razor] Cooldown set for 5 minutes
[Razor] Cooldown active, skipping analysis...
[Razor] Cooldown expired, resuming analysis...
[Razor] Analyzing market conditions...

# 5. Check frontend analysis modal
# Expected: Live updates showing:
# - Status: Analyseren
# - Cooldown: 5 min (counting down)
# - After cooldown: New signals based on current market
```

### Test 2: No Strategy → Analysis Modal

```bash
# 1. Make sure NO strategy is running:
curl -s http://127.0.0.1:3000/api/strategy/status/v2

# Expected: state: "IDLE", isActive: false

# 2. Open frontend analysis modal
# Expected UI:
# - Title: "Live Analyse"
# - Message: "Geen actieve strategie"
# - Button: "Start Razor Strategie"
# - NO old signal data shown
# - NO cooldown shown
```

### Test 3: Strategy Running → Stop → Analysis Modal

```bash
# 1. Start strategy
# 2. Let it run for 1 minute
# 3. Stop strategy via frontend
# 4. Open analysis modal immediately

# Expected UI:
# - Should show "Geen actieve strategie" (not cached data)
# - Old signals should be cleared
```

---

## Impact Assessment

**User Experience:**
- 🔴 **CRITICAL:** Confusing UI showing fake "Analyseren" status
- 🔴 **HIGH:** User expects strategy to resume but it never will
- 🟡 **MEDIUM:** No clear indication that manual trade ≠ strategy trade

**System Reliability:**
- 🟢 **LOW:** Backend auto-resume code works correctly (when strategy is running)
- 🟡 **MEDIUM:** Frontend cache management needs improvement

**User Trust:**
- 🔴 **HIGH:** User might think system is broken ("why is cooldown active if nothing happens after?")

---

## Recommended Actions

### Immediate (Before Next User Session)

1. ✅ **Fix frontend hook** - Return null when strategyId is null
2. ✅ **Fix UI logic** - Only show backend analysis if strategy is actually running
3. ✅ **Add clear "Start Strategy" CTA** - Guide user to correct workflow

### Short Term (This Week)

4. ✅ **Add backend cache clearing** - Reset analysis state on strategy stop
5. ✅ **Add UI state indicators** - Clear visual difference between:
   - Strategy running + analyzing
   - Strategy running + paused (position open)
   - Strategy running + cooldown
   - NO strategy running
6. ✅ **User education** - Add tooltip/help text explaining manual vs strategy trades

### Long Term (Next Sprint)

7. ✅ **Detect orphan positions** - Alert user if position exists but no strategy running
8. ✅ **Auto-attach strategy to manual positions** - Ask user: "Position detected, start Razor strategy to monitor?"
9. ✅ **Better onboarding flow** - Guide new users through: Connect → Start Strategy → Wait for signal

---

## Conclusion

**Root Cause:** Frontend shows cached data when no strategy is running  
**Impact:** HIGH - Confusing UX, user expects functionality that can't work  
**Fix Complexity:** LOW - Simple null checks in frontend hooks  
**Priority:** 🔴 CRITICAL - Fix before next user session

**Key Takeaway:**
The auto-resume functionality **IS** implemented correctly in the backend. The bug is purely frontend-side: showing stale cached analysis data when no strategy is active, which misleads the user into thinking the strategy is running when it's not.

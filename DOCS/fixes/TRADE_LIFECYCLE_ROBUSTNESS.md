# 🔧 Trade Lifecycle Robustness Fix

**Datum:** 17 november 2025  
**Issue:** Trade logging en status synchronisatie werkt niet betrouwbaar  
**Impact:** Ghost trades, status blijft hangen, geen realtime updates  

---

## 🎯 Problemen Geïdentificeerd

### **1. Ghost Trades**
**Symptoom:** Database heeft `status='open'` maar Deribit heeft GEEN positie  
**Oorzaak:** Position werd manueel gesloten via Deribit UI, maar database niet geupdate  
**Impact:** Strategy denkt dat er een positie is → blijft "gepauzeerd"  

### **2. Status Niet Updaten**
**Symptoom:** Na position close blijft UI "gepauzeerd" tonen  
**Oorzaak:** Backend set `analysisState.status = 'analyzing'` maar frontend pollt te langzaam  
**Impact:** Gebruiker denkt dat strategy niet meer loopt  

### **3. Trades Niet Realtime Visible**
**Symptoom:** Trade opent, maar verschijnt niet in Metrics page  
**Oorzaak:** Frontend pollt om de 10 seconden, geen WebSocket events  
**Impact:** User moet manual sync doen  

### **4. Inconsistente State Bij Restart**
**Symptoom:** Backend restart → auto-resume kan crashen of dubbele trades maken  
**Oorzaak:** Geen validatie van DB vs Deribit state  
**Impact:** Data corruptie, ghost trades  

---

## ✅ Oplossingen

### **Fix 1: Startup Reconciliation**

**Principe:** Bij backend start → ALTIJD valideer DB vs Deribit

```typescript
// In razor-executor.ts initialize()
async checkAndReconcile() {
  // Step 1: Get DB state
  const openTrades = await tradeHistory.queryTrades({ status: 'open' });
  
  // Step 2: Get Deribit state
  const positions = await this.client.getPositions('USDC');
  const hasPosition = positions.some(p => p.size !== 0);
  
  // Step 3: Reconcile
  if (openTrades.length > 0 && !hasPosition) {
    // GHOST TRADE - close in DB
    for (const trade of openTrades) {
      await this.closeGhostTrade(trade.id);
    }
  }
  
  if (openTrades.length === 0 && hasPosition) {
    // ORPHAN POSITION - create DB record
    await this.createTradeFromPosition(position);
  }
  
  if (openTrades.length > 0 && hasPosition) {
    // VALID - resume tracking
    this.resumePosition(openTrades[0]);
  }
}
```

### **Fix 2: Periodic Health Check**

**Principe:** Elke 30 seconden → Valideer DB vs Deribit

```typescript
// In razor-executor.ts
setInterval(async () => {
  if (this.analysisState.status === 'position_open') {
    const positions = await this.client.getPositions('USDC');
    const hasPosition = positions.some(p => p.size !== 0);
    
    if (!hasPosition) {
      // Position closed externally!
      console.log('[Razor] ⚠️  Position closed externally - cleaning up');
      await this.closeTradeHistory();
      this.analysisState.status = 'analyzing';
    }
  }
}, 30000); // Every 30 seconds
```

### **Fix 3: WebSocket Events voor Realtime Updates**

**Principe:** Backend emit events → Frontend luistert → Instant UI update

```typescript
// Backend: Emit events
async recordTrade(...) {
  const tradeId = await this.store.recordTrade(...);
  
  // Emit to all connected clients
  webSocketServer.broadcast({
    type: 'TRADE_OPENED',
    trade: { id: tradeId, ... }
  });
  
  return tradeId;
}

async closeTrade(...) {
  await this.store.closeTrade(...);
  
  // Emit to all connected clients
  webSocketServer.broadcast({
    type: 'TRADE_CLOSED',
    trade: { id: tradeId, ... }
  });
}

// Frontend: Listen for events
ws.on('message', (data) => {
  if (data.type === 'TRADE_OPENED' || data.type === 'TRADE_CLOSED') {
    // Refresh trade history immediately
    refetchTradeHistory();
  }
});
```

### **Fix 4: Status Propagatie**

**Principe:** Status change → Direct naar frontend

```typescript
// Backend: Emit status changes
setAnalysisStatus(newStatus: AnalysisStatus['status']) {
  this.analysisState.status = newStatus;
  
  // Emit to frontend
  webSocketServer.broadcast({
    type: 'STRATEGY_STATUS_CHANGED',
    status: newStatus
  });
}

// Frontend: Update UI instantly
ws.on('message', (data) => {
  if (data.type === 'STRATEGY_STATUS_CHANGED') {
    setStrategyStatus(data.status);
  }
});
```

---

## 🔄 Implementation Plan

### **Phase 1: Robustness (Vandaag)**
1. ✅ Ghost trade cleanup (DONE - manual SQL)
2. ⏳ Add startup reconciliation
3. ⏳ Add periodic health check
4. ⏳ Fix status propagation

### **Phase 2: Realtime (Later)**
1. WebSocket event broadcasting
2. Frontend WebSocket listeners
3. Instant UI updates

### **Phase 3: Monitoring (Later)**
1. Trade audit log
2. State mismatch alerts
3. Automated reconciliation reports

---

## 📝 Code Changes Needed

### **File: `backend/src/strategies/razor-executor.ts`**

**1. Add Reconciliation Method**
```typescript
private async reconcileStateOnStartup(): Promise<void> {
  console.log('[Razor] 🔄 Reconciling database vs Deribit state...');
  
  const tradeHistory = getTradeHistoryService();
  const openTrades = await tradeHistory.queryTrades({
    strategyName: this.strategyName,
    status: 'open',
    limit: 10
  });
  
  const positions = await this.client.getPositions('USDC');
  const ourPosition = positions.find(p => 
    p.size !== 0 && 
    (p.instrument_name === this.config.instrument || p.instrument === this.config.instrument)
  );
  
  // CASE 1: Ghost trades (DB says open, Deribit says no position)
  if (openTrades.length > 0 && !ourPosition) {
    console.log(`[Razor] ⚠️  Found ${openTrades.length} ghost trade(s) - closing in DB`);
    for (const trade of openTrades) {
      await this.closeGhostTrade(trade.id);
    }
    return;
  }
  
  // CASE 2: Orphan position (Deribit has position, DB has no trade)
  if (openTrades.length === 0 && ourPosition) {
    console.log('[Razor] ⚠️  Found orphan position - creating DB record');
    await this.createTradeFromPosition(ourPosition);
    return;
  }
  
  // CASE 3: All good - resume tracking
  if (openTrades.length > 0 && ourPosition) {
    console.log('[Razor] ✅ State consistent - resuming position tracking');
    this.currentTradeId = openTrades[0].id;
    this.analysisState.status = 'position_open';
    return;
  }
  
  // CASE 4: Clean slate
  console.log('[Razor] ✅ Clean state - ready for new trades');
}

private async closeGhostTrade(tradeId: string): Promise<void> {
  const tradeHistory = getTradeHistoryService();
  const trade = await tradeHistory.getTrade(tradeId);
  
  console.log(`[Razor] 🧹 Closing ghost trade ${tradeId}`);
  
  await tradeHistory.closeTrade(tradeId, {
    exitPrice: trade.entryPrice, // No PnL
    exitReason: 'ghost_trade_cleanup',
    pnl: 0,
    pnlPercentage: 0
  });
}

private async createTradeFromPosition(position: any): Promise<void> {
  // ... existing auto-resume logic ...
}
```

**2. Add Periodic Health Check**
```typescript
private startHealthCheckInterval(): void {
  setInterval(async () => {
    if (this.analysisState.status !== 'position_open') return;
    
    try {
      const positions = await this.client.getPositions('USDC');
      const ourPosition = positions.find(p => 
        p.size !== 0 && 
        (p.instrument_name === this.config.instrument || p.instrument === this.config.instrument)
      );
      
      if (!ourPosition) {
        console.log('[Razor] ⚠️  Position externally closed - updating state');
        await this.closeTradeHistory();
        this.analysisState.status = 'analyzing';
      }
    } catch (error) {
      console.error('[Razor] ❌ Health check failed:', error);
    }
  }, 30000); // Every 30 seconds
}
```

**3. Call in Initialize**
```typescript
async initialize(): Promise<void> {
  // ... existing code ...
  
  // NEW: Reconcile state
  await this.reconcileStateOnStartup();
  
  // NEW: Start health check
  this.startHealthCheckInterval();
  
  // ... rest of initialization ...
}
```

---

## 🧪 Testing Checklist

### **Test 1: Ghost Trade Cleanup**
1. Manually set trade as `open` in DB
2. Ensure no position in Deribit
3. Restart backend
4. ✅ Verify trade is closed with `exitReason='ghost_trade_cleanup'`

### **Test 2: Orphan Position Recovery**
1. Open position in Deribit manually
2. Delete trade from DB
3. Restart backend
4. ✅ Verify DB trade is created
5. ✅ Verify strategy status = `position_open`

### **Test 3: Normal Operation**
1. Let strategy open trade normally
2. Wait for TP/SL hit
3. ✅ Verify trade closes in DB
4. ✅ Verify status changes to `analyzing`
5. ✅ Verify UI updates

### **Test 4: External Position Close**
1. Open trade via strategy
2. Manually close in Deribit UI
3. Wait 30 seconds
4. ✅ Verify health check detects closure
5. ✅ Verify DB trade is closed
6. ✅ Verify status = `analyzing`

---

## 📊 Success Metrics

**Before:**
- ❌ Ghost trades persist
- ❌ Status stuck on "gepauzeerd"
- ❌ Manual sync needed
- ❌ 10 second delay for updates

**After:**
- ✅ Ghost trades auto-cleaned
- ✅ Status always correct
- ✅ Automatic updates
- ✅ 30 second health check cycle

---

## 🚀 Next Steps

1. **Implement reconciliation** (30 min)
2. **Add health check interval** (15 min)
3. **Test all scenarios** (30 min)
4. **Deploy to production** (5 min)
5. **Monitor for 24 hours** (validation)

---

**Status:** Ready to implement  
**Priority:** 🔴 HIGH (blocks reliable 24/7 trading)  
**Estimated Time:** 1-2 hours  

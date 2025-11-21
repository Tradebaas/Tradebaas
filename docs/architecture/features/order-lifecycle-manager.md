# 🔒 Order Lifecycle Manager - Veiligheid tegen Orphan Orders

**Datum:** 17 november 2025  
**Status:** ✅ GEÏMPLEMENTEERD  
**Prioriteit:** 🔴 CRITICAL SAFETY FEATURE

---

## 🎯 Probleem

**Situatie:**
Wanneer een positie wordt gesloten (TP hit, SL hit, of manueel), blijven de **gekoppelde orders** (SL/TP) soms open staan op Deribit. Dit is **gevaarlijk** want:

1. ❌ **Orphan SL order** kan triggeren bij nieuwe positie → onverwacht close
2. ❌ **Orphan TP order** kan partial fills veroorzaken
3. ❌ **Account risico** door ongecontroleerde orders
4. ❌ **Manual cleanup nodig** via Deribit UI (menselijke fout)

**Root Cause:**
- Deribit OTOCO (One-Triggers-One-Cancels-Other) zou dit automatisch moeten doen
- In praktijk: orders blijven soms hangen (race conditions, API timeouts, manual closes)
- Code had GEEN robuuste cleanup logica

---

## ✅ Oplossing: Order Lifecycle Manager

### **Principe**

> **"Als ÉÉN order in een trade groep sluit, moeten ALLE gerelateerde orders worden gecanceld"**

### **Database-Driven**

```typescript
// Database registreert ALLE order IDs per trade
interface TradeRecord {
  id: string;                  // Trade ID (uniek)
  entryOrderId: string;        // Market order (entry)
  slOrderId?: string;          // Stop loss order
  tpOrderId?: string;          // Take profit order
  // ... rest
}
```

**Workflow:**
1. **Trade opens** → Entry + SL + TP order IDs opgeslagen in database
2. **Position closes** → Trigger cleanup via `OrderLifecycleManager`
3. **Cleanup** → Cancel ALLE orders in database PLUS safety scan voor orphans
4. **Close trade** → Update database (status = closed, PnL berekend)

---

## 📂 Implementatie Details

### **Bestand:** `backend/src/services/order-lifecycle-manager.ts`

### **Core Methods:**

#### 1. `cleanupTradeOrders(tradeId, triggerReason)`
**Doel:** Cancel alle orders gekoppeld aan een trade

**Steps:**
1. Get trade from database (fetch order IDs)
2. Get all open orders from Deribit
3. Cancel SL order (if exists in database)
4. Cancel TP order (if exists in database)
5. **Safety net:** Cancel ALL reduce_only orders for instrument (catches manual orders)

**Robuustheid:**
- ✅ Handles "order not found" errors gracefully (already filled = OK)
- ✅ Continues even if 1 order cancel fails (don't block cleanup of others)
- ✅ Logs detailed info for debugging

#### 2. `checkPositionAndCleanup(tradeId, instrument)`
**Doel:** Check if position closed → auto-cleanup

**Usage:** Called every tick when `status === 'position_open'`

**Returns:** `boolean` (true if position closed)

**Workflow:**
```typescript
// In Razor strategy onTicker():
if (this.analysisState.status === 'position_open') {
  const orderManager = getOrderLifecycleManager();
  const closed = await orderManager.checkPositionAndCleanup(
    this.currentTradeId,
    this.config.instrument
  );
  
  if (closed) {
    // Position closed! Resume strategy
    await this.closeTradeHistory(); // Update database
    this.analysisState.status = 'analyzing';
  }
}
```

#### 3. `cleanupAllTradesForStrategy(strategyName)`
**Doel:** Bulk cleanup bij strategy stop

**Usage:** When user stops strategy with open positions

**Workflow:**
1. Query database: all open trades for strategy
2. For each trade: call `cleanupTradeOrders()`

---

## 🔌 Integratie in Razor Strategy

### **Changes in `razor-executor.ts`:**

**Import:**
```typescript
import { 
  getOrderLifecycleManager, 
  initializeOrderLifecycleManager 
} from '../services/order-lifecycle-manager';
```

**Initialize (in `initialize()` method):**
```typescript
initializeOrderLifecycleManager(this.client); // Singleton
```

**Vervangen oude cleanup:**
```typescript
// ❌ OUDE CODE
await this.cleanupOrphanOrders(); // Generic cleanup

// ✅ NIEUWE CODE
const orderManager = getOrderLifecycleManager();
await orderManager.cleanupTradeOrders(
  this.currentTradeId, 
  'Position closed (SL/TP/manual)'
);
```

**Auto-resume logic (in `checkPositionAndResume()`):**
```typescript
// Check position + cleanup in one call
const positionClosed = await orderManager.checkPositionAndCleanup(
  this.currentTradeId,
  this.config.instrument
);

if (positionClosed) {
  // Orders already cleaned up!
  await this.closeTradeHistory();
  this.analysisState.status = 'analyzing';
}
```

---

## 🛡️ Safety Features

### **1. Redundant Cleanup**

**Database Order IDs:**
- Cancel SL order (if `slOrderId` in database)
- Cancel TP order (if `tpOrderId` in database)

**PLUS Safety Scan:**
- Get ALL open orders for instrument
- Filter `reduce_only === true` orders
- Cancel ANY reduce_only order (catches manually placed orders)

**Result:** Even als order IDs niet in database staan, worden orphan orders ALSNOG gecanceld!

### **2. Error Resilience**

```typescript
// ✅ GOED - Continue on error
try {
  await this.client.cancelOrder(slOrderId);
} catch (error) {
  if (error.includes('not_found')) {
    console.log('Order already filled - OK');
  } else {
    console.error('Cancel failed:', error);
    // Continue anyway - don't block TP cleanup
  }
}
```

### **3. Agnostic Design**

**Works for:**
- ✅ SL hit (TP moet worden gecanceld)
- ✅ TP hit (SL moet worden gecanceld)
- ✅ Manual close (SL + TP moeten worden gecanceld)
- ✅ Orphan trades (cleanup bij startup)
- ✅ Strategy stop (bulk cleanup)

**Works with:**
- ✅ Razor strategy
- ✅ Future strategies (herbruikbaar!)
- ✅ Manual sync trades (fallback cleanup)

---

## 📊 Logging & Monitoring

### **Visual Logs:**

```
================================================================================
[OrderLifecycle] 🧹 CLEANUP TRIGGERED - Position closed (SL/TP/manual)
[OrderLifecycle] Trade ID: trade_1763366229783_xs849n8w7
================================================================================

[OrderLifecycle] 📊 Trade Details:
[OrderLifecycle]    Strategy: razor
[OrderLifecycle]    Instrument: BTC_USDC-PERPETUAL
[OrderLifecycle]    Entry Order: 12345
[OrderLifecycle]    SL Order: 12346
[OrderLifecycle]    TP Order: 12347

[OrderLifecycle] 📋 Found 3 open orders on BTC_USDC-PERPETUAL

[OrderLifecycle] 🗑️  Cancelling Stop Loss order: 12346
[OrderLifecycle] ✅ Stop Loss order cancelled successfully

[OrderLifecycle] 🗑️  Cancelling Take Profit order: 12347
[OrderLifecycle] ✅ Take Profit order cancelled successfully

[OrderLifecycle] ✅ No orphan reduce_only orders found

────────────────────────────────────────────────────────────────────────────────
[OrderLifecycle] ✅ CLEANUP COMPLETE - All related orders cancelled
[OrderLifecycle] 🔒 Trade trade_1763366229783_xs849n8w7 is now safe to close
────────────────────────────────────────────────────────────────────────────────
```

### **Monitoring Checklist:**

✅ Check logs for `🧹 CLEANUP TRIGGERED` events  
✅ Verify `All related orders cancelled` message  
✅ Check Deribit UI: NO orphan reduce_only orders should exist  
✅ Database: trade status should be `closed` after cleanup  

---

## 🧪 Testing Scenarios

### **1. TP Hit Scenario**

**Setup:**
1. Start Razor strategy
2. Trade opens (entry + SL + TP)
3. Wait for TP to hit

**Expected:**
```
[Razor] 🔄 AUTO-RESUME TRIGGERED
[OrderLifecycle] 🧹 CLEANUP TRIGGERED - Position closed (SL/TP/manual)
[OrderLifecycle] 🗑️  Cancelling Stop Loss order: XXX
[OrderLifecycle] ✅ Stop Loss order cancelled
[Razor] ✅ CLEANUP COMPLETE - Resuming strategy
```

**Verify:**
- [ ] Deribit: NO stop loss order exists
- [ ] Database: trade status = `closed`
- [ ] Strategy: status = `analyzing` (resumed)

### **2. Manual Close Scenario**

**Setup:**
1. Trade is open
2. Close position MANUALLY via Deribit UI

**Expected:**
```
[OrderLifecycle] 🧹 CLEANUP TRIGGERED - Position closed (manual)
[OrderLifecycle] 🗑️  Cancelling Stop Loss order: XXX
[OrderLifecycle] 🗑️  Cancelling Take Profit order: YYY
[OrderLifecycle] ✅ CLEANUP COMPLETE
```

**Verify:**
- [ ] BOTH SL + TP cancelled
- [ ] Database: trade status = `closed`, exitReason = `manual`

### **3. Orphan at Startup Scenario**

**Setup:**
1. Backend crashes with open position
2. Position manually closed via Deribit
3. Restart backend

**Expected:**
```
[Razor] ⚠️  ORPHAN TRADE DETECTED AT STARTUP
[OrderLifecycle] 🧹 CLEANUP TRIGGERED - Orphan trade at startup
[OrderLifecycle] ✅ CLEANUP COMPLETE
[Razor] ✅ Orphan cleanup complete - ready for new trades
```

**Verify:**
- [ ] Orphan orders cancelled
- [ ] Database: trade closed with PnL calculated
- [ ] Strategy ready for new trades

---

## 🚀 Schaalbaar & Herbruikbaar

### **Singleton Pattern**

```typescript
// Initialize once (in strategy initialize())
initializeOrderLifecycleManager(this.client);

// Use anywhere
const manager = getOrderLifecycleManager();
await manager.cleanupTradeOrders(tradeId, reason);
```

### **Strategy-Agnostic**

Nieuwe strategieën hoeven ALLEEN maar:
1. Order IDs opslaan in database (via `recordTrade()`)
2. `cleanupTradeOrders()` aanroepen bij positie close

**Voorbeeld voor nieuwe "Momentum" strategie:**
```typescript
// Trade open
this.currentTradeId = await tradeHistory.recordTrade({
  strategyName: 'momentum',
  entryOrderId: entry.order_id,
  slOrderId: sl.order_id,
  tpOrderId: tp.order_id,
  // ...
});

// Position close
const orderManager = getOrderLifecycleManager();
await orderManager.cleanupTradeOrders(
  this.currentTradeId,
  'Momentum position closed'
);
```

**Dat's alles!** Cleanup is volledig automatisch.

---

## 🎯 Resultaat

### **Vóór:**
❌ Orphan orders blijven hangen  
❌ Manual cleanup via Deribit nodig  
❌ Risico op onverwachte triggers  
❌ Geen database-cleanup integratie  

### **Nu:**
✅ **ALTIJD** automatische cleanup  
✅ **GEEN** manual interventie nodig  
✅ **VEILIG** - redundante checks  
✅ **SCHAALBAAR** - werkt voor alle strategieën  
✅ **ROBUUST** - error handling + fallbacks  

---

## 📝 Checklist voor Nieuwe Strategieën

Wanneer je een nieuwe strategie toevoegt:

1. [ ] **Database Integration**
   ```typescript
   await tradeHistory.recordTrade({
     entryOrderId,
     slOrderId,
     tpOrderId,
     // ... rest
   });
   ```

2. [ ] **Initialize Manager**
   ```typescript
   async initialize() {
     initializeOrderLifecycleManager(this.client);
   }
   ```

3. [ ] **Use in Auto-Resume**
   ```typescript
   const closed = await orderManager.checkPositionAndCleanup(
     this.currentTradeId,
     this.config.instrument
   );
   ```

4. [ ] **Use at Startup Orphan Check**
   ```typescript
   await orderManager.cleanupTradeOrders(
     orphanTradeId,
     'Orphan at startup'
   );
   ```

**Done!** Je strategie heeft nu volledige order cleanup bescherming.

---

## 🔍 Debugging

### **Logs Checken:**

```bash
# Real-time monitoring
pm2 logs tradebaas-backend | grep OrderLifecycle

# Specific trade cleanup
pm2 logs tradebaas-backend | grep "CLEANUP TRIGGERED"

# Errors
pm2 logs tradebaas-backend | grep "OrderLifecycle.*❌"
```

### **Database Query:**

```bash
# Check trade order IDs
sqlite3 /root/Tradebaas/state/trades.db "
  SELECT id, slOrderId, tpOrderId, status 
  FROM trades 
  WHERE status = 'open';
"

# Check last closed trade
sqlite3 /root/Tradebaas/state/trades.db "
  SELECT id, exitReason, pnl, exitTime 
  FROM trades 
  WHERE status = 'closed' 
  ORDER BY exitTime DESC 
  LIMIT 1;
"
```

### **Deribit Check:**

```bash
# Check open orders
curl -s http://127.0.0.1:3000/api/v2/open-orders?instrument=BTC_USDC-PERPETUAL | jq '.'

# Filter reduce_only
curl -s http://127.0.0.1:3000/api/v2/open-orders?instrument=BTC_USDC-PERPETUAL | jq '.result[] | select(.reduce_only == true)'
```

---

**✅ Met Order Lifecycle Manager heb je nu een robuust, schaalbaar systeem dat ALTIJD orphan orders voorkomt!**

# CRITICAL SAFEGUARDS - Order Management Safety

## ⚠️ PROBLEM THAT WAS FIXED

**Date**: 2025-02-02  
**Severity**: CRITICAL - Account-destroying bug

### What Happened
Around 11:30, dozens of Stop Loss (SL) and Take Profit (TP) orders were placed on Deribit **without corresponding entry orders being filled**. This caused:
- Massive fee costs (each order = fee)
- Near-total account loss
- Orphaned protective orders

### Root Cause
The system was attempting to place SL and TP orders even when:
1. Entry orders failed to place
2. Entry orders were rejected
3. Entry orders were not filled
4. No actual position was opened

This is a **catastrophic failure** because:
- You pay fees for every order placed
- SL/TP orders without positions can trigger unexpectedly
- Repeated failed attempts create exponential fee drain

---

## ✅ SAFEGUARDS NOW IN PLACE

### 1. Entry Order Verification (AdvancedBracketManager)

**Location**: `/src/lib/orders/AdvancedBracketManager.ts`

**What It Does**:
Before placing ANY SL or TP orders, the system now:

1. **Verifies entry order exists** by calling `private/get_order_state`
2. **Checks order state** is valid (`filled` or `open`)
3. **Verifies open position exists** via `private/get_positions`
4. **Retries verification** up to 3 times with delays
5. **ABORTS entirely** if verification fails

**Code Pattern**:
```typescript
// CRITICAL: Verify entry order before SL/TP
let entryOrderStatus = await this.client.request('private/get_order_state', {
  order_id: entryOrderId,
});

if (!entryOrderStatus || !['filled', 'open'].includes(orderState)) {
  throw new Error('Cannot place SL/TP for invalid entry');
}

// Verify position exists
const positions = await this.client.request('private/get_positions', {
  currency: 'USDC',
});
const hasPosition = positions.some(p => p.size !== 0);

if (!hasPosition) {
  throw new Error('No open position - ABORTING bracket placement');
}

// Only NOW place SL/TP...
```

### 2. Orphaned SL Cleanup

**What It Does**:
If TP placement fails AFTER SL was already placed:

1. **Immediately attempts to cancel** the orphaned SL
2. **Retries cancellation** up to 3 times
3. **Logs critical alert** if cancellation fails
4. **Emergency closes** the position if brackets incomplete

**Code Pattern**:
```typescript
try {
  // Place TP
} catch (error) {
  // CRITICAL: Cancel orphaned SL
  if (slOrder?.order_id) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.client.request('private/cancel', { 
          order_id: slOrder.order_id 
        });
        break;
      } catch (cancelError) {
        // Retry with delay
      }
    }
  }
  
  // Close position
  await this.client.request(`private/${closeDirection}`, {
    instrument_name: instrument,
    amount: quantity,
    type: 'market',
    reduce_only: true,
  });
}
```

### 3. Strategy-Level Safety (All Strategies)

**Locations**:
- `/src/lib/strategies/razorStrategy.ts`
- `/src/lib/strategies/fastTestStrategy.ts`
- `/src/lib/strategies/vortexStrategy.ts`

**What It Does**:
1. **Verifies entry order ID** exists before passing to bracket manager
2. **Emergency closes position** if bracket attachment fails
3. **Logs detailed errors** for troubleshooting
4. **Never places SL/TP** without confirmed entry

---

## 🔒 MANDATORY RULES FOR ALL FUTURE CODE

### Rule #1: NEVER Place SL/TP Without Entry Verification
```typescript
// ❌ WRONG - Dangerous!
const entry = await placeEntry();
const sl = await placeSL(); // NO! Entry might have failed!

// ✅ CORRECT - Safe
const entry = await placeEntry();
if (!entry?.order_id) throw new Error('No entry');

const verified = await verifyOrder(entry.order_id);
if (!verified) throw new Error('Entry not verified');

const sl = await placeSL(); // Now safe
```

### Rule #2: ALWAYS Cleanup Orphans
```typescript
let slOrder;
try {
  slOrder = await placeSL();
  const tpOrder = await placeTP();
} catch (error) {
  // CRITICAL: Cancel orphaned SL
  if (slOrder?.order_id) {
    await cancelOrder(slOrder.order_id);
  }
  throw error;
}
```

### Rule #3: ALWAYS Emergency Close Incomplete Brackets
```typescript
try {
  await attachBrackets(entry);
} catch (error) {
  // CRITICAL: Close position without protection
  await closePosition(entry.instrument, entry.amount);
  throw error;
}
```

### Rule #4: ALWAYS Log Critical Failures
```typescript
if (!slCancelled) {
  logger.error('❌❌❌ CRITICAL: Orphaned SL could not be cancelled', {
    slOrderId: slOrder.order_id,
    message: 'MANUAL INTERVENTION REQUIRED',
  });
}
```

---

## 📋 TESTING CHECKLIST

Before deploying ANY order management code:

- [ ] Entry order verified before SL/TP?
- [ ] Position existence confirmed?
- [ ] Orphaned SL cleanup implemented?
- [ ] Emergency position close on bracket failure?
- [ ] Retry logic for cancellations?
- [ ] Critical failure alerts logged?
- [ ] All error paths handled?

---

## 🚨 MONITORING & ALERTS

### What To Monitor
1. **Orphaned Orders**: Orders without corresponding positions
2. **Failed Bracket Attachments**: Entry succeeded but SL/TP failed
3. **Fee Spikes**: Unusual number of orders in short time
4. **Verification Failures**: Entry orders that can't be verified

### Alert Triggers
- More than 3 orders placed without position opening
- Any "CRITICAL" log messages
- SL/TP orders existing without entry orders
- Verification failures

---

## 📖 ADDITIONAL DOCUMENTATION

- **Deribit API**: https://docs.deribit.com/
- **Order States**: https://docs.deribit.com/#private-get_order_state
- **Risk Management**: `/src/lib/riskEngine.ts`
- **Bracket Manager**: `/src/lib/orders/AdvancedBracketManager.ts`

---

## ⚡ INCIDENT RESPONSE

If orphaned orders occur despite safeguards:

1. **IMMEDIATELY** stop all strategies
2. **Cancel ALL open orders** via Deribit UI or API
3. **Check positions** and manually close if needed
4. **Review logs** for "CRITICAL" messages
5. **Document** what happened
6. **Update** this document with new safeguards

---

**Last Updated**: 2025-02-02  
**Maintained By**: Development Team  
**Severity Level**: CRITICAL - DO NOT IGNORE

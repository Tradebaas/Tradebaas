# Frontend Client-Side Operations Audit
**Date**: 2025-11-07
**Status**: Post-Backend Migration Analysis

## ✅ ALREADY MIGRATED TO BACKEND

### Connection Management
- ✅ `connect()` - Uses `backendAPI.connect()` (line ~240)
- ✅ `disconnect()` - Uses `backendAPI.disconnect()` (line ~254)
- ✅ `fetchUSDCBalance()` - Uses `backendAPI.getBalance()` (line ~359)

### Strategy Management
- ✅ `startStrategy()` - Uses `backendStrategyClient.startStrategy()` (line ~807)
- ✅ `stopStrategy()` - Uses `backendStrategyClient.stopStrategy()` (line ~857)
- ✅ `killSwitch()` - Uses `backendStrategyClient.killSwitch()` (line ~296)

### Backend Status
- ✅ Backend status polling every 3s via `startBackendStatusPolling()` (line ~1123)

---

## ❌ STILL CLIENT-SIDE (NEEDS MIGRATION)

### 1. **Position Checking** 🔴 HIGH PRIORITY
**Location**: `checkForOpenPosition()` (line ~735, ~776)
```typescript
const positions = await client.getPositions('USDC');
```
**Issue**: Uses client-side DeribitClient
**Impact**: Cannot check positions when disconnected
**Fix**: Add `/api/v2/positions` endpoint to backend

---

### 2. **Manual Position Close** 🔴 HIGH PRIORITY
**Location**: `closePosition()` (line ~900+)
```typescript
await client.closePosition(instrumentName, 'market');
await client.cancelAllByInstrument(instrumentName);
```
**Issue**: Uses client-side order placement
**Impact**: User cannot manually close positions via backend
**Fix**: Add `/api/v2/positions/close` endpoint

---

### 3. **Test Order Placement** 🟡 MEDIUM PRIORITY
**Location**: `placeTestMicroOrder()` (line ~470-650)
```typescript
const btcPerp = await client.getInstrument(instrumentName);
const ticker = await client.getTicker(instrumentName);
const orderResponse = await client.placeBuyOrder(...);
const stopLossResponse = await client.placeSellOrder(...);
const takeProfitResponse = await client.placeSellOrder(...);
```
**Issue**: Entire order flow is client-side
**Impact**: Test orders don't work without browser
**Fix**: Add `/api/v2/orders/test` endpoint (optional - this is a dev feature)

---

### 4. **Circuit Breaker Disconnect** 🟢 LOW PRIORITY
**Location**: Error handling (line ~440)
```typescript
state.client.disconnect();
```
**Issue**: Attempts to disconnect non-existent client
**Impact**: Error in console, but non-blocking
**Fix**: Remove client-side disconnect, use backend disconnect

---

### 5. **Position Monitor** 🟡 MEDIUM PRIORITY
**Location**: `startPositionMonitor()` (line ~1000+)
```typescript
const positions = await client.getPositions('USDC');
```
**Issue**: Polls positions client-side every 2s
**Impact**: Cannot monitor positions without browser
**Note**: Backend strategies already monitor positions server-side
**Fix**: Remove client-side monitor, rely on backend status polling

---

## 📊 SUMMARY

| Category | Client-Side | Backend | Total |
|----------|-------------|---------|-------|
| Connection | 0 | 3 | 3 |
| Strategies | 0 | 3 | 3 |
| Positions | 2 | 0 | 2 |
| Orders | 1 | 0 | 1 |
| Monitoring | 1 | 1 | 2 |
| **TOTAL** | **4** | **7** | **11** |

**Migration Progress**: 64% (7/11 functions)

---

## 🎯 RECOMMENDED NEXT STEPS

### Priority 1: Position Management
1. Add backend endpoint: `GET /api/v2/positions`
2. Add backend endpoint: `POST /api/v2/positions/close`
3. Update `checkForOpenPosition()` to use backend
4. Update `closePosition()` to use backend

### Priority 2: Remove Client-Side Client
1. Set `client: null` permanently in store
2. Remove `initializeClient()` function
3. Remove `DeribitClient` import
4. Clean up all `client.` references

### Priority 3: Cleanup
1. Remove position monitor (backend handles this)
2. Remove test order function (or migrate if needed)
3. Update error handling to not call `client.disconnect()`

---

## 🔧 IMPLEMENTATION NOTES

### Backend Positions Endpoint
```typescript
// backend/src/server.ts
server.get('/api/v2/positions', async (request, reply) => {
  const client = strategyService.getClient();
  const positions = await client.getPositions('USDC');
  return { success: true, positions };
});

server.post('/api/v2/positions/close', async (request, reply) => {
  const { instrument } = request.body;
  const client = strategyService.getClient();
  await client.cancelAllByInstrument(instrument);
  await client.closePosition(instrument, 'market');
  return { success: true };
});
```

### Frontend Updates
```typescript
// src/state/store.ts
checkForOpenPosition: async () => {
  const result = await backendAPI.getPositions();
  const openPosition = result.positions.find(p => p.size !== 0);
  set({ activePosition: openPosition || null });
},

closePosition: async () => {
  await backendAPI.closePosition(instrument);
  set({ activePosition: null, strategyStatus: 'stopped' });
},
```

---

## ✅ COMPLETION CRITERIA

- [ ] All position checks go via backend
- [ ] All order placement goes via backend (except dev test orders)
- [ ] `client` is always `null` in frontend store
- [ ] No `DeribitClient` instantiation in frontend
- [ ] All WebSocket connections managed by backend
- [ ] Frontend is 100% thin client (only UI + backend API calls)

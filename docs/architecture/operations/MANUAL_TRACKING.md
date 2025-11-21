# Manual User Action Tracking

**Document:** Manual connection/disconnect en strategy start/stop tracking  
**Datum:** 13 november 2025  
**Status:** ✅ IMPLEMENTED

---

## 1. Manual Connection/Disconnect Tracking

### 1.1 Implementation Details

**State Storage Location:**
- File: `state/backend-state.json`
- Property: `connection.manuallyDisconnected`

**Code Locations:**
```typescript
// State Manager
File: backend/src/state-manager.ts
Interface: ConnectionState {
  broker: string;
  environment: 'live' | 'testnet';
  connected: boolean;
  connectedAt?: number;
  manuallyDisconnected?: boolean; // ✅ Track if user manually disconnected
}

// Strategy Service
File: backend/src/strategy-service.ts
Lines: 46, 66, 70-71, 141, 147, 170, 176, 584, 591
```

### 1.2 Workflow

**Manual Connect (via API):**
```bash
POST /api/v2/connect
Body: { "environment": "live" }
```

**What happens:**
1. User calls connect endpoint
2. `strategyService.connect()` creates Deribit client
3. State saved with `manuallyDisconnected: false`
4. On backend restart: auto-reconnect IF not manually disconnected

**Manual Disconnect (via API):**
```bash
POST /api/v2/disconnect
```

**What happens:**
1. User calls disconnect endpoint
2. `strategyService.disconnect()` closes Deribit connection
3. State saved with `manuallyDisconnected: true`
4. On backend restart: NO auto-reconnect (respects user's choice)

### 1.3 Auto-Resume Logic

```typescript
// File: backend/src/strategy-service.ts
async initialize() {
  const connection = stateManager.getConnection();
  
  if (connection.connected && !connection.manuallyDisconnected) {
    // ✅ Auto-resume connection (user didn't manually disconnect)
    await this.connect(connection.environment);
  } else if (connection.manuallyDisconnected) {
    // ❌ Skip auto-reconnect (user intentionally disconnected)
    console.log('[StrategyService] Previous manual disconnect detected - no auto-reconnect');
  }
}
```

### 1.4 State Examples

**After Manual Connect:**
```json
{
  "connection": {
    "broker": "deribit",
    "environment": "live",
    "connected": true,
    "connectedAt": 1763075013255,
    "manuallyDisconnected": false
  }
}
```

**After Manual Disconnect:**
```json
{
  "connection": {
    "broker": "deribit",
    "environment": "live",
    "connected": false,
    "connectedAt": 1763075013255,
    "manuallyDisconnected": true
  }
}
```

---

## 2. Manual Strategy Start/Stop Tracking

### 2.1 Implementation Details

**State Storage Location:**
- File: `state/backend-state.json`
- Property: `activeStrategies[].status`

**Code Locations:**
```typescript
// State Manager
File: backend/src/state-manager.ts
Interface: StrategyState {
  id: string;
  name: string;
  status: 'active' | 'stopped' | 'error'; // ✅ Track strategy status
  startedAt: number;
  config: Record<string, any>;
}

// Strategy Service
File: backend/src/strategy-service.ts
- startStrategy(): Lines 184-247
- stopStrategy(): Lines 248-265
```

### 2.2 Workflow

**Manual Start (via API):**
```bash
POST /api/strategy/start
Body: {
  "strategyName": "Razor",
  "instrument": "BTC_USDC-PERPETUAL",
  "environment": "live",
  "config": { ... }
}
```

**What happens:**
1. User calls start endpoint
2. `strategyService.startStrategy()` creates executor
3. State saved with `status: 'active'`
4. Strategy added to `activeStrategies[]`
5. On backend restart: auto-resume active strategies

**Manual Stop (via API):**
```bash
POST /api/strategy/stop
Body: { "strategyId": "razor_123" }
```

**What happens:**
1. User calls stop endpoint
2. `strategyService.stopStrategy()` clears timers
3. State updated with `status: 'stopped'`
4. On backend restart: stopped strategies are REMOVED from state

### 2.3 Auto-Resume Logic

```typescript
// File: backend/src/state-manager.ts
async initialize() {
  // CRITICAL: Remove all stopped strategies on restart
  // Only keep active strategies for auto-resume
  this.state.activeStrategies = this.state.activeStrategies.filter(
    s => s.status === 'active'
  );
  
  console.log('[StateManager] Loaded state:', {
    strategiesActive: this.state.activeStrategies.length,
  });
}
```

**Key Points:**
- ✅ Only `status: 'active'` strategies are auto-resumed
- ✅ `status: 'stopped'` strategies are cleaned up on restart
- ✅ User's manual stop is respected (no auto-start)

### 2.4 State Examples

**Active Strategy (will auto-resume):**
```json
{
  "activeStrategies": [
    {
      "id": "razor_1763075013255",
      "name": "Razor",
      "status": "active",
      "startedAt": 1763075013255,
      "config": {
        "instrument": "BTC_USDC-PERPETUAL",
        "tradeSize": 100
      }
    }
  ]
}
```

**Stopped Strategy (will be removed on restart):**
```json
{
  "activeStrategies": [
    {
      "id": "razor_1763075013255",
      "name": "Razor",
      "status": "stopped",
      "startedAt": 1763075013255,
      "config": { ... }
    }
  ]
}
```

**After Restart (stopped removed):**
```json
{
  "activeStrategies": []
}
```

---

## 3. Combined Scenarios

### 3.1 Scenario: User Disconnect + Backend Restart

**Steps:**
1. User manually disconnects: `POST /api/v2/disconnect`
2. State: `manuallyDisconnected: true`
3. Backend crashes/restarts
4. On init: `connection.manuallyDisconnected === true`
5. **Result:** ❌ NO auto-reconnect (respects user intent)

### 3.2 Scenario: User Stop Strategy + Backend Restart

**Steps:**
1. User manually stops strategy: `POST /api/strategy/stop`
2. State: `strategies[].status = 'stopped'`
3. Backend crashes/restarts
4. On init: stopped strategies filtered out
5. **Result:** ❌ NO auto-resume (respects user intent)

### 3.3 Scenario: Backend Crash (no manual action)

**Steps:**
1. User is running strategy normally
2. State: `connection.manuallyDisconnected: false`, `status: 'active'`
3. Backend crashes/restarts
4. On init: auto-reconnect + auto-resume strategy
5. **Result:** ✅ Full auto-recovery (no manual action needed)

---

## 4. API Endpoints Summary

### 4.1 Connection Management

| Endpoint | Method | Purpose | Manual Flag |
|----------|--------|---------|-------------|
| `/api/v2/connect` | POST | Manual connect | Sets `manuallyDisconnected: false` |
| `/api/v2/disconnect` | POST | Manual disconnect | Sets `manuallyDisconnected: true` |
| `/api/connection/status` | GET | Check connection | Returns `manuallyDisconnected` flag |

### 4.2 Strategy Management

| Endpoint | Method | Purpose | Manual Flag |
|----------|--------|---------|-------------|
| `/api/strategy/start` | POST | Manual start | Sets `status: 'active'` |
| `/api/strategy/stop` | POST | Manual stop | Sets `status: 'stopped'` |
| `/api/strategy/status/v2` | GET | Check strategy | Returns current status |

---

## 5. Testing Manual Tracking

### 5.1 Test Manual Disconnect

```bash
# 1. Connect
curl -X POST http://127.0.0.1:3000/api/v2/connect \
  -H "Content-Type: application/json" \
  -d '{"environment":"live"}'

# 2. Check state file
cat /root/Tradebaas/state/backend-state.json | jq .connection

# Expected: manuallyDisconnected: false

# 3. Disconnect
curl -X POST http://127.0.0.1:3000/api/v2/disconnect

# 4. Check state again
cat /root/Tradebaas/state/backend-state.json | jq .connection

# Expected: manuallyDisconnected: true

# 5. Restart backend
# Expected: NO auto-reconnect (log: "Previous manual disconnect detected")
```

### 5.2 Test Manual Stop

```bash
# 1. Start strategy
curl -X POST http://127.0.0.1:3000/api/strategy/start \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "Razor",
    "instrument": "BTC_USDC-PERPETUAL",
    "environment": "live",
    "config": {}
  }'

# 2. Check active strategies
cat /root/Tradebaas/state/backend-state.json | jq .activeStrategies

# Expected: status: "active"

# 3. Stop strategy
curl -X POST http://127.0.0.1:3000/api/strategy/stop \
  -H "Content-Type: application/json" \
  -d '{"strategyId":"razor_xxx"}'

# 4. Check state
cat /root/Tradebaas/state/backend-state.json | jq .activeStrategies

# Expected: status: "stopped"

# 5. Restart backend
# Expected: activeStrategies array is empty (stopped strategies removed)
```

---

## 6. Verification Checklist

**Manual Connection Tracking:**
- [x] ✅ `manuallyDisconnected` flag in ConnectionState interface
- [x] ✅ Flag set to `false` on manual connect
- [x] ✅ Flag set to `true` on manual disconnect
- [x] ✅ Auto-reconnect skipped when flag is `true`
- [x] ✅ Auto-reconnect works when flag is `false`
- [x] ✅ State persisted across backend restarts

**Manual Strategy Tracking:**
- [x] ✅ `status` field in StrategyState interface
- [x] ✅ Status set to `'active'` on manual start
- [x] ✅ Status set to `'stopped'` on manual stop
- [x] ✅ Stopped strategies filtered out on restart
- [x] ✅ Active strategies auto-resumed on restart
- [x] ✅ State persisted across backend restarts

**Edge Cases:**
- [x] ✅ Crash during active strategy → auto-resume
- [x] ✅ Manual stop before crash → no auto-resume
- [x] ✅ Manual disconnect before crash → no auto-reconnect
- [x] ✅ State file corruption handling
- [x] ✅ Connection failure during auto-resume

---

## 7. Conclusion

**✅ ALLE MANUAL TRACKING IS GEÏMPLEMENTEERD:**

1. **Connection Tracking:**
   - `manuallyDisconnected` flag werkt correct
   - Respecteert user intent bij restart
   - Auto-reconnect alleen als niet manueel disconnected

2. **Strategy Tracking:**
   - `status` field werkt correct
   - Stopped strategies worden niet auto-resumed
   - Active strategies worden wel auto-resumed

3. **State Persistence:**
   - Alle state wordt opgeslagen in JSON
   - Survives backend restarts
   - Clean separation tussen manual en automatic actions

**No Missing Functionality - System is Complete!**

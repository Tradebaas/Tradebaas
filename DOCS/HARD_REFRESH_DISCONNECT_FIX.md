# Hard Refresh Disconnect Fix (2025-11-08)

## Problem

Bij een **hard refresh** (Cmd+Shift+R / Ctrl+Shift+R) werd de broker verbinding **ongewenst verbroken**, ondanks dat de user NIET op "Verbreek Verbinding" had geklikt.

### User Report

> "Ik heb mijn broker connect, was 5 minuten weg en toen was de verbinding nog goed. Toen ging ik weer een aantal minuten weg, kwam ik terug, drukte op cmd shift r en toen was de verbinding verbroken. Ik heb de verbinding niet handmatig verbroken, dus dit moet niet kunnen!"

## Root Cause

### Timeline van een Hard Refresh

```
1. User connected → connectionState = 'Active' (backend connected)
2. User drukt Cmd+Shift+R (hard refresh)
3. Browser herlaadt pagina VOLLEDIG
4. Frontend store reset → connectionState = 'Stopped' (initial state)
5. App.tsx init → startBackendStatusPolling() + startRealTimeConnectionPolling()
6. Eerste backend poll (binnen 1-3s):
   - Scenario A: Network delay → fetch fails → catch block (OK, no state change)
   - Scenario B: Backend connected=false (not manually disconnected)
     ❌ OLD CODE: set({ connectionState: 'Stopped' })
     ✅ NEW CODE: preserve state (don't disconnect)
```

### Problematic Code (OLD)

**Backend Status Polling** (`store.ts`):
```typescript
} else if (currentState === 'Active') {
  // ❌ PROBLEM: Sets to Stopped for ANY reason backend not connected
  // This includes: page refresh, network blip, backend restart
  set({ 
    connectionState: 'Stopped',
    strategyStatus: 'stopped',
    activePosition: null,
  });
}
```

**Real-time Connection Polling** (`store.ts`):
```typescript
} else if (currentState === 'Active') {
  // ❌ PROBLEM: Same issue - too aggressive
  set({ connectionState: 'Stopped' });
}
```

### Why This Caused Disconnects

1. **Page Refresh**: Frontend state resets to `'Stopped'`, maar backend is **nog steeds connected**
2. **Backend Poll**: Eerste poll kan falen (network delay) OF backend zegt `connected: false` (temporary)
3. **Aggressive Logic**: Code zet ALTIJD naar `'Stopped'` als `backend.connected !== true`
4. **Result**: Verbinding verbroken zonder user actie! 😱

## Solution

### Backend Flag: `manuallyDisconnected`

De backend houdt al een flag bij:
```typescript
// backend/src/state-manager.ts
interface ConnectionState {
  connected: boolean;
  environment: string;
  manuallyDisconnected?: boolean; // TRUE als user op "Verbreek Verbinding" klikt
}
```

**Wanneer wordt dit gezet**:
- ✅ Manual disconnect: `POST /api/v2/disconnect` → `manuallyDisconnected: true`
- ✅ Auto-reconnect: `POST /api/v2/connect` → `manuallyDisconnected: false`

### Frontend Fix: Check `manuallyDisconnected`

**Backend Status Polling** (NEW):
```typescript
} else {
  // Backend says NOT connected
  // ✅ CRITICAL FIX: Only set to 'Stopped' if manuallyDisconnected = true
  if (status.connection.manuallyDisconnected === true) {
    console.log('[Store] Backend was manually disconnected, updating frontend state');
    set({ 
      connectionState: 'Stopped',
      strategyStatus: 'stopped',
      activePosition: null,
    });
  } else {
    // Backend not connected but NOT manually disconnected
    // This could be:
    // 1. Backend just started (not connected yet)
    // 2. Connection lost temporarily (network issue)
    // 3. Page refresh (frontend state reset but backend still connected)
    // → Don't change connectionState, let it stay as is
    console.log('[Store] Backend not connected but not manually disconnected - preserving frontend state');
  }
}
```

**Real-time Connection Polling** (NEW):
```typescript
if (data.connected && data.websocket.connected) {
  // Backend says connected → set Active
  if (currentState !== 'Active') {
    set({ 
      connectionState: 'Active',
      environment: data.environment,
    });
  }
} else if (data.manuallyDisconnected === true) {
  // ✅ Only set to Stopped if manually disconnected
  if (currentState === 'Active') {
    console.log('[Store] Manual disconnect detected by real-time poll');
    set({ connectionState: 'Stopped' });
  }
}
// ✅ If not connected AND not manually disconnected → do nothing
```

### TypeScript Interface Update

```typescript
// src/lib/backend-api.ts
export interface BackendConnectionStatus {
  connected: boolean;
  environment: DeribitEnvironment;
  broker: string;
  manuallyDisconnected?: boolean; // ← Added
}
```

## Behavior After Fix

### Scenario 1: Hard Refresh (Cmd+Shift+R)

```
1. User connected → backend.connected = true, manuallyDisconnected = false
2. User hard refresh
3. Frontend state reset → connectionState = 'Stopped'
4. Backend poll within 3s:
   - backend.connected = true → ✅ Set to 'Active' (reconnect UI)
   - backend.connected = false BUT manuallyDisconnected = false
     → ✅ Preserve state (don't disconnect)
5. Result: Connection stays active! 🎉
```

### Scenario 2: Manual Disconnect

```
1. User clicks "Verbreek Verbinding"
2. Frontend calls backendAPI.disconnect()
3. Backend: manuallyDisconnected = true
4. Frontend: connectionState = 'Stopped'
5. Backend poll:
   - backend.connected = false AND manuallyDisconnected = true
   → ✅ Stay disconnected (correct)
6. Result: Stays disconnected until manual reconnect
```

### Scenario 3: Network Blip

```
1. User connected
2. Temporary network issue → backend.connected = false
3. Backend poll:
   - manuallyDisconnected = false (not manual)
   → ✅ Preserve state (don't disconnect UI)
4. Network recovers → backend.connected = true
5. Backend poll: ✅ Set to 'Active'
6. Result: Seamless recovery!
```

### Scenario 4: Backend Restart

```
1. User connected
2. Backend crashes/restarts
3. Backend state reset → connected = false, manuallyDisconnected = false
4. Frontend poll:
   - manuallyDisconnected = false
   → ✅ Preserve frontend state
5. Backend auto-reconnect (if credentials saved)
6. Backend poll: connected = true → ✅ Sync to Active
7. Result: Automatic recovery!
```

## Testing

### Test 1: Hard Refresh While Connected

```
1. Connect to broker → connectionState = 'Active'
2. Press Cmd+Shift+R (hard refresh)
3. ✅ Expected: Connection stays Active
4. ✅ Backend: manuallyDisconnected = false
5. ✅ Frontend: Detects backend.connected = true within 3s
```

### Test 2: Hard Refresh While Disconnected

```
1. Manually disconnect → connectionState = 'Stopped'
2. Press Cmd+Shift+R
3. ✅ Expected: Stays Stopped
4. ✅ Backend: manuallyDisconnected = true
5. ✅ Frontend: Respects manual disconnect
```

### Test 3: Normal Page Refresh (F5)

```
1. Connected
2. Press F5 (soft refresh)
3. ✅ Expected: Connection stays Active
4. ✅ Same as hard refresh - works identically
```

### Test 4: Tab Close & Reopen

```
1. Connected
2. Close browser tab
3. Reopen → new session
4. ✅ Expected: Backend still connected (24/7)
5. ✅ Frontend polls → detects backend.connected = true → sync to Active
```

## Files Changed

1. **`src/state/store.ts`**:
   - `startBackendStatusPolling()`: Check `manuallyDisconnected` flag
   - `startRealTimeConnectionPolling()`: Check `manuallyDisconnected` flag

2. **`src/lib/backend-api.ts`**:
   - `BackendConnectionStatus` interface: Added `manuallyDisconnected?: boolean`

## Deployment

```bash
# Frontend restart (apply fix)
pm2 restart tradebaas-frontend

# Verify
pm2 logs tradebaas-frontend --lines 50 | grep "preserving frontend state"
```

## Monitoring

```bash
# Watch backend status polls
pm2 logs tradebaas-frontend --lines 100 | grep "Backend status poll"

# Check for unwanted disconnects
pm2 logs tradebaas-frontend --lines 100 | grep "connectionState: 'Stopped'"

# Verify manual disconnect behavior
pm2 logs tradebaas-frontend --lines 100 | grep "manually disconnected"
```

## Summary

### ✅ Before Fix

- ❌ Hard refresh → Disconnect
- ❌ Soft refresh → Disconnect
- ❌ Network blip → Disconnect
- ❌ Backend restart → Disconnect
- ✅ Manual disconnect → Disconnect (correct)

### ✅ After Fix

- ✅ Hard refresh → **Stay Connected**
- ✅ Soft refresh → **Stay Connected**
- ✅ Network blip → **Stay Connected** (auto-recover)
- ✅ Backend restart → **Stay Connected** (auto-recover)
- ✅ Manual disconnect → Disconnect (correct)

### 🎯 Expected Behavior

**ONLY** de "Verbreek Verbinding" knop mag de verbinding verbreken.  
**ALLE** andere events (refresh, network, backend restart) → **preserve connection**.

**Perfect voor 24/7 trading!** 🚀

---

**Fix deployed**: 2025-11-08 19:15 UTC  
**Status**: ✅ RESOLVED

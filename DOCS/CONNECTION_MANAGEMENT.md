# Connection Management - Complete Technical Reference

**Last Updated**: 2024-11-08  
**Status**: Production Ready  
**Critical Requirement**: Manual disconnect MUST prevent auto-reconnect

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Connection Lifecycle](#connection-lifecycle)
4. [State Persistence](#state-persistence)
5. [Auto-Resume Logic](#auto-resume-logic)
6. [Critical Safeguards](#critical-safeguards)
7. [API Reference](#api-reference)
8. [Testing & Verification](#testing--verification)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Tradebaas implements a sophisticated connection management system with the following features:

- ✅ **Manual Connect/Disconnect**: User-initiated via UI
- ✅ **State Persistence**: Survives server restarts
- ✅ **Auto-Resume**: Reconnects after crash/restart (if not manually disconnected)
- ✅ **Manual Disconnect Protection**: NEVER auto-reconnect if user clicked disconnect
- ✅ **Credential Security**: Encrypted storage in backend KV
- ✅ **WebSocket Management**: Automatic reconnection with exponential backoff

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + Zustand)                   │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────────┐   │
│  │ SettingsDialog │→ │ Zustand Store  │→ │ backend-api.ts  │   │
│  │  - Connect UI  │  │  - State sync  │  │  - REST client  │   │
│  │  - Disconnect  │  │  - Polling     │  │                 │   │
│  └────────────────┘  └────────────────┘  └────────┬────────┘   │
└────────────────────────────────────────────────────┼────────────┘
                                                      │
                                  ┌───────────────────┼───────────────────┐
                                  │   REST API (Fastify, Port 3000)       │
                                  │                   │                   │
                                  │  POST /api/v2/connect                 │
                                  │  POST /api/v2/disconnect              │
                                  │  GET  /api/connection/status          │
                                  └───────────────────┼───────────────────┘
                                                      │
┌─────────────────────────────────────────────────────▼───────────┐
│                BACKEND (Node.js + TypeScript)                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ strategy-service │  │  state-manager   │  │ deribit-client│ │
│  │  - connect()     │→ │  - setConnection │→ │  - WebSocket  │ │
│  │  - disconnect()  │  │  - persistence   │  │  - Auth       │ │
│  │  - initialize()  │  │  - auto-resume   │  │  - Reconnect  │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│                               │                                  │
│                               ▼                                  │
│                    backend-state.json                            │
│                    {                                             │
│                      connection: {                               │
│                        connected: true,                          │
│                        manuallyDisconnected: false ← CRITICAL    │
│                      }                                           │
│                    }                                             │
└──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  Deribit API    │
                         │  wss://...      │
                         └─────────────────┘
```

---

## Connection Lifecycle

### 1. Initial Connect (User-Initiated)

**User Action**: Clicks "Verbind" in Settings Dialog

#### Frontend Flow

```typescript
// 1. User enters credentials in SettingsDialog
const credentials = {
  apiKey: 'xxx',
  apiSecret: 'yyy'
};

// 2. Store calls backend API
await backendAPI.saveCredentials('deribit', credentials);

// 3. Trigger connection
await backendAPI.connect(credentials, 'live');

// 4. Success response
{ success: true }

// 5. Frontend polls for status update
const status = await backendAPI.getStatus();
// → connection.connected = true
```

#### Backend Flow (`backend/src/strategy-service.ts`)

```typescript
async connect(environment: DeribitEnvironment): Promise<void> {
  // 1. Load credentials from KV storage
  const kvCreds = await credentialsManager.getCredentials('deribit');
  
  if (!kvCreds.success || !kvCreds.credentials) {
    throw new Error('No credentials found');
  }
  
  // 2. Create WebSocket client
  this.environment = environment;
  this.client = new BackendDeribitClient(environment);
  
  // 3. Connect to Deribit
  console.log(`[StrategyService] Connecting to Deribit ${environment}...`);
  await this.client.connect({
    apiKey: kvCreds.credentials.api_key,
    apiSecret: kvCreds.credentials.api_secret,
  });
  
  // 4. Verify connection
  if (!this.client.isConnected()) {
    throw new Error('Failed to establish WebSocket connection');
  }
  
  console.log('[StrategyService] WebSocket connection verified');
  
  // 5. Save connection state
  await stateManager.setConnection({
    broker: 'deribit',
    environment,
    connected: true,
    connectedAt: Date.now(),
    manuallyDisconnected: false, // ← CRITICAL: Clear manual disconnect flag
  });
  
  console.log(`[StrategyService] Connected to Deribit ${environment}`);
}
```

#### State Changes

**Before Connect**:
```json
{
  "connection": undefined
}
```

**After Connect**:
```json
{
  "connection": {
    "broker": "deribit",
    "environment": "live",
    "connected": true,
    "connectedAt": 1699456789000,
    "manuallyDisconnected": false
  }
}
```

---

### 2. Manual Disconnect (User-Initiated)

**User Action**: Clicks "Verbreek verbinding"

#### Frontend Flow

```typescript
// 1. User clicks disconnect button
await backendAPI.disconnect();

// 2. Backend endpoint called
POST /api/v2/disconnect
// NO BODY, NO HEADERS (Fastify strict mode)

// 3. Success response
{ success: true }

// 4. Credentials deleted
await backendAPI.deleteCredentials('deribit');

// 5. Frontend polls for status update
const status = await backendAPI.getStatus();
// → connection.connected = false
// → connection.manuallyDisconnected = true
```

#### Backend Flow (`backend/src/strategy-service.ts`)

```typescript
async disconnect(): Promise<void> {
  console.log('[StrategyService] Disconnecting...');
  
  // 1. Stop all running strategies
  for (const strategyId of this.runningStrategies.keys()) {
    await this.stopStrategy({ strategyId });
  }
  
  // 2. Disconnect WebSocket client
  if (this.client) {
    this.client.disconnect();
    this.client = null;
  }
  
  // 3. Save disconnected state
  await stateManager.setConnection({
    broker: 'deribit',
    environment: this.environment,
    connected: false,
    connectedAt: undefined, // Clear timestamp
    manuallyDisconnected: true, // ← CRITICAL: Prevent auto-reconnect
  });
  
  console.log('[StrategyService] Disconnected');
}
```

#### State Changes

**After Disconnect**:
```json
{
  "connection": {
    "broker": "deribit",
    "environment": "live",
    "connected": false,
    "connectedAt": undefined,
    "manuallyDisconnected": true
  }
}
```

---

### 3. Auto-Resume (Server Restart)

**Trigger**: PM2 restarts backend process, or server reboot

#### Initialize Flow (`backend/src/strategy-service.ts`)

```typescript
async initialize(): Promise<void> {
  console.log('[StrategyService] Initializing...');
  
  // 1. Load state from disk
  await stateManager.initialize();
  
  // 2. Check connection state
  const connection = stateManager.getConnection();
  
  if (connection) {
    // 3a. Connected AND not manually disconnected → auto-resume
    if (connection.connected && !connection.manuallyDisconnected) {
      console.log('[StrategyService] Found active manual connection - attempting auto-resume...');
      console.log('[StrategyService] Previous connection:', { 
        broker: connection.broker, 
        environment: connection.environment,
        connectedAt: new Date(connection.connectedAt).toISOString()
      });
      
      try {
        await this.connect(connection.environment);
        console.log('[StrategyService] ✅ Successfully restored manual connection');
      } catch (error) {
        console.error('[StrategyService] ❌ Failed to restore connection:', error);
        
        // Clear failed state
        await stateManager.setConnection({
          broker: connection.broker,
          environment: connection.environment,
          connected: false,
          connectedAt: undefined,
          manuallyDisconnected: false
        });
        
        console.log('[StrategyService] Connection state cleared after restore failure');
      }
    } 
    // 3b. Manual disconnect active → DO NOT reconnect
    else if (connection.manuallyDisconnected) {
      console.log('[StrategyService] 🚫 Previous manual disconnect detected - no auto-reconnect');
    } 
    // 3c. No previous connection
    else {
      console.log('[StrategyService] No previous active connection found');
    }
  }
  
  // 4. Log final state
  if (this.client && this.client.isConnected()) {
    console.log('[StrategyService] Initialization complete - connection restored');
  } else {
    console.log('[StrategyService] Initialization complete - awaiting manual connection');
  }
}
```

#### Decision Matrix

| `connected` | `manuallyDisconnected` | Action |
|-------------|------------------------|--------|
| `true` | `false` | ✅ Auto-resume connection |
| `true` | `true` | 🚫 DO NOT reconnect (contradictory state) |
| `false` | `true` | 🚫 DO NOT reconnect (user disconnected) |
| `false` | `false` | ⏸️ No action (never connected) |
| `undefined` | `undefined` | ⏸️ No action (fresh start) |

---

### 4. Page Refresh (Frontend)

**Trigger**: User refreshes browser (F5 or Ctrl+R)

#### Frontend Polling

```typescript
// src/state/store.ts
useEffect(() => {
  // Poll backend every 2 seconds
  const interval = setInterval(async () => {
    try {
      const status = await backendAPI.getStatus();
      
      if (status.connection.connected) {
        setConnectionState('Active');
        setEnvironment(status.connection.environment);
      } else {
        setConnectionState('Disconnected');
      }
    } catch (error) {
      console.error('[Store] Failed to poll status:', error);
    }
  }, 2000);
  
  return () => clearInterval(interval);
}, []);
```

**Why Polling?**:
- Simple & reliable
- No WebSocket state management between frontend/backend
- Handles network interruptions gracefully
- Low overhead (2s interval)
- Works across page refreshes

---

## State Persistence

### StateManager (`backend/src/state-manager.ts`)

#### ConnectionState Interface

```typescript
interface ConnectionState {
  broker: string;              // e.g., 'deribit'
  environment: 'live' | 'testnet';
  connected: boolean;          // Current connection status
  connectedAt?: number;        // Unix timestamp (ms)
  manuallyDisconnected?: boolean; // CRITICAL flag
}
```

#### setConnection() Implementation

```typescript
async setConnection(connection: ConnectionState): Promise<void> {
  console.log('[StateManager] setConnection called with:', 
    JSON.stringify(connection, null, 2));
  
  // CRITICAL: Preserve ALL fields explicitly
  this.state.connection = {
    broker: connection.broker,
    environment: connection.environment,
    connected: connection.connected,
    connectedAt: connection.connectedAt,
    manuallyDisconnected: connection.manuallyDisconnected ?? false, // Default to false
  };
  
  await this.save();
  
  console.log('[StateManager] Connection state updated and saved. Final state:', 
    JSON.stringify(this.state.connection, null, 2));
}
```

**Why Explicit Field Preservation?**

❌ **WRONG** - Spread operator can omit `undefined` fields:
```typescript
this.state.connection = { ...connection }; 
// If connection.manuallyDisconnected is undefined, it won't be in JSON
```

✅ **CORRECT** - Explicit assignment with default:
```typescript
this.state.connection = {
  broker: connection.broker,
  environment: connection.environment,
  connected: connection.connected,
  connectedAt: connection.connectedAt,
  manuallyDisconnected: connection.manuallyDisconnected ?? false
};
// Guarantees field exists in JSON
```

#### save() Implementation

```typescript
async save(): Promise<void> {
  this.state.lastUpdated = Date.now();
  
  try {
    await fs.writeFile(
      this.statePath, 
      JSON.stringify(this.state, null, 2), 
      'utf-8'
    );
  } catch (error) {
    console.error('[StateManager] Failed to save state:', error);
  }
}
```

**File Location**: `/root/tradebaas/backend-state.json`

---

## Auto-Resume Logic

### Conditions for Auto-Resume

Auto-resume happens if **ALL** conditions are met:

1. ✅ State file exists and is valid JSON
2. ✅ `connection` object exists
3. ✅ `connection.connected === true`
4. ✅ `connection.manuallyDisconnected === false` (or undefined)
5. ✅ Credentials exist in KV storage
6. ✅ Credentials are valid

### Auto-Resume Flow Diagram

```
┌─────────────────────────┐
│ Backend Initialize()    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Load backend-state.json │
└────────────┬────────────┘
             │
             ▼
  ┌──────────────────────┐
  │ connection exists?   │
  └──────┬───────────────┘
         │
    ┌────┴────┐
    │   NO    │
    │         ▼
    │   ⏸️ Wait for manual connect
    │
    │   YES
    │    │
    │    ▼
  ┌──────────────────────────┐
  │ connected === true?       │
  └──────┬───────────────────┘
         │
    ┌────┴────┐
    │   NO    │
    │         ▼
    │   ⏸️ Wait for manual connect
    │
    │   YES
    │    │
    │    ▼
  ┌──────────────────────────────┐
  │ manuallyDisconnected === true?│
  └──────┬─────────────────────────┘
         │
    ┌────┴────┐
    │  YES    │
    │         ▼
    │   🚫 DO NOT reconnect
    │
    │   NO
    │    │
    │    ▼
  ┌──────────────────────┐
  │ Load credentials     │
  └────────┬─────────────┘
           │
      ┌────┴────┐
      │ Found?  │
      └────┬────┘
           │
      ┌────┴────┐
      │   NO    │
      │         ▼
      │   ❌ Fail - clear state
      │
      │   YES
      │    │
      │    ▼
  ┌──────────────────────┐
  │ Create WebSocket     │
  │ Connect to Deribit   │
  └────────┬─────────────┘
           │
      ┌────┴────┐
      │Success? │
      └────┬────┘
           │
      ┌────┴────┐
      │   NO    │
      │         ▼
      │   ❌ Fail - clear state
      │
      │   YES
      │    │
      │    ▼
  ┌──────────────────────┐
  │ ✅ Connection        │
  │    Restored!         │
  └──────────────────────┘
```

---

## Critical Safeguards

### 1. Manual Disconnect Protection

**Requirement**: "Als ik handmatig disconnect wil ik ABSOLUUT niet dat we automatisch weer verbinding leggen"

**Implementation**:

```typescript
// backend/src/strategy-service.ts - disconnect()
await stateManager.setConnection({
  broker: 'deribit',
  environment: this.environment,
  connected: false,
  connectedAt: undefined,
  manuallyDisconnected: true, // ← Sets the flag
});
```

```typescript
// backend/src/strategy-service.ts - initialize()
if (connection?.manuallyDisconnected) {
  console.log('🚫 Not reconnecting: manual disconnect active');
  return;
}
```

**Test Procedure**:
1. Connect to Deribit live ✅
2. Verify status shows "Verbonden" ✅
3. Click "Verbreek verbinding" ✅
4. Verify status shows "Verbroken" ✅
5. Refresh page (F5) ✅
6. **CRITICAL**: Status should STAY "Verbroken" ✅
7. Verify backend-state.json: `manuallyDisconnected: true` ✅

---

### 2. Fastify Empty Body Handling

**Problem**: Fastify strict mode rejects POST with `Content-Type: application/json` and empty body

**Error Message**:
```
Body cannot be empty when content-type is set to 'application/json'
```

**Solution**:

❌ **WRONG**:
```typescript
fetch('/api/v2/disconnect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});
```

✅ **CORRECT**:
```typescript
fetch('/api/v2/disconnect', {
  method: 'POST'
  // NO headers!
});
```

**Implementation** (`src/lib/backend-api.ts`):
```typescript
async disconnect(): Promise<{ success: boolean }> {
  // Call explicit disconnect endpoint - NO body, NO content-type
  const response = await fetch(`${this.baseUrl}/api/v2/disconnect`, {
    method: 'POST',
  });

  const result = await response.json();
  
  if (!response.ok || !result.success) {
    return { success: false };
  }

  // Also delete credentials
  await this.deleteCredentials('deribit');
  
  return { success: true };
}
```

---

### 3. Credential Security

**Storage**: Backend KV storage (encrypted at rest)

**Lifecycle**:
1. User enters credentials in UI
2. Frontend sends to backend via `/api/credentials` POST
3. Backend stores in KV storage
4. Backend uses for WebSocket auth
5. Frontend deletes local copy
6. On disconnect: credentials removed from KV

**NEVER**:
- ❌ Store credentials in frontend localStorage
- ❌ Send credentials in query params
- ❌ Log credentials to console
- ❌ Include credentials in error messages

---

## API Reference

### POST /api/credentials

Save credentials to backend KV storage.

**Request**:
```http
POST /api/credentials
Content-Type: application/json

{
  "service": "deribit",
  "credentials": [
    { "key": "api_key", "value": "xxx" },
    { "key": "api_secret", "value": "yyy" }
  ]
}
```

**Response**:
```json
{
  "success": true
}
```

---

### GET /api/credentials/:service

Retrieve credentials from backend KV storage.

**Request**:
```http
GET /api/credentials/deribit
```

**Response**:
```json
{
  "success": true,
  "credentials": {
    "api_key": "xxx",
    "api_secret": "yyy"
  }
}
```

---

### DELETE /api/credentials/:service

Delete credentials from backend KV storage.

**Request**:
```http
DELETE /api/credentials/deribit
```

**Response**:
```json
{
  "success": true
}
```

---

### POST /api/v2/connect

Connect to broker using saved credentials.

**Request**:
```http
POST /api/v2/connect
Content-Type: application/json

{
  "environment": "live"
}
```

**Response**:
```json
{
  "success": true
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "No Deribit credentials found"
}
```

---

### POST /api/v2/disconnect

Disconnect from broker.

**Request**:
```http
POST /api/v2/disconnect
(NO BODY, NO HEADERS)
```

**Response**:
```json
{
  "success": true
}
```

---

### GET /api/connection/status

Get current connection status.

**Request**:
```http
GET /api/connection/status
```

**Response**:
```json
{
  "connected": true,
  "environment": "live",
  "broker": "deribit",
  "connectedAt": 1699456789000,
  "manuallyDisconnected": false
}
```

---

## Testing & Verification

### Manual Test Procedure

#### Test 1: Basic Connect/Disconnect

```bash
# 1. Start backend
pm2 restart tradebaas-backend

# 2. Check initial state
curl http://localhost:3000/api/connection/status | jq
# Expected: { "connected": false }

# 3. Connect via UI
# Click "Verbind" with valid credentials

# 4. Verify connection
curl http://localhost:3000/api/connection/status | jq
# Expected: { "connected": true, "manuallyDisconnected": false }

# 5. Disconnect via UI
# Click "Verbreek verbinding"

# 6. Verify disconnect
curl http://localhost:3000/api/connection/status | jq
# Expected: { "connected": false, "manuallyDisconnected": true }
```

#### Test 2: Auto-Resume After Restart

```bash
# 1. Connect via UI
# 2. Verify connected
curl http://localhost:3000/api/connection/status | jq

# 3. Restart backend
pm2 restart tradebaas-backend

# 4. Wait 5 seconds for initialization
sleep 5

# 5. Check status - should auto-resume
curl http://localhost:3000/api/connection/status | jq
# Expected: { "connected": true, "manuallyDisconnected": false }
```

#### Test 3: Manual Disconnect Prevents Auto-Resume

```bash
# 1. Connect via UI
# 2. Disconnect via UI
# 3. Verify manuallyDisconnected flag
cat /root/tradebaas/backend-state.json | jq '.connection'
# Expected: { "manuallyDisconnected": true }

# 4. Restart backend
pm2 restart tradebaas-backend

# 5. Wait 5 seconds
sleep 5

# 6. Check status - should NOT auto-resume
curl http://localhost:3000/api/connection/status | jq
# Expected: { "connected": false, "manuallyDisconnected": true }
```

#### Test 4: Page Refresh Preserves State

```bash
# 1. Connect via UI
# 2. Hard refresh page (Ctrl+Shift+F5)
# 3. Wait for polling to update UI
# Expected: Status pill shows "Verbonden"

# 4. Disconnect via UI
# 5. Hard refresh page (Ctrl+Shift+F5)
# 6. Wait for polling to update UI
# Expected: Status pill shows "Verbroken"
```

### Automated Test Script

```bash
#!/bin/bash
# test-connection-lifecycle.sh

set -e

BACKEND_URL="http://localhost:3000"

echo "🧪 Testing Connection Lifecycle..."

# Test 1: Initial state
echo "Test 1: Initial state should be disconnected"
STATUS=$(curl -s $BACKEND_URL/api/connection/status | jq -r '.connected')
if [ "$STATUS" != "false" ]; then
  echo "❌ FAIL: Expected disconnected"
  exit 1
fi
echo "✅ PASS"

# Test 2: Manual disconnect flag persistence
echo "Test 2: Manual disconnect flag must persist"
# (Assumes previous manual disconnect)
FLAG=$(cat /root/tradebaas/backend-state.json | jq -r '.connection.manuallyDisconnected')
if [ "$FLAG" != "true" ]; then
  echo "❌ FAIL: manuallyDisconnected not true"
  exit 1
fi
echo "✅ PASS"

# Test 3: Backend respects manual disconnect
echo "Test 3: Backend must not auto-reconnect on restart"
pm2 restart tradebaas-backend --silent
sleep 5
STATUS=$(curl -s $BACKEND_URL/api/connection/status | jq -r '.connected')
if [ "$STATUS" != "false" ]; then
  echo "❌ FAIL: Auto-reconnected despite manual disconnect"
  exit 1
fi
echo "✅ PASS"

echo "🎉 All tests passed!"
```

---

## Troubleshooting

### Issue: Disconnect button does nothing

**Symptoms**:
- Click "Verbreek verbinding"
- Status stays "Verbonden"
- No console errors

**Diagnosis**:
```bash
# Check backend logs
pm2 logs tradebaas-backend --lines 20

# Check browser console
# Look for disconnect() call and response
```

**Solutions**:
1. Hard refresh browser (Ctrl+Shift+F5)
2. Check network tab - POST /api/v2/disconnect should return 200
3. Verify backend-api.ts disconnect() has no headers
4. Restart backend: `pm2 restart tradebaas-backend`

---

### Issue: Auto-reconnect after manual disconnect

**Symptoms**:
- Disconnect via UI
- Refresh page or restart backend
- Status changes back to "Verbonden"

**Diagnosis**:
```bash
# Check backend-state.json
cat /root/tradebaas/backend-state.json | jq '.connection'

# Expected:
{
  "connected": false,
  "manuallyDisconnected": true
}

# If manuallyDisconnected is false or missing, bug confirmed
```

**Solutions**:
1. Verify disconnect() sets flag: `manuallyDisconnected: true`
2. Check setConnection() preserves flag with `?? false` default
3. Review initialize() logic - should check flag before connect
4. Manual fix: `echo '{"connection":{"connected":false,"manuallyDisconnected":true}}' > backend-state.json`

---

### Issue: 400 Error on disconnect

**Symptoms**:
- Browser console shows: `POST /api/v2/disconnect 400`
- Error message: "Body cannot be empty when content-type is set to 'application/json'"

**Diagnosis**:
```typescript
// Check backend-api.ts disconnect() implementation
// If it has headers with Content-Type, that's the bug
```

**Solution**:
```typescript
// Remove headers from disconnect fetch
async disconnect(): Promise<{ success: boolean }> {
  const response = await fetch(`${this.baseUrl}/api/v2/disconnect`, {
    method: 'POST'
    // NO HEADERS!
  });
  // ...
}
```

---

### Issue: Credentials lost after restart

**Symptoms**:
- Connect works initially
- Restart backend
- Error: "No Deribit credentials found"

**Diagnosis**:
```bash
# Check credentials in KV
curl http://localhost:3000/api/credentials/deribit | jq

# If returns null or error, credentials not persisted
```

**Solutions**:
1. Verify saveCredentials() is called BEFORE connect()
2. Check credentials are in array format: `[{key, value}]`
3. Ensure KV storage is working (check backend logs)
4. Don't call deleteCredentials() during connect flow

---

### Issue: State file corrupted

**Symptoms**:
- Backend fails to start
- Error: "Unexpected token in JSON"

**Diagnosis**:
```bash
# Validate JSON
cat /root/tradebaas/backend-state.json | jq .

# If error, file is corrupted
```

**Solution**:
```bash
# Reset state file
cat > /root/tradebaas/backend-state.json << EOF
{
  "disclaimerAccepted": true,
  "activeStrategies": [],
  "lastUpdated": $(date +%s000)
}
EOF

# Restart backend
pm2 restart tradebaas-backend
```

---

## Appendix: Code Snippets

### Complete disconnect() Flow

```typescript
// Frontend: src/lib/backend-api.ts
async disconnect(): Promise<{ success: boolean }> {
  const response = await fetch(`${this.baseUrl}/api/v2/disconnect`, {
    method: 'POST'
  });
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    return { success: false };
  }
  
  await this.deleteCredentials('deribit');
  return { success: true };
}
```

```typescript
// Backend: backend/src/strategy-service.ts
async disconnect(): Promise<void> {
  console.log('[StrategyService] Disconnecting...');
  
  for (const strategyId of this.runningStrategies.keys()) {
    await this.stopStrategy({ strategyId });
  }
  
  if (this.client) {
    this.client.disconnect();
    this.client = null;
  }
  
  await stateManager.setConnection({
    broker: 'deribit',
    environment: this.environment,
    connected: false,
    connectedAt: undefined,
    manuallyDisconnected: true,
  });
  
  console.log('[StrategyService] Disconnected');
}
```

```typescript
// Backend: backend/src/state-manager.ts
async setConnection(connection: ConnectionState): Promise<void> {
  console.log('[StateManager] setConnection called with:', 
    JSON.stringify(connection, null, 2));
  
  this.state.connection = {
    broker: connection.broker,
    environment: connection.environment,
    connected: connection.connected,
    connectedAt: connection.connectedAt,
    manuallyDisconnected: connection.manuallyDisconnected ?? false,
  };
  
  await this.save();
  
  console.log('[StateManager] Connection state updated and saved. Final state:', 
    JSON.stringify(this.state.connection, null, 2));
}
```

---

**End of Connection Management Documentation**

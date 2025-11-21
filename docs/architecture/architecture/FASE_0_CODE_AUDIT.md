# FASE 0: Code Audit & Analysis
**Multi-User Implementation - Preparation Phase**

> **📅 CREATED:** 21 november 2025  
> **🎯 DOEL:** Complete code audit BEFORE starting refactor  
> **⏱️ DURATION:** 1 week

---

## 0.1 StrategyService Dependencies

### Import Analysis

**File:** `backend/src/strategy-service.ts`

```typescript
import { BackendDeribitClient, type DeribitEnvironment } from './deribit-client';
import { stateManager, type StrategyState } from './state-manager';
import { credentialsManager } from './credentials-manager';
import { RazorExecutor, type RazorConfig } from './strategies/razor-executor';
import { ThorExecutor, type ThorConfig } from './strategies/thor-executor';
import { updateStrategiesHealth } from './health';
import { getTradeHistoryService } from './services/trade-history';
import type { AnalysisState, PositionMetrics } from './types/analysis';
```

### Dependencies Map

| Dependency | Type | Usage | Multi-User Impact |
|------------|------|-------|-------------------|
| `BackendDeribitClient` | Class | Broker connection | ❌ **GLOBAL** - moet per-user |
| `stateManager` | Singleton | Strategy state persistence | ❌ **GLOBAL** - backend-state.json (shared) |
| `credentialsManager` | Singleton | Load credentials from .env | ❌ **GLOBAL** - .env file (shared) |
| `RazorExecutor` | Class | Strategy execution logic | ✅ Can be instantiated per-user |
| `ThorExecutor` | Class | Strategy execution logic | ✅ Can be instantiated per-user |
| `updateStrategiesHealth` | Function | Health metrics | ⚠️ Needs userId context |
| `getTradeHistoryService` | Function | Trade database | ❌ NO userId filtering |

### Class Fields

```typescript
export class StrategyService {
  private client: BackendDeribitClient | null = null;  // ❌ GLOBAL
  private runningStrategies = new Map<string, NodeJS.Timeout>();  // ❌ NO userId key
  private strategyExecutors = new Map<string, RazorExecutor | ThorExecutor>();  // ❌ NO userId key
  private environment: DeribitEnvironment = 'testnet';  // ⚠️ Per-user?
}
```

### Critical Methods

#### 1. `initialize()` - Auto-Resume Logic

**Current Implementation:**
```typescript
async initialize(): Promise<void> {
  await stateManager.initialize();  // ❌ Loads GLOBAL backend-state.json
  
  const connection = stateManager.getConnection();  // ❌ GLOBAL connection
  
  if (connection.connected) {
    await this.connect(connection.environment);  // ❌ Uses credentialsManager (.env)
    
    // Initialize OrderLifecycleManager
    const { initializeOrderLifecycleManager } = await import('./services/order-lifecycle-manager');
    initializeOrderLifecycleManager(this.client);  // ❌ GLOBAL client
    
    // Reconcile trades
    await this.reconcileAllOpenTrades();  // ❌ NO userId filtering
    
    // Auto-resume strategies
    const strategiesToResume = stateManager.getStrategiesToResume();  // ❌ GLOBAL state
    for (const strategy of strategiesToResume) {
      await this.runStrategy(strategy);  // ❌ Uses GLOBAL client
    }
  }
}
```

**Multi-User Requirements:**
- ✅ Query `user_strategies` table (per-user)
- ✅ Get connected users from `UserBrokerRegistry`
- ✅ For each user: get their client, resume their strategies
- ✅ Reconcile trades per-user

#### 2. `connect()` - Broker Connection

**Current Implementation:**
```typescript
async connect(environment: DeribitEnvironment): Promise<void> {
  // Load credentials from KV storage (saved by frontend), fallback to .env
  let apiKey: string;
  let apiSecret: string;
  
  try {
    const kvCreds = await credentialsManager.getCredentials('deribit');
    if (kvCreds.success && kvCreds.credentials) {
      apiKey = kvCreds.credentials.api_key;
      apiSecret = kvCreds.credentials.api_secret;
    } else {
      throw new Error('No KV credentials, trying .env...');
    }
  } catch (kvError) {
    // Fallback to .env credentials
    apiKey = process.env.DERIBIT_API_KEY!;
    apiSecret = process.env.DERIBIT_API_SECRET!;
  }
  
  this.client = new BackendDeribitClient(environment);  // ❌ GLOBAL client
  await this.client.connect({ apiKey, apiSecret });
  
  // Save connection state
  await stateManager.setConnection({ ... });  // ❌ GLOBAL state
}
```

**Multi-User Impact:**
- ❌ This method should NOT exist in multi-user setup
- ✅ Use `UserBrokerRegistry.connect(userId, broker, environment)` instead
- ✅ Credentials from `UserCredentialsService.loadCredentials(userId, broker, env)`

#### 3. `startStrategy()` - Start Strategy

**Current Implementation:**
```typescript
async startStrategy(request: StartStrategyRequest): Promise<{ success: boolean; strategyId: string; message: string }> {
  if (!this.client || !this.client.isConnected()) {
    throw new Error('Not connected to broker. Please connect first.');
  }
  
  const strategyId = `${request.strategyName}-${Date.now()}`;
  
  // Check if strategy already running
  const existing = stateManager.getAllStrategies().find(s => s.name === request.strategyName && s.config?.instrument === request.instrument);
  if (existing && existing.status === 'active') {
    throw new Error('Strategy already running');
  }
  
  // Create executor
  const executor = this.createExecutor(request.strategyName, request.config, this.client);
  this.strategyExecutors.set(strategyId, executor);
  
  // Save to state
  await stateManager.addStrategy({ ... });  // ❌ GLOBAL state file
  
  // Start execution
  await this.runStrategy(strategyState);
}
```

**Multi-User Requirements:**
- ✅ Accept `userId` parameter
- ✅ Get user's client: `userBrokerRegistry.getClient(userId, broker, env)`
- ✅ Check user's active strategies: query `user_strategies` table
- ✅ Create executor with user's client
- ✅ Save to `user_strategies` table (PostgreSQL)
- ✅ Use userId-prefixed strategyId: `userId:strategyName:instrument`

#### 4. `stopStrategy()` - Stop Strategy

**Current Implementation:**
```typescript
async stopStrategy(request: StopStrategyRequest): Promise<{ success: boolean; message: string }> {
  const timer = this.runningStrategies.get(request.strategyId);
  if (timer) {
    clearInterval(timer);
    this.runningStrategies.delete(request.strategyId);
  }
  
  await stateManager.updateStrategyStatus(request.strategyId, 'stopped');  // ❌ GLOBAL state
  
  const executor = this.strategyExecutors.get(request.strategyId);
  if (executor) {
    this.strategyExecutors.delete(request.strategyId);
  }
  
  await stateManager.cleanupStoppedStrategies();  // ❌ GLOBAL cleanup
}
```

**Multi-User Requirements:**
- ✅ Accept `userId` parameter
- ✅ Verify `strategyId.startsWith(userId:)` (security)
- ✅ Update `user_strategies` table
- ✅ Cleanup per-user (don't affect other users)

#### 5. `getStrategyStatus()` - Get Strategy Status

**Current Implementation:**
```typescript
async getStrategyStatus(strategyId?: string): Promise<StrategyState[]> {
  const strategies = strategyId 
    ? stateManager.getAllStrategies().filter(s => s.id === strategyId)
    : stateManager.getAllStrategies();  // ❌ GLOBAL state (all users mixed)
  
  // Enrich with database state
  const enrichedStrategies = await Promise.all(strategies.map(async (strategy) => {
    const tradeHistory = getTradeHistoryService();
    const openTrade = await tradeHistory.getOpenTrade(strategy.name, instrument);  // ❌ NO userId
    // ...
  }));
}
```

**Multi-User Requirements:**
- ✅ Accept `userId` parameter (FIRST parameter)
- ✅ Query `user_strategies WHERE user_id = $1`
- ✅ Filter trades by userId
- ✅ Return ONLY user's strategies

---

## 0.2 Global State Locations

### StateManager (`backend/src/state-manager.ts`)

**File Path:** `/root/Tradebaas-1/state/backend-state.json`

**Current Schema:**
```typescript
export interface BackendState {
  disclaimerAccepted: boolean;
  connection?: ConnectionState;  // ❌ GLOBAL connection
  activeStrategies: StrategyState[];  // ❌ ALL users mixed
  lastUpdated: number;
}
```

**Problem:**
- All users share same file
- No userId tracking
- Connection state is global (one user's disconnect affects all)

**Solution:**
- ❌ Remove this file (replace with PostgreSQL `user_strategies` table)
- ✅ Per-user connection tracking in `UserBrokerRegistry`
- ✅ Disclaimer per-user in `users` table

### CredentialsManager (`backend/src/credentials-manager.ts`)

**File Path:** `/root/Tradebaas-1/backend/.env`

**Current Behavior:**
- Writes to `.env` file (GLOBAL)
- All users overwrite same credentials
- Last user to connect wins

**Problem:**
```
User A connects with keyA → .env has keyA
User B connects with keyB → .env has keyB (User A broken!)
```

**Solution:**
- ❌ Stop using `.env` for user credentials
- ✅ Use `UserCredentialsService` (PostgreSQL encrypted storage)
- ✅ Keep `.env` for system-level config only (database, ports, etc.)

### RunningStrategies Map

**Location:** `StrategyService.runningStrategies`

**Current Key:** `strategyId` (no userId)

**Problem:**
- If two users run same strategy on same instrument, ID collision possible
- No way to filter strategies by user

**Solution:**
- ✅ Change key to: `${userId}:${strategyName}:${instrument}`
- ✅ Add helper method: `getUserStrategies(userId): Map<string, NodeJS.Timeout>`

### StrategyExecutors Map

**Location:** `StrategyService.strategyExecutors`

**Current Key:** `strategyId`

**Problem:**
- Same as runningStrategies (no userId isolation)

**Solution:**
- ✅ Change key to: `${userId}:${strategyName}:${instrument}`
- ✅ Executor gets userId in constructor

---

## 0.3 API Endpoint Mapping

### Strategy Endpoints

| Endpoint | Method | Auth | Current Params | Needs userId | Breaking Change |
|----------|--------|------|----------------|--------------|-----------------|
| `/api/strategy/start` | POST | ❌ NO | `StartStrategyRequest` | ✅ YES | ✅ Add `authenticateRequest` |
| `/api/strategy/stop` | POST | ❌ NO | `StopStrategyRequest` | ✅ YES | ✅ Add `authenticateRequest` |
| `/api/strategy/status` | GET | ❌ NO | `strategyId?` | ✅ YES | ✅ Add `authenticateRequest` |
| `/api/v2/connect` | POST | ✅ YES | `environment, broker` | ✅ Has JWT | ⚠️ Update to check credentials first |
| `/api/v2/disconnect` | POST | ✅ YES | - | ✅ Has JWT | ✅ Already correct |

### Credential Endpoints (Already Multi-User)

| Endpoint | Method | Auth | Status |
|----------|--------|------|--------|
| `/api/user/credentials` | POST | ✅ YES | ✅ Works |
| `/api/user/credentials/status` | GET | ✅ YES | ✅ Works |
| `/api/user/credentials` | GET | GET | ✅ Works |
| `/api/user/credentials` | DELETE | ✅ YES | ✅ Works |

**Note:** These are ALREADY implemented correctly with `authenticateRequest` middleware!

### Admin Endpoints (Already Multi-User)

| Endpoint | Method | Auth | Status |
|----------|--------|------|--------|
| `/api/admin/users` | GET | ✅ Admin | ✅ Works |
| `/api/admin/users/:userId/reset-password` | POST | ✅ Admin | ✅ Works |
| `/api/admin/users/:userId/toggle-active` | POST | ✅ Admin | ✅ Works |
| `/api/admin/users/:userId` | DELETE | ✅ Admin | ✅ Works |

---

## 0.4 Current Credential Flow

### Detailed Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CURRENT FLOW (Single-User)                 │
└─────────────────────────────────────────────────────────────────────┘

1. User opens SettingsDialog
   └─ src/components/dialogs/SettingsDialog.tsx
      └─ Input: apiKey, apiSecret
      └─ Environment toggle: testnet/live

2. User clicks "Verbinden"
   └─ handleConnect() triggers

3. Frontend: store.connect()
   └─ src/state/store.ts - connect method
      └─ Calls: backendAPI.connect(credentials, environment)
         └─ src/lib/backend-client.ts - connect()
            └─ POST http://localhost:3000/api/v2/connect
               Body: { apiKey, apiSecret, environment }

4. Backend: /api/v2/connect endpoint
   └─ backend/src/server.ts
      ├─ ✅ Has authenticateRequest middleware (extracts userId from JWT)
      ├─ Calls: userBrokerRegistry.connect(userId, broker, environment)
      │  └─ backend/src/user-broker-registry.ts
      │     ├─ Calls: userCredentialsService.loadCredentials(userId, broker, env)
      │     │  └─ ❌ NO CREDENTIALS (niet opgeslagen via /api/user/credentials)
      │     │  └─ ❌ FAILS → Falls back to .env
      │     │
      │     └─ ❌ WORKAROUND: credentialsManager.saveCredentials()
      │        └─ backend/src/credentials-manager.ts
      │           └─ Writes to /root/Tradebaas-1/backend/.env
      │              ├─ DERIBIT_API_KEY=...
      │              └─ DERIBIT_API_SECRET=...
      │              └─ ❌ GLOBAL FILE (all users overwrite)
      │
      └─ Creates: new BackendDeribitClient(environment)
         └─ Connects with credentials from .env
         └─ Stores in UserBrokerRegistry.clients Map

5. StrategyService.connect()
   └─ ❌ ALSO called (separate path, creates GLOBAL client)
   └─ backend/src/strategy-service.ts - connect()
      ├─ Loads credentials from credentialsManager (.env)
      ├─ Creates: this.client = new BackendDeribitClient(environment)
      └─ ❌ Saves to stateManager (backend-state.json - GLOBAL)

┌─────────────────────────────────────────────────────────────────────┐
│                               PROBLEMS                               │
└─────────────────────────────────────────────────────────────────────┘

❌ Credentials NOT saved via /api/user/credentials (encrypted PostgreSQL)
❌ Credentials written to .env (GLOBAL file, all users overwrite)
❌ UserBrokerRegistry falls back to .env (no per-user credentials)
❌ StrategyService creates GLOBAL client (not per-user)
❌ Connection state saved to backend-state.json (GLOBAL, not per-user)
```

### Required Changes

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NEW FLOW (Multi-User)                       │
└─────────────────────────────────────────────────────────────────────┘

1. User opens SettingsDialog
   └─ SAME (no change)

2. User clicks "Verbinden"
   └─ handleConnect() triggers

3. 🆕 Frontend: Save credentials FIRST
   └─ src/lib/backend-client.ts - saveUserCredentials()
      └─ POST http://localhost:3000/api/user/credentials
         Headers: { Authorization: Bearer JWT }
         Body: { broker, environment, apiKey, apiSecret }
         
   └─ Backend: /api/user/credentials endpoint
      ├─ ✅ Has authenticateRequest (extracts userId)
      ├─ Calls: userCredentialsService.saveCredentials({userId, broker, env, apiKey, apiSecret})
      │  └─ Encrypts with AES-256-GCM (per-user salt)
      │  └─ Saves to PostgreSQL user_credentials table
      └─ Returns: { success: true }

4. Frontend: Connect to broker
   └─ src/state/store.ts - connect()
      └─ Calls: backendAPI.connect(credentials, environment)
         └─ POST http://localhost:3000/api/v2/connect
            Body: { environment, broker }  // 🆕 NO credentials (already saved)

5. Backend: /api/v2/connect endpoint
   └─ ✅ Has authenticateRequest (extracts userId)
   ├─ 🆕 Check: userCredentialsService.hasCredentials(userId, broker, env)
   │  └─ If FALSE → return 400 "No credentials, save first"
   │
   ├─ Calls: userBrokerRegistry.connect(userId, broker, environment)
   │  └─ Loads: userCredentialsService.loadCredentials(userId, broker, env)
   │  │  └─ ✅ Decrypts from PostgreSQL (per-user)
   │  │
   │  └─ Creates: new BackendDeribitClient(environment)
   │  └─ Connects with user's credentials
   │  └─ Stores in Map: clients.set(`${userId}:${broker}:${env}`, client)
   │
   └─ Returns: { success: true }

6. StrategyService.startStrategy()
   └─ 🆕 Gets user's client: userBrokerRegistry.getClient(userId, broker, env)
   └─ Creates executor with user's client
   └─ Saves to user_strategies table (PostgreSQL, per-user)
   └─ NO MORE GLOBAL CLIENT ✅

┌─────────────────────────────────────────────────────────────────────┐
│                               BENEFITS                               │
└─────────────────────────────────────────────────────────────────────┘

✅ Credentials encrypted in PostgreSQL (per-user, AES-256-GCM)
✅ NO .env file pollution (stays clean for system config)
✅ UserBrokerRegistry has per-user clients (isolated)
✅ StrategyService uses per-user clients (no global state)
✅ Connection state per-user (no conflicts)
✅ Multiple users can connect simultaneously ✅
```

---

## 0.5 Breaking Changes Identified

### API Breaking Changes

1. **Strategy Start Endpoint**
   - OLD: `POST /api/strategy/start` (no auth)
   - NEW: `POST /api/strategy/start` (requires JWT)
   - Impact: Frontend must include JWT token
   - Migration: Frontend already uses JWT for other endpoints, extend to strategy endpoints

2. **Strategy Stop Endpoint**
   - OLD: `POST /api/strategy/stop` (no auth)
   - NEW: `POST /api/strategy/stop` (requires JWT)
   - Impact: Same as above

3. **Strategy Status Endpoint**
   - OLD: `GET /api/strategy/status` (no auth, returns ALL strategies)
   - NEW: `GET /api/strategy/status` (requires JWT, returns ONLY user's strategies)
   - Impact: Response format stays same, but filtered by user

4. **StrategyId Format**
   - OLD: `Razor-1732234567890`
   - NEW: `userId:Razor:BTC_USDC-PERPETUAL`
   - Impact: Frontend must handle new format when calling stop/status

### Database Breaking Changes

1. **Trades Table**
   - OLD: No `user_id` column
   - NEW: `user_id` column (NOT NULL after migration)
   - Migration: Assign existing trades to first admin user

2. **State Files**
   - OLD: `state/backend-state.json` (global)
   - NEW: `user_strategies` table (PostgreSQL)
   - Migration: Read backend-state.json, insert into user_strategies for admin user

### Code Breaking Changes

1. **StrategyService.connect()**
   - OLD: Public method (called by endpoints)
   - NEW: ❌ REMOVED (use UserBrokerRegistry instead)
   - Migration: Update all connect calls to use UserBrokerRegistry

2. **StrategyService.client**
   - OLD: Private global client field
   - NEW: ❌ REMOVED (use UserBrokerRegistry.getClient())
   - Migration: Replace `this.client` with `getUserClient(userId, env)`

3. **StateManager Global State**
   - OLD: `stateManager.addStrategy()` (writes to backend-state.json)
   - NEW: Direct PostgreSQL insert to `user_strategies`
   - Migration: Replace all stateManager calls with database queries

---

## 0.6 Risk Assessment

### High Risk

1. **Auto-Resume Logic**
   - Current: Loads from backend-state.json (global)
   - Risk: If migration fails, ALL users lose auto-resume
   - Mitigation: Backup backend-state.json before migration

2. **Credential Migration**
   - Current: .env file (global)
   - Risk: If we delete .env credentials, old deployments break
   - Mitigation: Keep .env as fallback (deprecated) for 1 month

3. **Trade History Data Loss**
   - Current: No user_id column
   - Risk: If migration script fails, trades could lose user context
   - Mitigation: BACKUP trades table before migration, dry-run on dev first

### Medium Risk

4. **Frontend Breaking Changes**
   - Risk: Old frontend (without JWT for strategy endpoints) breaks
   - Mitigation: Deploy backend first (backward compatible), then frontend

5. **strategyId Format Change**
   - Risk: Old strategyIds in localStorage/cookies break
   - Mitigation: Clear localStorage on major version update (force re-login)

### Low Risk

6. **Performance**
   - Risk: Database queries slower than JSON file reads
   - Mitigation: Add indexes (user_id, status, updated_at)

---

## 0.7 Rollback Plan

### If Migration Fails

1. **Database Rollback**
   ```sql
   -- Drop user_strategies table
   DROP TABLE IF EXISTS user_strategies;
   
   -- Remove user_id column from trades
   ALTER TABLE trades DROP COLUMN IF EXISTS user_id;
   ```

2. **Code Rollback**
   ```bash
   git reset --hard <commit-before-multi-user>
   pm2 restart all
   ```

3. **Data Restoration**
   ```bash
   # Restore backend-state.json
   cp /root/backup/backend-state.json /root/Tradebaas-1/state/
   
   # Restore .env
   cp /root/backup/.env /root/Tradebaas-1/backend/
   
   # Restore trades table
   psql -U tradebaas -d tradebaas < /root/backup/trades-backup.sql
   ```

---

## 0.8 Testing Strategy

### Unit Tests

- [ ] StrategyService.getUserClient() returns correct client per userId
- [ ] StrategyService.startStrategy() saves to user_strategies table
- [ ] StrategyService.stopStrategy() verifies userId ownership
- [ ] StrategyService.getStrategyStatus() filters by userId
- [ ] TradeHistoryService filters trades by userId

### Integration Tests

- [ ] Multi-user isolation: 2 users, different credentials, different strategies
- [ ] Auto-resume: User A active, User B stopped, backend restart → User A resumes
- [ ] Manual disconnect: User disconnects, backend restarts, user stays disconnected
- [ ] Concurrent users: 10 users connect simultaneously, no conflicts

### Performance Tests

- [ ] 10 users, each with 1 active strategy
- [ ] 100 users, each with credentials saved
- [ ] Database query performance (user_strategies, trades)
- [ ] WebSocket broadcast per-user (no unnecessary messages)

---

## 0.9 Success Criteria (Definition of Done)

### Phase 0 Complete When:

- [x] All dependencies documented
- [x] All global state locations identified
- [x] All API endpoints mapped (auth requirements)
- [x] Current credential flow documented (exact steps)
- [x] Breaking changes identified and documented
- [x] Risk assessment complete
- [x] Rollback plan documented
- [x] Testing strategy defined
- [ ] Code audit reviewed and approved
- [ ] Migration plan reviewed and approved

### Ready for Phase 1 (Database Migrations) When:

- [ ] All Phase 0 tasks complete
- [ ] Team understands breaking changes
- [ ] Backup strategy in place
- [ ] Dev environment ready for testing
- [ ] Migration scripts written (pending review)

---

## Next Steps

1. ✅ Review this audit document with team
2. ✅ Approve migration strategy
3. ✅ Proceed to FASE 1: Database Migrations

**STOP HERE UNTIL AUDIT APPROVED** ⚠️

Do NOT start coding until:
- [ ] This document reviewed
- [ ] Risks accepted
- [ ] Rollback plan tested (on dev)
- [ ] Team agrees on timeline (9 weeks)

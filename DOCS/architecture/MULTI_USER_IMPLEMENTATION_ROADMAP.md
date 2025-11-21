# Multi-User SaaS Implementation Roadmap
**Tradebaas - Professional Multi-Tenant Transformation**

> **📅 CREATED:** 21 november 2025  
> **👤 AUTHOR:** AI Development Team  
> **🎯 DOEL:** Complete, professional multi-user implementation zonder tech debt  
> **⏱️ GESCHATTE TIJD:** 4-6 weken fulltime (8-12 weken part-time)

---

## Executive Summary

### ✅ WAT WERKT AL (Fase 1-2 Complete)

**Authentication & Authorization:**
- ✅ PostgreSQL users table met JWT-based authentication
- ✅ argon2 password hashing (industry standard)
- ✅ Admin panel (user management, toggle-active, delete, password reset)
- ✅ Protected API endpoints met `authenticateRequest` middleware
- ✅ `requireAdmin` middleware voor admin-only endpoints

**Per-User Credential Storage (INFRASTRUCTURE):**
- ✅ `UserCredentialsService` volledig geïmplementeerd
- ✅ AES-256-GCM encrypted credential storage in PostgreSQL
- ✅ API endpoints: POST/GET/DELETE `/api/user/credentials`
- ✅ Tested met `test-credentials-endpoints.sh` - user isolation confirmed

**Per-User Broker Registry (INFRASTRUCTURE):**
- ✅ `UserBrokerRegistry` volledig geïmplementeerd
- ✅ Per-user broker client isolation (Map<userId:broker:env, client>)
- ✅ Manual disconnect tracking in kvStorage
- ✅ API endpoints: POST `/api/v2/connect`, POST `/api/v2/disconnect`

**Frontend UI:**
- ✅ SettingsDialog.tsx bestaat met credential input fields
- ✅ API key/secret input met show/hide toggle
- ✅ Environment toggle (testnet/live)
- ✅ Connect/disconnect buttons

---

### ❌ WAT NIET WERKT (Fase 3-5 Missing)

**KRITIEKE GAP #1: Settings Dialog roept OUDE endpoints aan**
```typescript
// HUIDIGE FLOW (src/state/store.ts - connect method):
const result = await backendAPI.connect(credentials, environment);

// Dit roept /api/v2/connect aan, die gebruikt:
// - credentialsManager (schrijft naar .env - GLOBAL, NIET per-user)
// - Credentials NIET opgeslagen in /api/user/credentials (per-user encrypted storage)
```

**PROBLEEM:** User credentials worden NIET encrypted opgeslagen in PostgreSQL, maar in .env (global file).

**KRITIEKE GAP #2: StrategyService is GLOBAL (niet per-user)**
```typescript
// backend/src/strategy-service.ts
export class StrategyService {
  private client: BackendDeribitClient | null = null;  // ❌ GLOBAL CLIENT
  private runningStrategies = new Map<string, NodeJS.Timeout>();  // ❌ NO USER ID
  private strategyExecutors = new Map<string, RazorExecutor>();    // ❌ NO USER ID
}
```

**PROBLEEM:** Alle strategies draaien met dezelfde global broker client. Multiple users kunnen NIET tegelijk strategies draaien.

**KRITIEKE GAP #3: Strategy endpoints hebben GEEN authenticateRequest**
```typescript
// backend/src/server.ts
server.post('/api/strategy/start', async (request) => {
  return await strategyService.startStrategy(request.body);  // ❌ NO USER CONTEXT
});
```

**PROBLEEM:** Geen userId context, geen isolatie tussen users.

**KRITIEKE GAP #4: Trade history NIET per-user**
- Trades table heeft GEEN `user_id` kolom
- Alle trades zijn global (niet geïsoleerd per user)

**KRITIEKE GAP #5: Strategy state NIET per-user**
- Geen `user_strategies` tabel
- Geen persistent strategy selection per user
- Auto-resume is global (niet per-user aware)

**KRITIEKE GAP #6: WebSocket streams NIET per-user**
- WebSocket broadcast gaat naar alle clients
- Geen userId-based filtering van updates

---

## Detailed Analysis

### Current Architecture (Single-User)

```
┌─────────────────┐
│   Frontend UI   │
│  (any browser)  │
└────────┬────────┘
         │
         ├─ POST /api/v2/connect (credentials → .env file)
         ├─ POST /api/strategy/start (NO userId)
         └─ WebSocket (global broadcast)
                  │
         ┌────────▼────────┐
         │  Backend (PM2)  │
         │                 │
         │  StrategyService│ ─────► GLOBAL DeribitClient
         │   (singleton)   │
         │                 │
         │  StateManager   │ ─────► state/backend-state.json (GLOBAL)
         └─────────────────┘
```

**PROBLEEM:** Multiple browsers = Same credentials, Same state, Same trades

---

### Target Architecture (Multi-User)

```
┌──────────────────┐       ┌──────────────────┐
│  User A Browser  │       │  User B Browser  │
└────────┬─────────┘       └────────┬─────────┘
         │                          │
         │ JWT: userA               │ JWT: userB
         │                          │
         ├─ POST /api/user/credentials (encrypted → PostgreSQL)
         ├─ POST /api/v2/connect (userA context)
         ├─ POST /api/strategy/start (+ authenticateRequest)
         │                          │
         │                          │
    ┌────▼──────────────────────────▼────┐
    │       Backend (PM2)                │
    │                                    │
    │  authenticateRequest (extract JWT) │
    │         ↓                          │
    │  UserBrokerRegistry                │
    │    ├─ userA → DeribitClient A      │
    │    └─ userB → DeribitClient B      │
    │                                    │
    │  StrategyService (per-user)        │
    │    ├─ userA → RazorExecutor A      │
    │    └─ userB → ThorExecutor B       │
    │                                    │
    │  StateManager (per-user files)     │
    │    ├─ state/user-{userA}-...json   │
    │    └─ state/user-{userB}-...json   │
    │                                    │
    │  PostgreSQL                        │
    │    ├─ user_credentials (encrypted) │
    │    ├─ user_strategies (per-user)   │
    │    └─ trades (user_id column)      │
    └────────────────────────────────────┘
```

---

## Implementation Phases

### 🔷 FASE 0: Preparation & Analysis (1 week)

**DOEL:** Begrijp exact wat er moet gebeuren, prevent tech debt

#### Tasks:

1. **Code Audit**
   - [ ] Inventory alle StrategyService dependencies
   - [ ] Identify alle global state locations
   - [ ] Map alle /api/strategy/* endpoints
   - [ ] Document current credential flow (exact)
   - [ ] Identify breaking changes

2. **Database Planning**
   - [ ] Design `user_strategies` table schema
   - [ ] Design trades table migration (add user_id)
   - [ ] Plan indexes voor multi-user queries
   - [ ] Create migration scripts (backward compatible)

3. **Testing Strategy**
   - [ ] Define test scenarios (2+ users simultaneously)
   - [ ] Create test data fixtures
   - [ ] Plan integration tests
   - [ ] Plan performance tests (N concurrent users)

4. **Documentation**
   - [ ] Create API contract document (before/after)
   - [ ] Document breaking changes
   - [ ] Create rollback plan
   - [ ] Security audit checklist

---

### 🔷 FASE 1: Database & Migrations (1 week)

**DOEL:** Maak database multi-user ready, backwards compatible

#### 1.1 Create user_strategies Table

**File:** `backend/migrations/001_create_user_strategies.sql`

```sql
CREATE TABLE IF NOT EXISTS user_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_name VARCHAR(100) NOT NULL,
  instrument VARCHAR(100) NOT NULL,
  broker VARCHAR(50) NOT NULL DEFAULT 'deribit',
  environment VARCHAR(20) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'stopped',
  
  -- KRITIEK voor manual connect requirement
  last_action VARCHAR(50),  -- 'manual_connect', 'manual_disconnect', 'auto_resume'
  auto_reconnect BOOLEAN DEFAULT true,  -- FALSE bij manual disconnect
  
  connected_at TIMESTAMP,
  disconnected_at TIMESTAMP,
  last_heartbeat TIMESTAMP,
  error_message TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE (user_id, strategy_name, instrument, environment),
  CHECK (status IN ('active', 'stopped', 'paused', 'error')),
  CHECK (environment IN ('live', 'testnet')),
  
  -- Indexes
  INDEX idx_user_strategies_user (user_id),
  INDEX idx_user_strategies_status (status),
  INDEX idx_user_strategies_auto_reconnect (auto_reconnect),
  INDEX idx_user_strategies_updated (updated_at DESC)
);
```

#### 1.2 Extend Trades Table

**File:** `backend/migrations/002_add_user_id_to_trades.sql`

```sql
-- Add user_id column (nullable first for migration)
ALTER TABLE trades ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Create index for user-specific queries
CREATE INDEX idx_trades_user ON trades(user_id);

-- Create composite index for common query pattern
CREATE INDEX idx_trades_user_strategy ON trades(user_id, strategy_name, created_at DESC);

-- LATER: Make NOT NULL after migration
-- ALTER TABLE trades ALTER COLUMN user_id SET NOT NULL;
```

#### 1.3 Migration Script voor Existing Data

**File:** `backend/migrations/003_migrate_existing_data.ts`

```typescript
/**
 * Migrate existing trades and state to first admin user
 */
import { pool } from '../src/db';

export async function migrateExistingData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Find first admin user (fallback to any user)
    const adminResult = await client.query(
      'SELECT id FROM users WHERE is_admin = true ORDER BY created_at ASC LIMIT 1'
    );
    
    if (adminResult.rows.length === 0) {
      throw new Error('No admin user found - create one first!');
    }
    
    const adminUserId = adminResult.rows[0].id;
    console.log('[Migration] Assigning existing data to admin user:', adminUserId);
    
    // 2. Update all trades without user_id to admin user
    const tradesResult = await client.query(
      'UPDATE trades SET user_id = $1 WHERE user_id IS NULL RETURNING id',
      [adminUserId]
    );
    console.log('[Migration] Migrated', tradesResult.rowCount, 'trades to admin user');
    
    // 3. Migrate current strategy state to user_strategies table
    // Read from state/backend-state.json, insert into user_strategies
    // (Implementation depends on current state structure)
    
    // 4. Make user_id NOT NULL after migration
    await client.query('ALTER TABLE trades ALTER COLUMN user_id SET NOT NULL');
    
    await client.query('COMMIT');
    console.log('[Migration] ✅ Migration complete!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Migration] ❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
```

#### 1.4 Testing

```bash
# Test migrations
cd /root/Tradebaas-1/backend
npm run migrate

# Verify schema
psql -U tradebaas -d tradebaas -c "\d user_strategies"
psql -U tradebaas -d tradebaas -c "\d trades"

# Test data migration
npm run test:migration
```

---

### 🔷 FASE 2: Backend - StrategyService Refactor (2 weeks)

**DOEL:** StrategyService accepteert userId, gebruikt UserBrokerRegistry

#### 2.1 Refactor StrategyService Class

**File:** `backend/src/strategy-service.ts`

**BEFORE:**
```typescript
export class StrategyService {
  private client: BackendDeribitClient | null = null;
  private runningStrategies = new Map<string, NodeJS.Timeout>();
  private strategyExecutors = new Map<string, RazorExecutor | ThorExecutor>();
}
```

**AFTER:**
```typescript
import { userBrokerRegistry } from './user-broker-registry';

export class StrategyService {
  // REMOVE global client - use UserBrokerRegistry instead
  
  // ADD userId to keys for isolation
  private runningStrategies = new Map<string, NodeJS.Timeout>();  // key: `${userId}:${strategyId}`
  private strategyExecutors = new Map<string, RazorExecutor | ThorExecutor>();  // key: `${userId}:${strategyId}`
  
  /**
   * Get broker client for specific user
   */
  private async getUserClient(userId: string, environment: DeribitEnvironment): Promise<BackendDeribitClient> {
    const client = await userBrokerRegistry.getClient(userId, 'deribit', environment);
    
    if (!client) {
      throw new Error(`No active connection for user ${userId}. Please connect first.`);
    }
    
    return client;
  }
}
```

#### 2.2 Update startStrategy Method

**File:** `backend/src/strategy-service.ts`

```typescript
export interface StartStrategyRequest {
  strategyName: string;
  instrument: string;
  config: Record<string, any>;
  environment: DeribitEnvironment;
  disclaimerAccepted: boolean;
  userId: string;  // 🆕 ADD THIS
}

async startStrategy(request: StartStrategyRequest): Promise<{ success: boolean; strategyId: string; message: string }> {
  const { userId, strategyName, instrument, environment, config, disclaimerAccepted } = request;
  
  console.log(`[StrategyService] Starting strategy for user ${userId}:`, { strategyName, instrument, environment });
  
  // 1. Get user's broker client (from UserBrokerRegistry)
  const client = await this.getUserClient(userId, environment);
  
  // 2. Check if user already has this strategy running
  const existingKey = `${userId}:${strategyName}:${instrument}`;
  if (this.runningStrategies.has(existingKey)) {
    throw new Error(`Strategy ${strategyName} already running for this user on ${instrument}`);
  }
  
  // 3. Create strategy executor with user's client
  const executor = this.createExecutor(strategyName, config, client);
  
  // 4. Save to user_strategies table (PostgreSQL)
  await this.saveUserStrategy({
    userId,
    strategyName,
    instrument,
    broker: 'deribit',
    environment,
    config,
    status: 'active',
    last_action: 'manual_start',
    auto_reconnect: true,
  });
  
  // 5. Store executor with user-specific key
  this.strategyExecutors.set(existingKey, executor);
  
  // 6. Start execution loop
  await this.runStrategy(userId, strategyName, instrument, executor);
  
  console.log(`[StrategyService] ✅ Strategy started for user ${userId}`);
  
  return {
    success: true,
    strategyId: existingKey,
    message: `Strategy ${strategyName} started successfully`,
  };
}
```

#### 2.3 Update stopStrategy Method

**File:** `backend/src/strategy-service.ts`

```typescript
export interface StopStrategyRequest {
  strategyId: string;  // Format: "userId:strategyName:instrument"
  userId: string;  // 🆕 ADD THIS (for verification)
}

async stopStrategy(request: StopStrategyRequest): Promise<{ success: boolean; message: string }> {
  const { strategyId, userId } = request;
  
  console.log(`[StrategyService] Stopping strategy for user ${userId}:`, strategyId);
  
  // 1. Verify strategy belongs to this user
  if (!strategyId.startsWith(`${userId}:`)) {
    throw new Error('Unauthorized: strategy does not belong to this user');
  }
  
  // 2. Stop timer
  const timer = this.runningStrategies.get(strategyId);
  if (timer) {
    clearInterval(timer);
    this.runningStrategies.delete(strategyId);
  }
  
  // 3. Stop executor
  const executor = this.strategyExecutors.get(strategyId);
  if (executor) {
    this.strategyExecutors.delete(strategyId);
  }
  
  // 4. Update user_strategies table
  await this.updateUserStrategyStatus(userId, strategyId, 'stopped', 'manual_stop');
  
  console.log(`[StrategyService] ✅ Strategy stopped for user ${userId}`);
  
  return {
    success: true,
    message: `Strategy ${strategyId} stopped successfully`,
  };
}
```

#### 2.4 Update getStrategyStatus Method

**File:** `backend/src/strategy-service.ts`

```typescript
async getStrategyStatus(userId: string, strategyId?: string): Promise<StrategyState[]> {
  console.log(`[StrategyService] Getting strategy status for user ${userId}`);
  
  // 1. Query user_strategies table (PostgreSQL)
  const strategies = await this.getUserStrategies(userId, strategyId);
  
  // 2. Enrich with runtime state (if executor exists)
  return strategies.map(strategy => {
    const executorKey = `${userId}:${strategy.strategy_name}:${strategy.instrument}`;
    const executor = this.strategyExecutors.get(executorKey);
    
    return {
      ...strategy,
      isRunning: executor !== undefined,
      executorState: executor?.getState(),  // Runtime analysis state
    };
  });
}
```

#### 2.5 Database Helper Methods

**File:** `backend/src/strategy-service.ts`

```typescript
/**
 * Save strategy to user_strategies table
 */
private async saveUserStrategy(data: {
  userId: string;
  strategyName: string;
  instrument: string;
  broker: string;
  environment: string;
  config: Record<string, any>;
  status: string;
  last_action: string;
  auto_reconnect: boolean;
}): Promise<void> {
  const { pool } = await import('./db');
  
  await pool.query(
    `INSERT INTO user_strategies 
     (user_id, strategy_name, instrument, broker, environment, config, status, last_action, auto_reconnect, connected_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id, strategy_name, instrument, environment)
     DO UPDATE SET
       config = EXCLUDED.config,
       status = EXCLUDED.status,
       last_action = EXCLUDED.last_action,
       auto_reconnect = EXCLUDED.auto_reconnect,
       connected_at = NOW(),
       updated_at = NOW()`,
    [
      data.userId,
      data.strategyName,
      data.instrument,
      data.broker,
      data.environment,
      JSON.stringify(data.config),
      data.status,
      data.last_action,
      data.auto_reconnect,
    ]
  );
}

/**
 * Update strategy status in user_strategies table
 */
private async updateUserStrategyStatus(
  userId: string,
  strategyId: string,
  status: string,
  lastAction: string
): Promise<void> {
  const { pool } = await import('./db');
  
  // Parse strategyId: "userId:strategyName:instrument"
  const [, strategyName, instrument] = strategyId.split(':');
  
  await pool.query(
    `UPDATE user_strategies
     SET status = $1, last_action = $2, updated_at = NOW()
     WHERE user_id = $3 AND strategy_name = $4 AND instrument = $5`,
    [status, lastAction, userId, strategyName, instrument]
  );
}

/**
 * Get user's strategies from database
 */
private async getUserStrategies(userId: string, strategyId?: string): Promise<any[]> {
  const { pool } = await import('./db');
  
  if (strategyId) {
    const [, strategyName, instrument] = strategyId.split(':');
    const result = await pool.query(
      'SELECT * FROM user_strategies WHERE user_id = $1 AND strategy_name = $2 AND instrument = $3',
      [userId, strategyName, instrument]
    );
    return result.rows;
  } else {
    const result = await pool.query(
      'SELECT * FROM user_strategies WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    return result.rows;
  }
}
```

#### 2.6 Auto-Resume Logic (Per-User)

**File:** `backend/src/strategy-service.ts`

```typescript
/**
 * Initialize service - auto-resume per-user active strategies
 */
async initialize(): Promise<void> {
  console.log('[StrategyService] Initializing with per-user auto-resume...');
  
  const { pool } = await import('./db');
  
  // 1. Get all users with active broker connections
  const connectedUsers = await userBrokerRegistry.getConnectedUsers();
  
  console.log(`[StrategyService] Found ${connectedUsers.length} users with active connections`);
  
  for (const { userId, broker, environment } of connectedUsers) {
    // 2. Get active strategies for this user
    const result = await pool.query(
      `SELECT * FROM user_strategies
       WHERE user_id = $1 AND status = 'active' AND auto_reconnect = true`,
      [userId]
    );
    
    console.log(`[StrategyService] User ${userId}: ${result.rows.length} strategies to resume`);
    
    // 3. Resume each strategy
    for (const strategy of result.rows) {
      try {
        const client = await userBrokerRegistry.getClient(userId, broker, environment);
        
        if (!client) {
          console.warn(`[StrategyService] User ${userId}: No active client, skipping resume`);
          continue;
        }
        
        // Create executor
        const executor = this.createExecutor(strategy.strategy_name, strategy.config, client);
        
        const executorKey = `${userId}:${strategy.strategy_name}:${strategy.instrument}`;
        this.strategyExecutors.set(executorKey, executor);
        
        // Start execution loop
        await this.runStrategy(userId, strategy.strategy_name, strategy.instrument, executor);
        
        console.log(`[StrategyService] ✅ Resumed: ${executorKey}`);
      } catch (error) {
        console.error(`[StrategyService] ❌ Failed to resume strategy for user ${userId}:`, error);
        
        // Mark as error in database
        await pool.query(
          `UPDATE user_strategies
           SET status = 'error', error_message = $1, updated_at = NOW()
           WHERE id = $2`,
          [(error as Error).message, strategy.id]
        );
      }
    }
  }
  
  console.log('[StrategyService] ✅ Auto-resume complete');
}
```

---

### 🔷 FASE 3: Backend - API Endpoints Update (1 week)

**DOEL:** Add authenticateRequest to strategy endpoints, extract userId

#### 3.1 Update Strategy Start Endpoint

**File:** `backend/src/server.ts`

**BEFORE:**
```typescript
server.post<{ Body: StartStrategyRequest }>('/api/strategy/start', async (request) => {
  return await strategyService.startStrategy(request.body);
});
```

**AFTER:**
```typescript
server.post<{ Body: Omit<StartStrategyRequest, 'userId'> }>(
  '/api/strategy/start',
  { preHandler: authenticateRequest },  // 🆕 ADD AUTH
  async (request) => {
    const userId = request.user!.userId;  // 🆕 EXTRACT FROM JWT
    
    const requestWithUser: StartStrategyRequest = {
      ...request.body,
      userId,  // 🆕 ADD USER CONTEXT
    };
    
    return await strategyService.startStrategy(requestWithUser);
  }
);
```

#### 3.2 Update Strategy Stop Endpoint

**File:** `backend/src/server.ts`

**BEFORE:**
```typescript
server.post<{ Body: StopStrategyRequest }>('/api/strategy/stop', async (request) => {
  return await strategyService.stopStrategy(request.body);
});
```

**AFTER:**
```typescript
server.post<{ Body: Pick<StopStrategyRequest, 'strategyId'> }>(
  '/api/strategy/stop',
  { preHandler: authenticateRequest },  // 🆕 ADD AUTH
  async (request) => {
    const userId = request.user!.userId;  // 🆕 EXTRACT FROM JWT
    
    const requestWithUser: StopStrategyRequest = {
      strategyId: request.body.strategyId,
      userId,  // 🆕 ADD USER CONTEXT
    };
    
    return await strategyService.stopStrategy(requestWithUser);
  }
);
```

#### 3.3 Update Strategy Status Endpoint

**File:** `backend/src/server.ts`

**BEFORE:**
```typescript
server.get('/api/strategy/status', async (request) => {
  const { strategyId } = request.query as { strategyId?: string };
  return await strategyService.getStrategyStatus(strategyId);
});
```

**AFTER:**
```typescript
server.get(
  '/api/strategy/status',
  { preHandler: authenticateRequest },  // 🆕 ADD AUTH
  async (request) => {
    const userId = request.user!.userId;  // 🆕 EXTRACT FROM JWT
    const { strategyId } = request.query as { strategyId?: string };
    
    return await strategyService.getStrategyStatus(userId, strategyId);  // 🆕 PASS USER ID
  }
);
```

#### 3.4 Update Connect Endpoint (Use Per-User Registry)

**File:** `backend/src/server.ts`

**CURRENT (uses old credentialsManager):**
```typescript
server.post('/api/v2/connect', { preHandler: authenticateRequest }, async (request, reply) => {
  const { environment, broker } = request.body as { environment: 'testnet' | 'live'; broker?: string };
  const userId = request.user!.userId;
  const usedBroker = broker || 'deribit';
  
  // Connect via UserBrokerRegistry
  await userBrokerRegistry.connect(userId, usedBroker, environment);
  
  return { success: true, message: 'Connected successfully' };
});
```

**WHAT WE NEED:** Ensure credentials zijn EERST opgeslagen via `/api/user/credentials` VOORDAT connect wordt aangeroepen.

**UPDATED FLOW:**
```typescript
server.post('/api/v2/connect', { preHandler: authenticateRequest }, async (request, reply) => {
  try {
    const { environment, broker } = request.body as { environment: 'testnet' | 'live'; broker?: string };
    const userId = request.user!.userId;
    const usedBroker = broker || 'deribit';
    
    // 1. Check if user has credentials
    const hasCredentials = await userCredentialsService.hasCredentials(userId, usedBroker, environment);
    
    if (!hasCredentials) {
      return reply.code(400).send({
        success: false,
        error: 'No credentials found. Please save your API credentials first via /api/user/credentials',
      });
    }
    
    // 2. Connect via UserBrokerRegistry (loads credentials automatically)
    await userBrokerRegistry.connect(userId, usedBroker, environment);
    
    request.log.info({ userId, broker: usedBroker, environment }, 'User connected successfully');
    
    return {
      success: true,
      message: 'Connected successfully',
    };
  } catch (error: any) {
    request.log.error({ err: error }, 'Connection failed');
    return reply.code(500).send({
      success: false,
      error: error.message || 'Connection failed',
    });
  }
});
```

---

### 🔷 FASE 4: Backend - Trade History Per-User (1 week)

**DOEL:** Isolate trade history per user

#### 4.1 Update TradeHistoryService

**File:** `backend/src/services/trade-history.ts`

**Add userId parameter to all methods:**

```typescript
export class TradeHistoryService {
  /**
   * Record trade entry (with userId)
   */
  async recordEntry(
    userId: string,  // 🆕 ADD THIS
    strategyName: string,
    instrument: string,
    side: 'buy' | 'sell',
    entryPrice: number,
    amount: number,
    orderId: string,
    slOrderId?: string,
    tpOrderId?: string
  ): Promise<void> {
    const query = `
      INSERT INTO trades (
        user_id, strategy_name, instrument, side, entry_price, amount,
        order_id, sl_order_id, tp_order_id, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', NOW())
    `;
    
    await this.db.run(query, [
      userId,  // 🆕 USER ID FIRST
      strategyName,
      instrument,
      side,
      entryPrice,
      amount,
      orderId,
      slOrderId || null,
      tpOrderId || null,
    ]);
  }
  
  /**
   * Get open trade for user + strategy + instrument
   */
  async getOpenTrade(
    userId: string,  // 🆕 ADD THIS
    strategyName: string,
    instrument: string
  ): Promise<Trade | null> {
    const query = `
      SELECT * FROM trades
      WHERE user_id = $1 AND strategy_name = $2 AND instrument = $3 AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const row = await this.db.get(query, [userId, strategyName, instrument]);
    return row || null;
  }
  
  /**
   * Record trade exit (with userId verification)
   */
  async recordExit(
    userId: string,  // 🆕 ADD THIS
    orderId: string,
    exitPrice: number,
    exitReason: 'tp' | 'sl' | 'manual',
    pnl: number
  ): Promise<void> {
    const query = `
      UPDATE trades
      SET status = 'closed',
          exit_price = $1,
          exit_reason = $2,
          pnl = $3,
          exit_at = NOW()
      WHERE user_id = $4 AND order_id = $5 AND status = 'open'
    `;
    
    await this.db.run(query, [exitPrice, exitReason, pnl, userId, orderId]);
  }
  
  /**
   * Get trade history for user (paginated)
   */
  async getTradeHistory(
    userId: string,  // 🆕 ADD THIS
    limit: number = 50,
    offset: number = 0
  ): Promise<Trade[]> {
    const query = `
      SELECT * FROM trades
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    return await this.db.all(query, [userId, limit, offset]);
  }
}
```

#### 4.2 Update Strategy Executors

**File:** `backend/src/strategies/razor-executor.ts`

Update all `tradeHistory.recordEntry()` calls to include userId:

```typescript
// BEFORE:
await tradeHistory.recordEntry(
  this.strategyName,
  this.instrument,
  'buy',
  entryPrice,
  amount,
  orderId,
  slOrderId,
  tpOrderId
);

// AFTER:
await tradeHistory.recordEntry(
  this.userId,  // 🆕 ADD USER ID
  this.strategyName,
  this.instrument,
  'buy',
  entryPrice,
  amount,
  orderId,
  slOrderId,
  tpOrderId
);
```

**Executor Constructor Update:**

```typescript
export class RazorExecutor {
  private userId: string;  // 🆕 ADD THIS
  
  constructor(
    userId: string,  // 🆕 ADD PARAMETER
    config: RazorConfig,
    client: BackendDeribitClient,
    strategyName: string = 'Razor'
  ) {
    this.userId = userId;  // 🆕 STORE USER ID
    // ... rest of constructor
  }
}
```

---

### 🔷 FASE 5: Frontend - Wire Settings Dialog (1 week)

**DOEL:** Settings Dialog roept /api/user/credentials aan

#### 5.1 Add Backend Client Methods

**File:** `src/lib/backend-client.ts`

```typescript
/**
 * Save user credentials (encrypted server-side)
 */
export async function saveUserCredentials(
  broker: string,
  environment: 'live' | 'testnet',
  apiKey: string,
  apiSecret: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const token = localStorage.getItem('token');
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${BACKEND_URL}/api/user/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      broker,
      environment,
      apiKey,
      apiSecret,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save credentials');
  }
  
  return await response.json();
}

/**
 * Check if user has credentials saved
 */
export async function getUserCredentialsStatus(
  broker: string,
  environment: 'live' | 'testnet'
): Promise<{ success: boolean; hasCredentials: boolean; lastUsed?: string }> {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return { success: false, hasCredentials: false };
  }
  
  const response = await fetch(
    `${BACKEND_URL}/api/user/credentials/status?broker=${broker}&environment=${environment}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );
  
  if (!response.ok) {
    return { success: false, hasCredentials: false };
  }
  
  return await response.json();
}

/**
 * Delete user credentials
 */
export async function deleteUserCredentials(
  broker: string,
  environment: 'live' | 'testnet'
): Promise<{ success: boolean; message?: string }> {
  const token = localStorage.getItem('token');
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(
    `${BACKEND_URL}/api/user/credentials?broker=${broker}&environment=${environment}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete credentials');
  }
  
  return await response.json();
}
```

#### 5.2 Update SettingsDialog Connect Flow

**File:** `src/components/dialogs/SettingsDialog.tsx`

**BEFORE:**
```typescript
const handleConnect = async () => {
  setIsConnecting(true);
  try {
    await connect({ apiKey, apiSecret });
    // ...
  } catch (error) {
    // ...
  } finally {
    setIsConnecting(false);
  }
};
```

**AFTER:**
```typescript
import { saveUserCredentials, getUserCredentialsStatus } from '@/lib/backend-client';

const handleConnect = async () => {
  if (!apiKey || !apiSecret) {
    toast.error('Voer API key en secret in');
    return;
  }
  
  setIsConnecting(true);
  
  try {
    // STEP 1: Save credentials to backend (encrypted)
    console.log('[Settings] Saving credentials to backend...');
    await saveUserCredentials('deribit', environment, apiKey, apiSecret);
    console.log('[Settings] ✅ Credentials saved');
    
    // STEP 2: Connect via backend (uses saved credentials)
    console.log('[Settings] Connecting to broker...');
    await connect({ apiKey, apiSecret });  // This will call /api/v2/connect
    console.log('[Settings] ✅ Connected successfully');
    
    toast.success('Verbonden met Deribit!');
    
    // Clear sensitive data from UI state
    setApiKey('');
    setApiSecret('');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Verbinding mislukt';
    toast.error(errorMessage);
  } finally {
    setIsConnecting(false);
  }
};
```

#### 5.3 Load Credentials Status on Dialog Open

**File:** `src/components/dialogs/SettingsDialog.tsx`

```typescript
// Add useEffect to check credentials status when dialog opens
useEffect(() => {
  if (!open) return;
  
  const checkCredentials = async () => {
    try {
      const status = await getUserCredentialsStatus('deribit', environment);
      
      if (status.hasCredentials) {
        setCredentialsSource('backend');
        console.log('[Settings] User has credentials saved on backend');
        
        // Optionally show last used timestamp
        if (status.lastUsed) {
          console.log('[Settings] Last used:', new Date(status.lastUsed).toLocaleString());
        }
      } else {
        setCredentialsSource('none');
        console.log('[Settings] No credentials found on backend');
      }
    } catch (error) {
      console.error('[Settings] Failed to check credentials status:', error);
    }
  };
  
  checkCredentials();
}, [open, environment]);
```

#### 5.4 Add Credentials Status Indicator

**File:** `src/components/dialogs/SettingsDialog.tsx`

```tsx
{credentialsSource === 'backend' && (
  <Alert className="bg-green-500/10 border-green-500/30 rounded-xl py-3">
    <AlertDescription className="text-xs flex items-center gap-2">
      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
      <span>
        Credentials opgeslagen op server (encrypted met AES-256-GCM)
      </span>
    </AlertDescription>
  </Alert>
)}

{credentialsSource === 'none' && !isConnected && (
  <Alert className="bg-orange-500/10 border-orange-500/30 rounded-xl py-3">
    <AlertDescription className="text-xs flex items-center gap-2">
      <WarningCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
      <span>
        Nog geen credentials opgeslagen. Voer je API credentials in en verbind.
      </span>
    </AlertDescription>
  </Alert>
)}
```

---

### 🔷 FASE 6: Testing & Validation (1 week)

**DOEL:** Test complete multi-user workflow end-to-end

#### 6.1 Multi-User Isolation Test

**File:** `backend/tests/multi-user-isolation.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';

describe('Multi-User Isolation', () => {
  let userAToken: string;
  let userBToken: string;
  
  beforeAll(async () => {
    // Create 2 test users
    userAToken = await createTestUser('userA@test.com', 'password123456');
    userBToken = await createTestUser('userB@test.com', 'password123456');
  });
  
  it('should isolate credentials between users', async () => {
    // User A saves credentials
    await saveCredentials(userAToken, 'deribit', 'testnet', 'keyA', 'secretA');
    
    // User B saves different credentials
    await saveCredentials(userBToken, 'deribit', 'testnet', 'keyB', 'secretB');
    
    // User A connects
    const responseA = await connectBroker(userAToken, 'testnet');
    expect(responseA.success).toBe(true);
    
    // User B connects
    const responseB = await connectBroker(userBToken, 'testnet');
    expect(responseB.success).toBe(true);
    
    // Verify isolation: User A cannot see User B's credentials
    const statusA = await getCredentialsStatus(userAToken, 'deribit', 'testnet');
    const statusB = await getCredentialsStatus(userBToken, 'deribit', 'testnet');
    
    expect(statusA.hasCredentials).toBe(true);
    expect(statusB.hasCredentials).toBe(true);
    // Both have credentials but they are different (verified by connection success)
  });
  
  it('should isolate strategies between users', async () => {
    // User A starts Razor strategy
    const strategyA = await startStrategy(userAToken, {
      strategyName: 'Razor',
      instrument: 'BTC_USDC-PERPETUAL',
      environment: 'testnet',
      config: {},
    });
    expect(strategyA.success).toBe(true);
    
    // User B starts Thor strategy
    const strategyB = await startStrategy(userBToken, {
      strategyName: 'Thor',
      instrument: 'ETH_USDC-PERPETUAL',
      environment: 'testnet',
      config: {},
    });
    expect(strategyB.success).toBe(true);
    
    // User A should only see their own strategy
    const statusA = await getStrategyStatus(userAToken);
    expect(statusA.length).toBe(1);
    expect(statusA[0].strategy_name).toBe('Razor');
    
    // User B should only see their own strategy
    const statusB = await getStrategyStatus(userBToken);
    expect(statusB.length).toBe(1);
    expect(statusB[0].strategy_name).toBe('Thor');
  });
  
  it('should isolate trade history between users', async () => {
    // Simulate trades for both users
    // (Implementation depends on test setup)
    
    // User A should only see their trades
    const tradesA = await getTradeHistory(userAToken);
    expect(tradesA.every(t => t.user_id === userAId)).toBe(true);
    
    // User B should only see their trades
    const tradesB = await getTradeHistory(userBToken);
    expect(tradesB.every(t => t.user_id === userBId)).toBe(true);
  });
});
```

#### 6.2 Auto-Resume Multi-User Test

**File:** `backend/tests/auto-resume-multi-user.test.ts`

```typescript
describe('Auto-Resume Per-User', () => {
  it('should resume only active strategies on backend restart', async () => {
    // Setup: User A has active strategy, User B stopped their strategy
    const userAToken = await createTestUser('userA@test.com', 'password123456');
    const userBToken = await createTestUser('userB@test.com', 'password123456');
    
    // Both users connect
    await saveCredentials(userAToken, 'deribit', 'testnet', 'keyA', 'secretA');
    await connectBroker(userAToken, 'testnet');
    
    await saveCredentials(userBToken, 'deribit', 'testnet', 'keyB', 'secretB');
    await connectBroker(userBToken, 'testnet');
    
    // Both start strategies
    await startStrategy(userAToken, { strategyName: 'Razor', instrument: 'BTC_USDC-PERPETUAL' });
    await startStrategy(userBToken, { strategyName: 'Thor', instrument: 'ETH_USDC-PERPETUAL' });
    
    // User B stops their strategy
    await stopStrategy(userBToken, strategyBId);
    
    // Simulate backend restart
    await restartBackend();
    
    // Verify: User A strategy resumed, User B strategy stayed stopped
    const statusA = await getStrategyStatus(userAToken);
    expect(statusA[0].status).toBe('active');
    
    const statusB = await getStrategyStatus(userBToken);
    expect(statusB[0].status).toBe('stopped');
  });
});
```

---

### 🔷 FASE 7: Documentation & Rollout (1 week)

**DOEL:** Document everything, deploy safely

#### 7.1 Update MASTER.md

Add sections:
- Multi-User Architecture Overview
- Per-User Credential Flow
- Per-User Strategy Isolation
- Per-User Trade History
- Auto-Resume Per-User
- Manual Disconnect Per-User
- Testing Multi-User Features

#### 7.2 Create MULTI_USER_GUIDE.md

User-facing documentation:
- How to save credentials
- How credentials are encrypted
- How to connect/disconnect
- How strategy isolation works
- How trade history works
- Troubleshooting

#### 7.3 Deployment Plan

**Stage 1: Database Migration (NO DOWNTIME)**
```bash
# Run migrations (backward compatible)
cd /root/Tradebaas-1/backend
npm run migrate

# Verify schema
psql -U tradebaas -d tradebaas -c "\d user_strategies"
psql -U tradebaas -d tradebaas -c "\d trades"

# Run data migration
npm run migrate:data
```

**Stage 2: Backend Deployment**
```bash
# Build backend
cd /root/Tradebaas-1/backend
npm run build

# Restart backend (PM2)
pm2 restart backend

# Verify logs
pm2 logs backend --lines 100
```

**Stage 3: Frontend Deployment**
```bash
# Build frontend
cd /root/Tradebaas-1
npm run build

# Restart frontend (PM2)
pm2 restart frontend

# Verify logs
pm2 logs frontend --lines 100
```

**Stage 4: Smoke Testing**
```bash
# Test credential save
curl -X POST https://app.tradebazen.nl/api/user/credentials \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"broker":"deribit","environment":"testnet","apiKey":"test","apiSecret":"test"}'

# Test credential status
curl https://app.tradebazen.nl/api/user/credentials/status?broker=deribit&environment=testnet \
  -H "Authorization: Bearer $TOKEN"

# Test strategy start (authenticated)
curl -X POST https://app.tradebazen.nl/api/strategy/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"strategyName":"Razor","instrument":"BTC_USDC-PERPETUAL","environment":"testnet"}'
```

---

## Risk Mitigation

### Breaking Changes

1. **Strategy Endpoints Require Auth**
   - OLD: `/api/strategy/start` (no auth)
   - NEW: `/api/strategy/start` (requires JWT)
   - MIGRATION: Frontend already uses JWT for auth endpoints, extend to strategy endpoints

2. **strategyId Format Changed**
   - OLD: `strategy-123456`
   - NEW: `userId:strategyName:instrument`
   - MIGRATION: Update frontend to handle new format

3. **Trade History Requires user_id**
   - OLD: `SELECT * FROM trades WHERE strategy_name = ?`
   - NEW: `SELECT * FROM trades WHERE user_id = ? AND strategy_name = ?`
   - MIGRATION: Run data migration script to assign existing trades to admin user

### Rollback Plan

If deployment fails:

1. **Database Rollback:**
   ```bash
   cd /root/Tradebaas-1/backend
   npm run migrate:rollback
   ```

2. **Code Rollback:**
   ```bash
   git reset --hard <previous-commit>
   pm2 restart all
   ```

3. **Data Restoration:**
   ```bash
   # Restore from PostgreSQL backup
   pg_restore -U tradebaas -d tradebaas /path/to/backup
   ```

---

## Success Criteria

### ✅ Definition of Done

- [ ] Multiple users kunnen simultaneously inloggen
- [ ] Elke user kan eigen credentials opslaan (encrypted)
- [ ] Elke user kan onafhankelijk broker verbinden/verbreken
- [ ] Elke user kan eigen strategies starten/stoppen
- [ ] Strategies blijven 24/7 actief tot manual stop
- [ ] Auto-resume werkt per-user (alleen active strategies)
- [ ] Manual disconnect flag blijft persistent per-user
- [ ] Trade history is volledig geïsoleerd per-user
- [ ] Orphan cleanup werkt per-user context
- [ ] WebSocket updates zijn per-user gefilterd
- [ ] Backend restart: auto-resume voor elke user individueel
- [ ] User logout: credentials/strategies/trades blijven persistent
- [ ] Alle tests slagen (unit + integration + multi-user)
- [ ] Performance: 10+ concurrent users zonder degradation
- [ ] Security audit: no credential leakage between users
- [ ] Documentation: volledig en up-to-date

---

## Timeline

| Week | Phase | Focus |
|------|-------|-------|
| 1 | Fase 0 | Preparation, Analysis, Planning |
| 2 | Fase 1 | Database Schema, Migrations |
| 3-4 | Fase 2 | StrategyService Refactor |
| 5 | Fase 3 | API Endpoints Update |
| 6 | Fase 4 | Trade History Per-User |
| 7 | Fase 5 | Frontend Integration |
| 8 | Fase 6 | Testing & Validation |
| 9 | Fase 7 | Documentation & Rollout |

**Total: 9 weeks (6-7 weken met overlap)**

---

## Conclusion

Dit is een **complete, professionele transformatie** van single-user naar multi-tenant SaaS.

**Wat dit plan anders maakt:**
- ✅ **Geen tech debt:** Clean architecture, geen shortcuts
- ✅ **Backward compatible:** Database migrations safe
- ✅ **Staged rollout:** Test thoroughly before production
- ✅ **Complete isolation:** Credentials, broker clients, strategies, trades
- ✅ **Security first:** AES-256-GCM encryption, JWT auth, SQL injection prevention
- ✅ **Performance:** Indexed queries, efficient data structures
- ✅ **Testable:** Comprehensive test suite (unit + integration + multi-user)
- ✅ **Documented:** User guide, API docs, architecture docs

**Dit is production-ready work, geen prototype.**

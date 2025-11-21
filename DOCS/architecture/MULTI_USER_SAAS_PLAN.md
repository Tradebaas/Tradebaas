# Multi-User SaaS Implementation Plan
**Tradebaas - Van Single-User naar Multi-Tenant Platform**

> **📋 STATUS:** Planning Document - NOT YET IMPLEMENTED
> 
> **🎯 DOEL:** Complete roadmap voor transformatie naar multi-user SaaS platform
> 
> **⏱️ GESCHATTE TIJD:** 3-4 weken fulltime (6-8 weken part-time)
> 
> **📅 CREATED:** 21 november 2025

---

## 1. Executive Summary

### 1.1 Huidige Situatie
- ✅ Single-user platform draait 24/7 op VPS
- ✅ Credentials in `backend/.env` (1 gebruiker)
- ✅ State in `state/backend-state.json`
- ✅ Manual connect/disconnect logica werkend
- ✅ Auto-resume na restart (als verbinding actief was)

### 1.2 Gewenste Situatie
- 🎯 Multiple users met eigen accounts
- 🎯 Per-user credential storage (encrypted)
- 🎯 Per-user broker connections (isolated)
- 🎯 Per-user strategy state
- 🎯 Persistent login sessions
- 🎯 **KRITISCH:** Manual connect requirement blijft gehandhaafd
  - **Regel:** ALS gebruiker handmatig disconnect → MOET handmatig reconnect
  - **Geen auto-connect** na manual disconnect (ook niet bij backend restart)

### 1.3 Architectuur Veranderingen
```
VOOR (Single User):
Frontend → Backend → Deribit (global credentials)
            └─ state/backend-state.json

NA (Multi User):
Frontend (per user) → Auth Layer (JWT) → Backend (per-user isolation)
                                           ├─ User 1 → Deribit Client 1
                                           ├─ User 2 → Deribit Client 2
                                           └─ User N → Deribit Client N
                                           └─ PostgreSQL (users, credentials, sessions, strategies)
```

---

## 2. Database Design

### 2.1 Schema Overview

**Technology Choice:** PostgreSQL
- Betere concurrency dan SQLite
- ACID transacties voor multi-user
- Production-ready scaling
- Betere migrations support

### 2.2 Tables

#### `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt/argon2
  full_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  
  -- Indexes
  INDEX idx_users_email (email),
  INDEX idx_users_active (is_active)
);
```

#### `user_credentials`
```sql
CREATE TABLE user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker VARCHAR(50) NOT NULL,  -- 'deribit', 'binance', etc.
  environment VARCHAR(20) NOT NULL,  -- 'live' or 'testnet'
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  encryption_salt VARCHAR(255) NOT NULL,  -- Per-user salt
  created_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  
  -- Constraints
  UNIQUE (user_id, broker, environment),
  
  -- Indexes
  INDEX idx_creds_user (user_id),
  INDEX idx_creds_broker (broker)
);
```

#### `user_sessions`
```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,  -- Hashed JWT for revocation
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(45),  -- IPv4/IPv6
  user_agent TEXT,
  last_activity TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  
  -- Indexes
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_token (token_hash),
  INDEX idx_sessions_expires (expires_at),
  INDEX idx_sessions_active (is_active)
);
```

#### `user_strategies`
```sql
CREATE TABLE user_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_name VARCHAR(100) NOT NULL,
  instrument VARCHAR(100) NOT NULL,
  broker VARCHAR(50) NOT NULL,
  environment VARCHAR(20) NOT NULL,
  config JSONB NOT NULL,  -- Strategy-specific config
  status VARCHAR(50) NOT NULL,  -- 'active', 'stopped', 'paused', 'error'
  
  -- KRITIEK voor manual connect requirement
  last_action VARCHAR(50),  -- 'manual_connect', 'manual_disconnect', 'auto_resume'
  auto_reconnect BOOLEAN DEFAULT true,  -- FALSE bij manual disconnect
  
  connected_at TIMESTAMP,
  disconnected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_strategies_user (user_id),
  INDEX idx_strategies_status (status),
  INDEX idx_strategies_auto_reconnect (auto_reconnect)
);
```

#### `trades` (extended voor multi-user)
```sql
-- Extend bestaande trades table
ALTER TABLE trades ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX idx_trades_user ON trades(user_id);

-- Nu kunnen we per-user trade history filteren
```

### 2.3 Encryption Strategy

**Credential Encryption:**
```typescript
// Per-user encryption met unique salt
interface EncryptedCredential {
  encrypted: string;      // AES-256-GCM encrypted data
  salt: string;           // Unique per user
  iv: string;             // Initialization vector
}

// Master key in .env (NEVER commit)
const MASTER_ENCRYPTION_KEY = process.env.ENCRYPTION_MASTER_KEY;

// Per-user key derivation
function deriveUserKey(userId: string, salt: string): Buffer {
  return pbkdf2Sync(
    MASTER_ENCRYPTION_KEY,
    `${userId}:${salt}`,
    100000,  // iterations
    32,      // key length
    'sha256'
  );
}
```

**Password Hashing:**
```typescript
import argon2 from 'argon2';

// Argon2id (winner of Password Hashing Competition)
async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,
    parallelism: 4
  });
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return await argon2.verify(hash, password);
}
```

---

## 3. Authentication & Authorization

### 3.1 JWT Implementation

**Token Structure:**
```typescript
interface JWTPayload {
  userId: string;
  email: string;
  sessionId: string;
  iat: number;  // issued at
  exp: number;  // expires at
}

// JWT secret in .env
const JWT_SECRET = process.env.JWT_SECRET;  // 64+ character random string

// Token lifespan
const ACCESS_TOKEN_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY = '7d';
```

**Token Generation:**
```typescript
import jwt from 'jsonwebtoken';

function generateAccessToken(user: User, sessionId: string): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      sessionId
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}
```

### 3.2 Authentication Endpoints

**POST /auth/register**
```typescript
interface RegisterRequest {
  email: string;
  password: string;  // Min 12 chars, must contain upper/lower/number/special
  fullName?: string;
}

interface RegisterResponse {
  success: boolean;
  userId: string;
  message: string;
}

// Validatie:
// - Email format (RFC 5322)
// - Password strength (zxcvbn score >= 3)
// - Email niet al in gebruik
// - Rate limiting: 5 registrations per IP per hour
```

**POST /auth/login**
```typescript
interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

// Validatie:
// - Credentials check (constant-time comparison)
// - Create session record
// - Rate limiting: 10 attempts per IP per hour
// - Account lockout: 5 failed attempts = 15 min lockout
```

**POST /auth/logout**
```typescript
interface LogoutRequest {
  // Token in Authorization header
}

// Actions:
// 1. Invalidate session in database
// 2. Add token to blacklist (Redis with TTL)
// 3. Clear user's active connections
```

**POST /auth/refresh**
```typescript
interface RefreshRequest {
  refreshToken: string;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// Validatie:
// - Verify refresh token
// - Check session still active
// - Issue new access token
// - Rotate refresh token (security best practice)
```

### 3.3 Middleware

**Authentication Middleware:**
```typescript
// backend/src/middleware/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      sessionId: string;
    };
  }
}

async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Verify JWT
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    
    // Check session still active
    const session = await db.query(
      'SELECT * FROM user_sessions WHERE id = $1 AND is_active = true',
      [payload.sessionId]
    );
    
    if (session.rows.length === 0) {
      return reply.code(401).send({ error: 'Session expired' });
    }
    
    // Update last activity
    await db.query(
      'UPDATE user_sessions SET last_activity = NOW() WHERE id = $1',
      [payload.sessionId]
    );
    
    // Attach user to request
    request.user = {
      userId: payload.userId,
      email: payload.email,
      sessionId: payload.sessionId
    };
    
  } catch (error) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}
```

**Usage:**
```typescript
// Protect route
server.get('/api/protected-endpoint', {
  preHandler: authenticateRequest
}, async (request, reply) => {
  const userId = request.user!.userId;
  // ... handle request
});
```

---

## 4. Per-User Credential Management

### 4.1 Credential Storage Service

**File:** `backend/src/services/user-credentials-service.ts`

```typescript
export class UserCredentialsService {
  private db: Pool;  // PostgreSQL connection pool
  
  async saveCredentials(
    userId: string,
    broker: string,
    environment: string,
    apiKey: string,
    apiSecret: string
  ): Promise<void> {
    // Generate unique salt
    const salt = randomBytes(32).toString('hex');
    
    // Derive user-specific encryption key
    const userKey = deriveUserKey(userId, salt);
    
    // Encrypt credentials
    const encryptedKey = await encryptData(apiKey, userKey);
    const encryptedSecret = await encryptData(apiSecret, userKey);
    
    // Store in database
    await this.db.query(`
      INSERT INTO user_credentials (
        user_id, broker, environment,
        api_key_encrypted, api_secret_encrypted, encryption_salt
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, broker, environment)
      DO UPDATE SET
        api_key_encrypted = $4,
        api_secret_encrypted = $5,
        encryption_salt = $6,
        last_used = NOW()
    `, [userId, broker, environment, encryptedKey, encryptedSecret, salt]);
  }
  
  async loadCredentials(
    userId: string,
    broker: string,
    environment: string
  ): Promise<{ apiKey: string; apiSecret: string } | null> {
    const result = await this.db.query(`
      SELECT api_key_encrypted, api_secret_encrypted, encryption_salt
      FROM user_credentials
      WHERE user_id = $1 AND broker = $2 AND environment = $3 AND is_active = true
    `, [userId, broker, environment]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const { api_key_encrypted, api_secret_encrypted, encryption_salt } = result.rows[0];
    
    // Derive user key
    const userKey = deriveUserKey(userId, encryption_salt);
    
    // Decrypt
    const apiKey = await decryptData(api_key_encrypted, userKey);
    const apiSecret = await decryptData(api_secret_encrypted, userKey);
    
    return { apiKey, apiSecret };
  }
}
```

### 4.2 Credential API Endpoints

**POST /api/credentials/save**
```typescript
interface SaveCredentialsRequest {
  broker: string;
  environment: 'live' | 'testnet';
  apiKey: string;
  apiSecret: string;
}

// Handler (authenticated)
server.post('/api/credentials/save', {
  preHandler: authenticateRequest
}, async (request, reply) => {
  const userId = request.user!.userId;
  const { broker, environment, apiKey, apiSecret } = request.body as SaveCredentialsRequest;
  
  // Validate
  if (!apiKey || !apiSecret) {
    return reply.code(400).send({ error: 'API key and secret required' });
  }
  
  // Save encrypted
  await credentialsService.saveCredentials(
    userId, broker, environment, apiKey, apiSecret
  );
  
  return { success: true };
});
```

**GET /api/credentials/load**
```typescript
interface LoadCredentialsRequest {
  broker: string;
  environment: 'live' | 'testnet';
}

server.get('/api/credentials/load', {
  preHandler: authenticateRequest
}, async (request, reply) => {
  const userId = request.user!.userId;
  const { broker, environment } = request.query as LoadCredentialsRequest;
  
  const credentials = await credentialsService.loadCredentials(
    userId, broker, environment
  );
  
  if (!credentials) {
    return reply.code(404).send({ error: 'Credentials not found' });
  }
  
  // NEVER send credentials to frontend
  // Only indicate they exist
  return {
    exists: true,
    broker,
    environment
  };
});
```

---

## 5. Per-User Broker Isolation

### 5.1 Broker Registry Refactor

**Current (Single User):**
```typescript
// Global singleton
const deribitClient = new BackendDeribitClient(credentials);
```

**New (Multi-User):**
```typescript
// backend/src/brokers/UserBrokerRegistry.ts
export class UserBrokerRegistry {
  private clients: Map<string, Map<string, BackendDeribitClient>>;
  // Key structure: Map<userId, Map<broker, client>>
  
  async getClientForUser(
    userId: string,
    broker: string,
    environment: string
  ): Promise<BackendDeribitClient | null> {
    const userKey = `${userId}:${broker}:${environment}`;
    
    // Check if client exists
    if (this.clients.has(userKey)) {
      return this.clients.get(userKey)!;
    }
    
    // Load credentials
    const credentials = await credentialsService.loadCredentials(
      userId, broker, environment
    );
    
    if (!credentials) {
      return null;
    }
    
    // Create new client
    const client = new BackendDeribitClient({
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      environment
    });
    
    // Initialize connection
    await client.connect();
    
    // Store in registry
    this.clients.set(userKey, client);
    
    return client;
  }
  
  async disconnectUser(userId: string, broker: string, environment: string) {
    const userKey = `${userId}:${broker}:${environment}`;
    const client = this.clients.get(userKey);
    
    if (client) {
      await client.disconnect();
      this.clients.delete(userKey);
    }
  }
  
  async disconnectAllForUser(userId: string) {
    // Find all clients for this user
    const keysToRemove: string[] = [];
    
    for (const [key, client] of this.clients.entries()) {
      if (key.startsWith(`${userId}:`)) {
        await client.disconnect();
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => this.clients.delete(key));
  }
}

// Singleton instance
export const userBrokerRegistry = new UserBrokerRegistry();
```

### 5.2 Strategy Service Refactor

**Current:**
```typescript
async startStrategy(request: StartStrategyRequest) {
  const credentials = credentialsManager.load();  // Global
  const client = new BackendDeribitClient(credentials);
  // ...
}
```

**New:**
```typescript
async startStrategy(userId: string, request: StartStrategyRequest) {
  // Get user-specific client
  const client = await userBrokerRegistry.getClientForUser(
    userId,
    request.broker || 'deribit',
    request.environment
  );
  
  if (!client) {
    throw new Error('No credentials found. Please connect broker first.');
  }
  
  // Create strategy executor with user context
  const executor = new RazorExecutor(client, {
    userId,  // NEW: track which user owns this strategy
    ...request.config
  });
  
  // Store in per-user strategy map
  await strategyManager.startStrategyForUser(userId, executor);
}
```

---

## 6. Connection State Management (KRITIEK!)

### 6.1 Manual Disconnect Requirement

**Jouw Eis:**
> "ALS gebruiker handmatig disconnect → MOET handmatig reconnect"
> "GEEN auto-connect na manual disconnect (ook niet bij backend restart)"

**Implementatie:**

```typescript
// backend/src/services/user-connection-state.ts
interface UserConnectionState {
  userId: string;
  broker: string;
  environment: string;
  status: 'disconnected' | 'connected' | 'error';
  lastAction: 'manual_connect' | 'manual_disconnect' | 'auto_resume' | 'error';
  autoReconnect: boolean;  // KRITIEKE FLAG
  connectedAt?: Date;
  disconnectedAt?: Date;
  errorMessage?: string;
}

export class UserConnectionStateManager {
  
  async onManualConnect(userId: string, broker: string, environment: string) {
    // Update state
    await db.query(`
      UPDATE user_strategies
      SET 
        status = 'active',
        last_action = 'manual_connect',
        auto_reconnect = true,  -- ✅ ALLOW auto-reconnect
        connected_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1 AND broker = $2 AND environment = $3
    `, [userId, broker, environment]);
    
    log.info(`[User ${userId}] Manual connect to ${broker} (${environment})`);
  }
  
  async onManualDisconnect(userId: string, broker: string, environment: string) {
    // Update state
    await db.query(`
      UPDATE user_strategies
      SET 
        status = 'stopped',
        last_action = 'manual_disconnect',
        auto_reconnect = false,  -- ❌ DISABLE auto-reconnect
        disconnected_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1 AND broker = $2 AND environment = $3
    `, [userId, broker, environment]);
    
    // Disconnect broker client
    await userBrokerRegistry.disconnectUser(userId, broker, environment);
    
    log.info(`[User ${userId}] Manual disconnect from ${broker} - auto-reconnect DISABLED`);
  }
  
  async resumeOnBackendRestart() {
    // Get all strategies that SHOULD auto-resume
    const result = await db.query(`
      SELECT user_id, broker, environment, strategy_name
      FROM user_strategies
      WHERE 
        status = 'active'
        AND auto_reconnect = true  -- ✅ ONLY if not manually disconnected
        AND last_action != 'manual_disconnect'
    `);
    
    for (const row of result.rows) {
      try {
        log.info(`[User ${row.user_id}] Auto-resuming ${row.strategy_name}...`);
        
        // Reconnect broker
        const client = await userBrokerRegistry.getClientForUser(
          row.user_id, row.broker, row.environment
        );
        
        // Resume strategy
        await strategyService.startStrategy(row.user_id, {
          strategyName: row.strategy_name,
          broker: row.broker,
          environment: row.environment
        });
        
        // Update state
        await db.query(`
          UPDATE user_strategies
          SET last_action = 'auto_resume', updated_at = NOW()
          WHERE user_id = $1 AND strategy_name = $2
        `, [row.user_id, row.strategy_name]);
        
      } catch (error) {
        log.error(`[User ${row.user_id}] Failed to auto-resume:`, error);
      }
    }
  }
}
```

**Garantie:**
- ✅ Manual connect → auto_reconnect = TRUE → backend restart resumes
- ❌ Manual disconnect → auto_reconnect = FALSE → backend restart skips
- ✅ Backend crash met actieve connectie → auto-resume
- ❌ User stopt strategy handmatig → GEEN auto-resume

---

## 7. WebSocket Per-User Streams

### 7.1 WebSocket Authentication

**Current:**
```typescript
// No authentication, global stream
wss.on('connection', (ws) => {
  // Send analysis state to everyone
});
```

**New:**
```typescript
// backend/src/websocket/AuthenticatedWebSocket.ts
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  sessionId?: string;
}

export class AuthenticatedWebSocketServer {
  private wss: WebSocketServer;
  private userConnections: Map<string, Set<AuthenticatedWebSocket>>;
  
  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.userConnections = new Map();
    
    this.wss.on('connection', this.handleConnection.bind(this));
  }
  
  private async handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage) {
    // Extract token from URL query or header
    const token = this.extractToken(req);
    
    if (!token) {
      ws.close(1008, 'Authentication required');
      return;
    }
    
    try {
      // Verify JWT
      const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
      
      // Attach user info to socket
      ws.userId = payload.userId;
      ws.sessionId = payload.sessionId;
      
      // Add to user connections map
      if (!this.userConnections.has(payload.userId)) {
        this.userConnections.set(payload.userId, new Set());
      }
      this.userConnections.get(payload.userId)!.add(ws);
      
      log.info(`[WS] User ${payload.userId} connected`);
      
      // Handle disconnect
      ws.on('close', () => {
        this.handleDisconnect(ws);
      });
      
    } catch (error) {
      ws.close(1008, 'Invalid token');
    }
  }
  
  private extractToken(req: IncomingMessage): string | null {
    // From query: ws://host/ws?token=xxx
    const url = new URL(req.url!, `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }
  
  private handleDisconnect(ws: AuthenticatedWebSocket) {
    if (ws.userId) {
      const userSockets = this.userConnections.get(ws.userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          this.userConnections.delete(ws.userId);
        }
      }
      log.info(`[WS] User ${ws.userId} disconnected`);
    }
  }
  
  // Send message to specific user
  sendToUser(userId: string, message: any) {
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      const data = JSON.stringify(message);
      userSockets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    }
  }
  
  // Broadcast to all users (rare)
  broadcast(message: any) {
    const data = JSON.stringify(message);
    this.wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}
```

### 7.2 Analysis Updates Per User

```typescript
// In strategy executor
class RazorExecutor {
  private userId: string;
  
  private broadcastAnalysisState() {
    // Send ONLY to this user's connected clients
    authenticatedWss.sendToUser(this.userId, {
      type: 'analysis_update',
      strategyName: this.config.strategyName,
      state: this.analysisState,
      timestamp: Date.now()
    });
  }
}
```

---

## 8. Frontend Changes

### 8.1 New Components

**LoginPage.tsx**
```typescript
import { useState } from 'react';
import { useTradingStore } from '@/state/store';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const { login, register } = useTradingStore();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isRegistering) {
      await register(email, password);
    } else {
      await login(email, password);
    }
  };
  
  return (
    <div className="login-container">
      <form onSubmit={handleSubmit}>
        <input 
          type="email" 
          value={email} 
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input 
          type="password" 
          value={password} 
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          required
        />
        <button type="submit">
          {isRegistering ? 'Register' : 'Login'}
        </button>
        <button type="button" onClick={() => setIsRegistering(!isRegistering)}>
          {isRegistering ? 'Have an account? Login' : 'Need an account? Register'}
        </button>
      </form>
    </div>
  );
}
```

**ProtectedRoute.tsx**
```typescript
import { Navigate } from 'react-router-dom';
import { useTradingStore } from '@/state/store';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useTradingStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}
```

### 8.2 Store Updates

**src/state/store.ts**
```typescript
interface TradingStore {
  // ... existing fields
  
  // NEW: Auth state
  user: User | null;
  isAuthenticated: boolean;
  authToken: string | null;
  
  // NEW: Auth actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  
  // UPDATED: Credentials per user (server-side only now)
  saveUserCredentials: (broker: string, apiKey: string, apiSecret: string) => Promise<void>;
  hasCredentials: (broker: string) => Promise<boolean>;
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  // ... existing state
  
  user: null,
  isAuthenticated: false,
  authToken: localStorage.getItem('authToken'),
  
  login: async (email, password) => {
    const response = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      localStorage.setItem('authToken', data.accessToken);
      set({ 
        user: data.user,
        isAuthenticated: true,
        authToken: data.accessToken
      });
    }
  },
  
  logout: async () => {
    const token = get().authToken;
    
    await fetch(`${BACKEND_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    localStorage.removeItem('authToken');
    set({ 
      user: null,
      isAuthenticated: false,
      authToken: null
    });
  },
  
  saveUserCredentials: async (broker, apiKey, apiSecret) => {
    const token = get().authToken;
    
    await fetch(`${BACKEND_URL}/api/credentials/save`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        broker, 
        environment: 'live',
        apiKey, 
        apiSecret 
      })
    });
  }
}));
```

### 8.3 Settings Dialog Update

**SettingsDialog.tsx**
```typescript
export function SettingsDialog() {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const { saveUserCredentials } = useTradingStore();
  
  const handleSave = async () => {
    await saveUserCredentials('deribit', apiKey, apiSecret);
    toast.success('Credentials saved securely');
    setApiKey('');
    setApiSecret('');
  };
  
  return (
    <Dialog>
      <DialogContent>
        <h2>Broker Credentials</h2>
        <p>Enter your API credentials. They will be encrypted and stored securely on the server.</p>
        
        <Input
          type="text"
          placeholder="API Key"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
        />
        
        <Input
          type="password"
          placeholder="API Secret"
          value={apiSecret}
          onChange={e => setApiSecret(e.target.value)}
        />
        
        <Button onClick={handleSave}>
          Save Credentials
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 9. Implementation Phases

### FASE 1: Foundation (Week 1) - 5-7 dagen

**Goal:** Authentication infrastructure

**Tasks:**
1. ✅ PostgreSQL setup
   - Install PostgreSQL
   - Create database
   - Create user & grant permissions
2. ✅ Database schema
   - Create all tables (users, credentials, sessions, strategies)
   - Add indices
   - Setup migrations (e.g., node-pg-migrate)
3. ✅ Auth endpoints
   - POST /auth/register
   - POST /auth/login
   - POST /auth/logout
   - GET /auth/verify
4. ✅ JWT middleware
   - Token generation
   - Token verification
   - Request authentication
5. ✅ Frontend login
   - LoginPage component
   - ProtectedRoute component
   - Auth state in store
   - Token storage (localStorage)

**Deliverables:**
- PostgreSQL database running
- Users can register/login
- JWT tokens issued and verified
- Frontend shows login page
- Protected routes work

**Testing:**
- Register new user
- Login with credentials
- Access protected endpoint
- Logout and verify token invalid

---

### FASE 2: Credentials (Week 2) - 5-7 dagen

**Goal:** Per-user credential storage

**Tasks:**
1. ✅ Encryption service
   - Master key management
   - Per-user key derivation
   - AES-256-GCM encryption/decryption
2. ✅ UserCredentialsService
   - saveCredentials()
   - loadCredentials()
   - deleteCredentials()
3. ✅ Credential endpoints
   - POST /api/credentials/save
   - GET /api/credentials/load (metadata only)
   - DELETE /api/credentials/delete
4. ✅ Settings dialog update
   - Credential input form
   - Server-side save (no local storage)
   - Success/error feedback
5. ✅ Testing with 2 users
   - User A saves Deribit creds
   - User B saves Deribit creds
   - Verify isolation (A can't access B's creds)

**Deliverables:**
- Credentials stored encrypted in PostgreSQL
- Users can save/load credentials via UI
- Complete isolation between users
- No credentials in frontend storage

**Testing:**
- Save credentials for User A
- Save credentials for User B
- Verify database shows encrypted data
- Verify User A can't load User B's creds

---

### FASE 3: Broker Isolation (Week 3) - 7-10 dagen

**Goal:** Per-user broker clients & strategies

**Tasks:**
1. ✅ UserBrokerRegistry
   - Map of user → broker clients
   - getClientForUser()
   - disconnectUser()
   - Connection lifecycle management
2. ✅ Strategy service refactor
   - Accept userId parameter
   - Load user-specific credentials
   - Create user-specific broker client
   - Store in per-user strategy map
3. ✅ Strategy state per user
   - Update user_strategies table
   - Track last_action & auto_reconnect
   - Per-user state files or DB records
4. ✅ Connection state manager
   - onManualConnect()
   - onManualDisconnect()
   - resumeOnBackendRestart()
5. ✅ WebSocket per-user streams
   - AuthenticatedWebSocketServer
   - Token extraction from WS connection
   - sendToUser() method
   - Update strategy executors to send per-user
6. ✅ Frontend updates
   - Send auth token in WS connection
   - Update hooks to use authenticated endpoints
   - Handle per-user strategy status

**Deliverables:**
- Multiple users can connect simultaneously
- Each user has isolated broker connection
- Strategies run independently per user
- WebSocket streams are user-specific
- Manual disconnect requirement enforced

**Testing:**
- User A connects & starts strategy
- User B connects & starts strategy
- Verify both run independently
- User A disconnects manually
- Backend restarts
- Verify User A NOT auto-reconnected
- Verify User B auto-reconnected

---

### FASE 4: Polish & Production (Week 4) - 5-7 dagen

**Goal:** Production-ready multi-user platform

**Tasks:**
1. ✅ Security audit
   - Password policy enforcement
   - Rate limiting on all endpoints
   - SQL injection prevention (parameterized queries)
   - XSS prevention
   - CSRF tokens (if using cookies)
2. ✅ Performance testing
   - Load test with 10+ concurrent users
   - Database query optimization
   - Connection pool tuning
   - Memory leak checks
3. ✅ Error handling
   - Global error handler
   - User-friendly error messages
   - Logging all auth failures
   - Session timeout handling
4. ✅ Documentation
   - API documentation (OpenAPI/Swagger)
   - User guide for registration/login
   - Admin guide for database management
   - Update MASTER.md with multi-user architecture
5. ✅ Deployment updates
   - Update PM2 config for PostgreSQL
   - Database backup strategy
   - Migration rollback procedures
   - Health checks for database connection

**Deliverables:**
- Fully functional multi-user platform
- Security hardened
- Performance validated (10+ users)
- Complete documentation
- Production deployment ready

**Testing:**
- Full end-to-end test with 3+ users
- Penetration testing (basic)
- Load testing (concurrent strategies)
- Failover testing (database restart)
- Backup/restore testing

---

## 10. Migration Strategy

### 10.1 From Single-User to Multi-User

**Existing Data:**
- Credentials in `backend/.env`
- State in `state/backend-state.json`
- Trades in `state/trades.db`

**Migration Script:**
```typescript
// scripts/migrate-to-multi-user.ts
import { pool } from './db';

async function migrateExistingData() {
  // 1. Create admin user from existing credentials
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@tradebaas.local';
  const adminPassword = process.env.ADMIN_PASSWORD || generateSecurePassword();
  
  const adminUser = await createUser(adminEmail, adminPassword);
  console.log(`Admin user created: ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
  
  // 2. Migrate credentials
  const existingCreds = {
    apiKey: process.env.DERIBIT_API_KEY,
    apiSecret: process.env.DERIBIT_API_SECRET
  };
  
  if (existingCreds.apiKey && existingCreds.apiSecret) {
    await credentialsService.saveCredentials(
      adminUser.id,
      'deribit',
      'live',
      existingCreds.apiKey,
      existingCreds.apiSecret
    );
    console.log('Credentials migrated for admin user');
  }
  
  // 3. Migrate existing trades
  const trades = await getAllTradesFromSQLite();
  for (const trade of trades) {
    await pool.query(`
      UPDATE trades SET user_id = $1 WHERE id = $2
    `, [adminUser.id, trade.id]);
  }
  console.log(`Migrated ${trades.length} trades to admin user`);
  
  // 4. Create initial strategy state
  const existingState = await loadBackendState();
  if (existingState.strategies.length > 0) {
    for (const strategy of existingState.strategies) {
      await pool.query(`
        INSERT INTO user_strategies (
          user_id, strategy_name, instrument, broker, environment, config, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        adminUser.id,
        strategy.name,
        strategy.instrument,
        'deribit',
        strategy.environment,
        JSON.stringify(strategy.config),
        strategy.status
      ]);
    }
    console.log(`Migrated ${existingState.strategies.length} strategies`);
  }
  
  console.log('\n✅ Migration complete!');
  console.log('Next steps:');
  console.log('1. Save admin credentials securely');
  console.log('2. Test login with admin account');
  console.log('3. Verify all strategies still work');
  console.log('4. Create additional user accounts as needed');
}
```

### 10.2 Rollback Plan

**If migration fails:**
```bash
# 1. Stop backend
pm2 stop tradebaas-backend

# 2. Restore database backup
psql -U tradebaas -d tradebaas < backup_before_migration.sql

# 3. Restore state files
cp state/backend-state.json.backup state/backend-state.json

# 4. Restore .env
cp backend/.env.backup backend/.env

# 5. Restart backend (single-user mode)
pm2 start tradebaas-backend
```

---

## 11. Cost & Resource Considerations

### 11.1 Infrastructure

**Additional Requirements:**
- PostgreSQL: ~500MB RAM minimum (1GB recommended)
- Redis (optional, for session/token blacklist): ~100MB RAM
- Increased backend memory: +200MB per 10 concurrent users

**Current VPS:**
- Already running (Ubuntu)
- Likely has capacity for PostgreSQL
- May need RAM upgrade if > 20 concurrent users

### 11.2 Development Time

**Fulltime (40h/week):**
- Week 1: Foundation (auth)
- Week 2: Credentials
- Week 3: Broker isolation
- Week 4: Polish & production
- **Total: 3-4 weeks**

**Part-time (20h/week):**
- **Total: 6-8 weeks**

### 11.3 Maintenance Overhead

**Ongoing:**
- Database backups (automated)
- User management (support requests)
- Security updates (dependencies)
- Session cleanup (automated)
- Log rotation (automated)

---

## 12. Security Checklist

### Pre-Launch
- [ ] Password hashing with Argon2id
- [ ] Credential encryption with AES-256-GCM
- [ ] Per-user encryption salts
- [ ] JWT secret 64+ characters
- [ ] HTTPS enforced (SSL certificates)
- [ ] Rate limiting on all auth endpoints
- [ ] Account lockout after 5 failed attempts
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (input sanitization)
- [ ] CORS properly configured
- [ ] Session expiry (24h default)
- [ ] Session invalidation on logout
- [ ] Database connection encrypted (SSL)
- [ ] Secrets in .env (NEVER in git)
- [ ] Regular database backups
- [ ] Audit logging (auth attempts, credential access)

### Post-Launch
- [ ] Security headers (HSTS, CSP, etc.)
- [ ] Penetration testing
- [ ] Dependency vulnerability scanning
- [ ] Log monitoring for suspicious activity
- [ ] Regular security updates
- [ ] Incident response plan

---

## 13. Alternative: Quick MVP Route

**If you want faster results (2 weeks instead of 4):**

### Minimal Viable Multi-User

**Week 1:**
1. Simple auth (bcrypt, no Argon2)
2. Email + password in PostgreSQL
3. Basic JWT (no refresh tokens)
4. Credentials in encrypted JSON files (not database)
5. User selector dropdown (no full login flow)

**Week 2:**
6. Per-user state files (`state/user-{id}-state.json`)
7. Basic broker isolation
8. Manual disconnect logic
9. Simple WebSocket (no per-user streams yet)

**Later upgrades:**
- Full JWT with refresh tokens
- Credentials in PostgreSQL
- Proper login page
- Advanced security (rate limiting, etc.)
- Role-based access control

---

## 14. Recommended Next Steps

**Before implementing:**
1. ✅ Read this document completely
2. ⚠️ Decide: Full implementation or MVP route?
3. ⚠️ Confirm PostgreSQL or stick with SQLite + files?
4. ⚠️ Estimate available development time
5. ⚠️ Plan database backup strategy

**When ready to start:**
1. Create feature branch: `git checkout -b feature/multi-user-saas`
2. Start with FASE 1 (Foundation)
3. Test thoroughly after each phase
4. Update MASTER.md as you go
5. Create ADR document for major decisions

**Questions to answer:**
- How many concurrent users do you expect? (affects infrastructure)
- Do you need team/organization features? (multi-tier access)
- Do you need admin panel? (user management, monitoring)
- Payment integration needed? (subscription billing)

---

## 15. References

**Related Documents:**
- `MASTER.md` - Current single-user architecture
- `DOCS/deployment/DEPLOYMENT.md` - Deployment guides
- `DOCS/operations/CREDENTIALS_MANAGEMENT.md` - Current cred management

**External Resources:**
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)

---

## 16. Conclusion

**Is dit haalbaar?** ✅ **JA, absoluut!**

**Voordelen van deze aanpak:**
- ✅ Schaalbaar naar 100+ users
- ✅ Complete credential isolation
- ✅ Manual disconnect requirement gehandhaafd
- ✅ Production-ready security
- ✅ Bouwt voort op bestaande basis

**Risico's:**
- ⚠️ Broker isolation refactor is largest impact (3-4 dagen)
- ⚠️ WebSocket per-user streams vereist testing (1-2 dagen)
- ⚠️ Security moet 100% goed (anders grote risico's)

**Mijn aanbeveling:**
Start met **FASE 1** (Foundation). Dit geeft je:
- Working authentication
- Database infrastructure
- Frontend login flow

Dan kun je evalueren of je door wilt naar volledige implementatie of een MVP-variant.

**Wil je dat ik begin met de implementatie?**
- We kunnen starten met PostgreSQL setup + auth endpoints
- Ik kan de migratie script schrijven
- We testen met 2-3 test users voordat we live gaan

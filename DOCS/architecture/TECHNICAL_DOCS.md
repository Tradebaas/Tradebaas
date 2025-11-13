# Tradebaas - Technische Documentatie

**Versie:** 1.0  
**Laatste update:** 2024  
**Platform:** React + TypeScript + Node.js Backend

---

## 📋 Inhoudsopgave

1. [Overzicht](#overzicht)
2. [Architectuur](#architectuur)
3. [Frontend Structuur](#frontend-structuur)
4. [Backend Structuur](#backend-structuur)
5. [State Management](#state-management)
6. [Broker Integratie](#broker-integratie)
7. [Risk Engine](#risk-engine)
8. [Trading Strategieën](#trading-strategieën)
9. [Order Management](#order-management)
10. [License & Entitlement](#license--entitlement)
11. [Security](#security)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [API Reference](#api-reference)

---

## Overzicht

Tradebaas is een professionele crypto trading applicatie voor geautomatiseerde handel op cryptocurrency exchanges met leverage trading. De tool ondersteunt meerdere brokers, geavanceerde risk management, en automated trading strategies.

### Kernfunctionaliteit

- **Multi-broker support**: Deribit, Binance, Bybit, OKX, Bitget
- **Geautomatiseerde trading**: Strategy-based execution met 24/7 monitoring
- **Advanced risk management**: Percentage en fixed risk sizing met leverage caps
- **Bracket orders**: OTOCO (One-Triggers-OCO) met SL/TP management
- **Real-time monitoring**: WebSocket connections voor live data
- **License systeem**: Tiered entitlements (Free, Basic, Pro, Lifetime)

### Tech Stack

**Frontend:**
- React 19 + TypeScript
- Zustand (state management)
- Tailwind CSS v4 + shadcn/ui v4
- Vite (bundler)
- Vitest (testing)

**Backend:**
- Node.js + TypeScript
- Express (API server)
- Docker + Docker Compose
- Redis (queue management)
- PostgreSQL (persistence)

---

## Architectuur

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  App.tsx     │  │  Components  │  │  Hooks       │          │
│  │              │  │  - Trading   │  │  - useKV     │          │
│  │              │  │  - Settings  │  │  - useLicense│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                   │
│         └─────────────────┼──────────────────┘                   │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────┐            │
│  │         STATE (Zustand Store)                    │            │
│  │  - Trading state                                 │            │
│  │  - Connection management                         │            │
│  │  - Strategy orchestration                        │            │
│  └────────────────────┬────────────────────────────┘            │
│                       │                                          │
└───────────────────────┼──────────────────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
┌────────▼────────┐           ┌────────▼────────┐
│  BROKER CLIENT  │           │  BACKEND API    │
│  (WebSocket)    │           │  (REST)         │
│                 │           │                 │
│  - Deribit      │           │  - Strategy     │
│  - Binance      │           │    Runner       │
│  - Bybit        │           │  - License      │
│  - OKX          │           │    Service      │
│  - Bitget       │           │  - Orchestrator │
└─────────────────┘           └─────────────────┘
         │                             │
         │                             │
         ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│   EXCHANGES     │           │   INFRASTRUCTURE│
│   (APIs)        │           │   - Redis       │
│                 │           │   - PostgreSQL  │
└─────────────────┘           └─────────────────┘
```

### Data Flow

1. **User Input** → UI Components
2. **State Update** → Zustand Store
3. **Broker Communication** → WebSocket/REST API
4. **Order Execution** → Exchange APIs
5. **State Sync** → UI Update via subscriptions

---

## Frontend Structuur

```
src/
├── App.tsx                    # Main application component
├── ErrorFallback.tsx          # Global error boundary
├── index.css                  # Global styles & theme
├── main.tsx                   # Application entry point
│
├── components/                # React components
│   ├── ui/                   # shadcn components (40+)
│   ├── AppFooter.tsx         # Navigation footer
│   ├── BrokerList.tsx        # Broker selector
│   ├── ConnectionStatusDialog.tsx
│   ├── ErrorDetailsDialog.tsx
│   ├── KPICard.tsx           # Metrics display
│   ├── LegalDisclaimerDialog.tsx
│   ├── LicenseDialog.tsx
│   ├── MetricsPage.tsx
│   ├── PrivacyPolicyDialog.tsx
│   ├── PurchaseDialog.tsx
│   ├── SettingsDialog.tsx
│   ├── StatusPill.tsx        # Connection indicator
│   ├── StrategiesPage.tsx
│   ├── StrategyDetailsDialog.tsx
│   ├── StrategyErrorLogsDialog.tsx
│   ├── StrategyTradingCard.tsx
│   └── TradingCard.tsx
│
├── hooks/                     # Custom React hooks
│   ├── use-backend.ts        # Backend API integration
│   ├── use-blur-background.ts
│   ├── use-brokers.ts        # Broker metadata
│   ├── use-license.ts        # License management
│   ├── use-mobile.ts         # Mobile breakpoint
│   └── use-runner-orchestrator.ts
│
├── lib/                       # Core libraries
│   ├── brokers/              # Broker implementations
│   │   ├── IBroker.ts        # Broker interface
│   │   ├── BrokerRegistry.ts
│   │   ├── DeribitBroker.ts
│   │   ├── BinanceBroker.ts
│   │   ├── BybitBroker.ts
│   │   ├── BitgetBroker.ts
│   │   └── KrakenBroker.ts
│   │
│   ├── guards/               # Circuit breakers & safety
│   │   └── circuitBreakers.ts
│   │
│   ├── indicators/           # Technical indicators
│   │   ├── basic.ts         # EMA, BB, RSI
│   │   └── types.ts         # Candle types
│   │
│   ├── orders/               # Order management
│   │   └── AdvancedBracketManager.ts
│   │
│   ├── strategies/           # Trading strategies
│   │   ├── scalpingStrategy.ts
│   │   ├── fastTestStrategy.ts
│   │   └── thirdIterationStrategy.ts
│   │
│   ├── backend-client.ts     # Backend API client
│   ├── broker-api.ts         # Broker API helpers
│   ├── deribitClient.ts      # Deribit WebSocket client
│   ├── encryption.ts         # AES-GCM encryption
│   ├── license-api.ts        # License verification
│   ├── license-service.ts    # License management
│   ├── riskEngine.ts         # Position sizing
│   ├── riskEngineExamples.ts
│   └── utils.ts              # Utility functions
│
├── state/                     # State management
│   └── store.ts              # Zustand store
│
├── styles/                    # Additional styles
│   └── theme.css
│
├── tests/                     # Test files
│   ├── bracket/
│   ├── guards/
│   ├── recovery/
│   └── risk/
│
└── types/                     # TypeScript types
    ├── orchestrator-shim.d.ts
    └── spark.d.ts
```

### Key Components

**App.tsx**: Root component met header, main content area, footer, en dialogs

**StrategyTradingCard.tsx**: Hoofd trading interface voor strategy selectie en uitvoering

**SettingsDialog.tsx**: Broker connectie, API credentials, risk settings

**MetricsPage.tsx**: Performance metrics en trade history

---

## Backend Structuur

```
backend/
├── src/
│   ├── brokers/              # Broker adapters
│   │   ├── IBroker.ts
│   │   ├── DeribitBroker.ts
│   │   ├── BinanceBroker.ts
│   │   └── ...
│   │
│   ├── orchestrator/         # Worker management
│   │   ├── queue.ts         # Redis queue
│   │   └── worker-manager.ts
│   │
│   ├── strategy-runner/      # Strategy execution
│   │   ├── runner.ts
│   │   └── reconciliation.ts
│   │
│   ├── types/                # TypeScript types
│   │
│   ├── api.ts               # REST API routes
│   ├── config.ts            # Configuration
│   ├── health.ts            # Health checks
│   ├── index.ts             # Server entry
│   └── worker-entrypoint.js # Worker process
│
├── strategies/               # Strategy definitions
├── tests/                   # Backend tests
├── docker/                  # Docker configs
├── k8s/                     # Kubernetes configs
│
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## State Management

### Zustand Store (src/state/store.ts)

Central state management voor de gehele applicatie met synchronisatie tussen frontend en backend.

#### State Structure

```typescript
interface TradingStore {
  // Connection
  client: DeribitClient | null;
  connectionState: ConnectionState;
  environment: DeribitEnvironment;
  credentials: DeribitCredentials | null;
  
  // Account
  usdcBalance: number | null;
  
  // Strategy
  strategy: Strategy | null;
  strategyStatus: StrategyStatus;
  activePosition: ActivePosition | null;
  selectedStrategy: string;
  
  // Risk
  riskSettings: RiskSettings;
  
  // Errors
  error: string | null;
  errorLogs: ErrorLog[];
  strategyErrorLogs: ErrorLog[];
  
  // Actions
  initializeClient: () => void;
  connect: (credentials) => Promise<void>;
  disconnect: () => void;
  killSwitch: () => void;
  startStrategy: (strategyId) => Promise<void>;
  stopStrategy: () => void;
  // ... meer actions
}
```

#### Key Actions

**initializeClient()**: Maakt DeribitClient aan met telemetry hooks

**connect()**: 
- Verbindt met broker via API credentials
- Slaat credentials op in backend KV storage
- Roept `/api/v2/connect` endpoint aan
- Update connection state in backend-state.json
- **CRITICAL**: Zet `manuallyDisconnected: false` bij succesvolle connect

**disconnect()**:
- Stopt alle actieve strategieën
- Sluit WebSocket verbinding
- **CRITICAL**: Zet `manuallyDisconnected: true` in backend-state.json
- **SECURITY**: Voorkomt automatische reconnect bij page refresh/server restart
- Verwijdert credentials uit KV storage

**startStrategy()**: Start geselecteerde strategy met risk settings

**stopStrategy()**: Stopt actieve strategy en sluit posities

**placeTestMicroOrder()**: Plaatst test order voor validation

### Backend State Management (backend/src/state-manager.ts)

Persistent state management met auto-resume capabilities.

#### ConnectionState Interface

```typescript
interface ConnectionState {
  broker: string;              // 'deribit'
  environment: 'live' | 'testnet';
  connected: boolean;
  connectedAt?: number;        // Unix timestamp
  manuallyDisconnected?: boolean; // CRITICAL: prevents auto-reconnect
}
```

#### Auto-Reconnect Logic

```typescript
// backend/src/strategy-service.ts initialize()
const connection = stateManager.getConnection();
if (connection?.connected && !connection.manuallyDisconnected) {
  // Auto-resume connection after server restart
  await this.connect(connection.environment);
} else if (connection?.manuallyDisconnected) {
  // User manually disconnected - DO NOT auto-reconnect
  console.log('🚫 Not reconnecting: manual disconnect active');
}
```

**SECURITY REQUIREMENT**: "Als ik handmatig disconnect wil ik ABSOLUUT niet dat we automatisch weer verbinding leggen"

#### State Persistence

**Location**: `/root/tradebaas/backend-state.json`

**Structure**:
```json
{
  "disclaimerAccepted": true,
  "connection": {
    "broker": "deribit",
    "environment": "live",
    "connected": true,
    "connectedAt": 1699456789000,
    "manuallyDisconnected": false
  },
  "activeStrategies": [],
  "lastUpdated": 1699456789000
}
```

**Key Methods**:
- `setConnection()`: Explicitly saves ALL fields including `manuallyDisconnected`
- `getConnection()`: Returns current connection state
- Uses nullish coalescing `?? false` to ensure boolean fields are always defined

---

## Broker Integratie

### Backend API Communication (src/lib/backend-api.ts)

**CRITICAL**: Frontend communiceert via REST API met backend, NIET direct met brokers.

#### Connection Flow

```typescript
// 1. Frontend saves credentials
await backendAPI.saveCredentials('deribit', { apiKey, apiSecret });

// 2. Frontend triggers connect
await backendAPI.connect(credentials, environment);
// → POST /api/v2/connect
// → Backend calls strategyService.connect()
// → Backend saves state with manuallyDisconnected: false

// 3. Frontend triggers disconnect
await backendAPI.disconnect();
// → POST /api/v2/disconnect (NO BODY, NO HEADERS)
// → Backend calls strategyService.disconnect()
// → Backend saves state with manuallyDisconnected: true
// → Credentials deleted from KV storage
```

#### CRITICAL: Fastify Empty Body Fix

**Problem**: Fastify returns 400 error when `Content-Type: application/json` is set with empty POST body

**Solution**: Remove headers from disconnect fetch call
```typescript
// ❌ WRONG - causes Fastify error
fetch('/api/v2/disconnect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

// ✅ CORRECT - no headers for empty POST
fetch('/api/v2/disconnect', {
  method: 'POST'
});
```

#### Backend URL Configuration

```typescript
function getBackendUrl(): string {
  // 1. Try environment variable
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  
  // 2. Use current hostname with port 3000
  const host = window.location.hostname;
  return `http://${host}:3000`;
}
```

**Production**: Frontend op port 5000, Backend op port 3000, same hostname

### IBroker Interface

Unified interface voor alle broker implementations.

```typescript
interface IBroker {
  getName(): string;
  connect(credentials, environment, onStateChange?): Promise<void>;
  disconnect(): void;
  getConnectionState(): ConnectionState;
  
  // Market Data
  getInstruments(): Promise<BrokerInstrument[]>;
  getTicker(symbol): Promise<BrokerTicker>;
  getCandles(symbol, timeframe, limit?): Promise<BrokerCandle[]>;
  
  // Account
  getBalance(currency?): Promise<BrokerBalance>;
  getPosition(symbol): Promise<BrokerPosition | null>;
  
  // Orders
  placeOrder(params): Promise<BrokerOrder>;
  cancelOrder(orderId, symbol): Promise<void>;
  cancelAllOrders(symbol?): Promise<void>;
  getOpenOrders(symbol?): Promise<BrokerOrder[]>;
  closePosition(symbol): Promise<void>;
  
  // Subscriptions
  subscribeToTrades(symbol, callback): Promise<void>;
  subscribeToOrders(callback): Promise<void>;
}
```

### Ondersteunde Brokers

**Deribit** (Volledig operationeel)
- WebSocket API
- OTOCO bracket orders
- Testnet & Live
- Max Leverage: 50x

**Binance** (Stub)
- REST + WebSocket API
- Max Leverage: 125x

**Bybit** (Stub)
- REST + WebSocket API
- Max Leverage: 100x

**OKX** (Stub)
- REST + WebSocket API
- Max Leverage: 125x

**Bitget** (Stub)
- REST + WebSocket API
- Passphrase required
- Max Leverage: 125x

### DeribitClient Features

**Backend Implementation**: `backend/src/deribit-client.ts` (primary)  
**Frontend Implementation**: `src/lib/deribitClient.ts` (legacy, gebruikt backend API)

#### Connection Management

**Exponential Backoff with Jitter**
```typescript
const baseDelay = 1000;
const maxDelay = 32000;
const delay = Math.min(baseDelay * Math.pow(2, attempts), maxDelay);
const jitter = delay * 0.2 * Math.random();
await sleep(delay + jitter);
```

**Automatic Reconnection**
- Reconnect on WebSocket disconnect (unless manual)
- Token refresh voor expiry
- State preservation tijdens reconnect

**Manual Disconnect Protection**
```typescript
// CRITICAL: Track if disconnect was intentional
if (this.manualDisconnect) {
  console.log('Manual disconnect - not reconnecting');
  return;
}
```

#### Order Types & OTOCO (One-Triggers-OCO)

**OTOCO Structure** - Official Deribit method voor atomaire SL/TP:
```typescript
const order = await client.placeBuyOrder(
  instrument,
  amount,
  undefined, // market
  'market',
  'trade_label',
  false, // reduce_only
  {
    linked_order_type: 'one_triggers_one_cancels_other',
    trigger_fill_condition: 'first_hit',
    otoco_config: [
      {
        direction: 'sell',
        amount: amount,
        type: 'stop_market',
        trigger_price: stopLoss,
        trigger: 'mark_price',
        reduce_only: true,
        label: 'trade_label_sl'
      },
      {
        direction: 'sell',
        amount: amount,
        type: 'limit',
        price: takeProfit,
        reduce_only: true,
        label: 'trade_label_tp'
      }
    ]
  }
);
```

**OTOCO Benefits**:
- ✅ **Atomic**: Entry + SL + TP in één API call
- ✅ **Auto-linked**: Deribit creates OCO relationship automatically
- ✅ **Auto-cleanup**: When SL fills, TP auto-cancels (and vice versa)
- ✅ **Race condition proof**: No gap between entry and protection orders
- ✅ **Server-side**: Protection persists through disconnects

**Order Types**:
- Market orders
- Limit orders
- Stop market/limit
- OTOCO brackets (preferred method)

#### WebSocket Subscriptions

**Available Channels**:
```typescript
// User trades
await client.subscribe(['user.trades.{instrument}.raw']);

// Order updates
await client.subscribe(['user.orders.{instrument}.raw']);

// Position changes
await client.subscribe(['user.portfolio.{currency}']);

// Account updates
await client.subscribe(['user.portfolio.{currency}']);

// Market tickers
await client.subscribeTicker(instrument, (ticker) => {
  console.log('Price:', ticker.last_price);
});
```

---

## Risk Engine

### Position Sizing

Berekent position size gebaseerd op risk parameters en broker rules.

```typescript
interface RiskEngineInput {
  equity: number;              // Account equity
  riskMode: 'percent' | 'fixed';
  riskValue: number;           // % of equity or fixed amount
  entryPrice: number;
  stopPrice: number;
  brokerRules: BrokerRules;
}

interface RiskEngineOutput {
  success: boolean;
  quantity?: number;           // Position size
  notional?: number;           // Position value
  effectiveLeverage?: number;  // Actual leverage
  warnings?: string[];
  reason?: string;             // Error message if failed
}
```

### Broker Rules

```typescript
interface BrokerRules {
  maxLeverage: number;    // 50x, 100x, 125x
  tickSize: number;       // Price increment (0.5, 0.01)
  lotSize: number;        // Quantity increment (10, 0.001)
  minTradeAmount: number; // Minimum position size
}
```

### Validation Flow

1. **Calculate risk amount** (equity × percent OR fixed)
2. **Calculate distance** (|entry - stop|)
3. **Calculate raw quantity** (riskAmount / distance)
4. **Round to lot size**
5. **Check minimum trade amount**
6. **Calculate leverage** (notional / equity)
7. **Cap at max leverage** (downsize if needed)
8. **Validate final amount** (contract size multiple)

---

## Trading Strategieën

### Strategy Interface

```typescript
interface Strategy {
  start(): Promise<void>;
  stop(): void;
  hasActivePosition(): boolean;
  getAnalysisState(): AnalysisState;
}
```

### Beschikbare Strategieën

#### 1. Scalping Strategy

**ID**: `scalping`  
**Doel**: Korte-termijn trades op 1m timeframe  
**Indicators**: EMA, BB, RSI  
**Status**: Production ready

#### 2. Fast Test Strategy

**ID**: `fast-test`  
**Doel**: Snelle test trades (elke 20s)  
**Gebruik**: Testing & validation  
**Status**: Development/testing only

#### 3. Vortex Strategy

**ID**: `third-iteration`  
**Doel**: Advanced bracket management met trailing  
**Features**:
- TP1 op 50% @ 1R
- SL naar BE na TP1
- Trailing runner (swing/EMA20/oppBB/RSI)
- State recovery

**Status**: Production ready

### Strategy Lifecycle

```
Stopped → Analyzing → Active → In-Position → Stopped
    ↓                    ↓           ↓
  Error ←───────────────┴───────────┘
```

---

## Order Management

### AdvancedBracketManager

Beheert complexe bracket orders met partial fills en trailing stops.

#### Features

- **Initial bracket**: Entry + SL (100%) + TP1 (50%)
- **TP1 detection**: Automatic bij partial fill
- **SL adjustment**: Amount → 50%, Price → BE
- **Trailing methods**:
  - Swing: Trail onder/boven swing points
  - EMA20: Trail onder/boven 20 EMA
  - oppBB: Exit bij opposite Bollinger Band
  - rsiFlip: Exit bij RSI flip
- **Idempotent updates**: Voorkomt dubbele modificaties
- **State recovery**: Reconstructie na restart

#### API

```typescript
class AdvancedBracketManager {
  constructor(args: {
    client: DeribitClient;
    symbol: string;
    logger: Logger;
    getIndicators: () => IndicatorData;
    tickSize: number;
  });

  attachInitialBracket(args: {
    side: 'buy' | 'sell';
    entryOrderId: string;
    totalQty: number;
    entryPrice: number;
    stopPrice: number;
    oneRPrice: number;
  }): Promise<BracketState>;

  onOrderUpdate(event): Promise<void>;
  maybeTrail(nowPrice): Promise<void>;
  cancelAll(reason?): Promise<void>;
  getState(): BracketState;
}
```

---

## License & Entitlement

### Tiers

- **Free**: Basic features, testnet only
- **Basic**: Live trading, 1 strategy
- **Pro**: Multiple strategies, advanced features
- **Lifetime**: All features, lifetime access

### Verificatie Flow

1. User koopt via App Store (StoreKit 2)
2. Receipt naar backend: `POST /iap/verify-receipt`
3. Server-side verificatie bij Apple
4. Entitlement opgeslagen in database
5. JWT issued met tier info
6. Frontend controleert entitlement via `useLicense()`

### Restore Purchases

`POST /auth/restore` - Herstelt eerdere aankopen

---

## Security

### Credential Encryption

**Algorithm**: AES-GCM 256-bit  
**Storage**: Browser localStorage (encrypted)  
**Key derivation**: PBKDF2 met random salt

```typescript
// Encrypt
const encrypted = await saveEncrypted(credentials, password);

// Decrypt
const decrypted = await loadEncrypted(encryptedData, password);
```

### API Keys

- Nooit in plain text opgeslagen
- Masked in UI by default
- Separate storage per broker
- Automatic cleanup bij disconnect

### Rate Limiting

- Exponential backoff op errors
- Throttling voor order modifications
- Request queuing

---

## Testing

### Test Structure

```
src/tests/
├── risk/
│   └── percentSizing.spec.ts      # Risk engine tests
├── bracket/
│   └── advancedBracket.spec.ts    # Bracket manager tests
├── recovery/
│   └── stateRecovery.spec.ts      # State recovery tests
└── guards/
    └── killswitch.spec.ts         # Circuit breaker tests
```

### Run Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## Deployment

### Production Stack

**Process Manager**: PM2 (cluster mode)  
**Backend Server**: Fastify (port 3000)  
**Frontend Server**: Vite dev server (port 5000)  
**State Persistence**: backend-state.json  
**Credentials Storage**: Backend KV storage

### PM2 Configuration

**Backend** (Cluster mode voor high availability):
```json
{
  "apps": [{
    "name": "tradebaas-backend",
    "script": "tsx",
    "args": "watch src/server.ts",
    "cwd": "/root/tradebaas/backend",
    "instances": 2,
    "exec_mode": "cluster",
    "watch": false,
    "autorestart": true,
    "max_memory_restart": "500M",
    "env": {
      "NODE_ENV": "production",
      "PORT": "3000"
    }
  }]
}
```

**Frontend** (Single instance):
```json
{
  "apps": [{
    "name": "tradebaas-frontend",
    "script": "npm",
    "args": "run dev -- --host 0.0.0.0 --port 5000",
    "cwd": "/root/tradebaas",
    "instances": 1,
    "autorestart": true,
    "max_memory_restart": "300M"
  }]
}
```

### Process Cleanup & Management

**Problem**: Old `tsx` processes kunnen blijven draaien en interferen met nieuwe instances

**Solution**: Automated cleanup via systemd timer + cron

#### Cleanup Script (`cleanup-old-processes.sh`)

```bash
#!/bin/bash
# Find all tsx processes NOT managed by PM2
pgrep -f "tsx.*server.ts" | while read pid; do
  if ! pm2 jlist | grep -q "\"pid\":$pid"; then
    echo "Killing rogue tsx process: $pid"
    kill -9 $pid
  fi
done
```

#### Systemd Timer (`/etc/systemd/system/tradebaas-cleanup.timer`)

```ini
[Unit]
Description=Cleanup old Tradebaas processes every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=tradebaas-cleanup.service

[Install]
WantedBy=timers.target
```

#### Systemd Service (`/etc/systemd/system/tradebaas-cleanup.service`)

```ini
[Unit]
Description=Cleanup old Tradebaas processes

[Service]
Type=oneshot
ExecStart=/root/tradebaas/cleanup-old-processes.sh
```

**Enable & Start**:
```bash
chmod +x /root/tradebaas/cleanup-old-processes.sh
sudo systemctl daemon-reload
sudo systemctl enable tradebaas-cleanup.timer
sudo systemctl start tradebaas-cleanup.timer
```

### Startup Procedure

**Startup Script** (`pm2-startup.sh`):
```bash
#!/bin/bash
# 1. Cleanup old processes
./cleanup-old-processes.sh

# 2. Start backend (cluster mode)
cd backend
pm2 start ecosystem.config.json

# 3. Start frontend
cd ..
pm2 start npm --name "tradebaas-frontend" -- run dev -- --host 0.0.0.0 --port 5000

# 4. Save PM2 state
pm2 save

# 5. Show status
pm2 list
```

### State Persistence & Recovery

**Auto-Resume Flow**:
1. PM2 restarts backend process
2. Backend loads `backend-state.json`
3. If `connection.connected === true` AND `manuallyDisconnected === false`:
   - Load credentials from KV storage
   - Auto-reconnect to Deribit
   - Restore WebSocket subscriptions
4. If `manuallyDisconnected === true`:
   - **DO NOT reconnect** (user intentionally disconnected)
   - Wait for manual reconnect via UI

**State File Location**: `/root/tradebaas/backend-state.json`

**Critical Fields**:
```json
{
  "connection": {
    "broker": "deribit",
    "environment": "live",
    "connected": true,
    "connectedAt": 1699456789000,
    "manuallyDisconnected": false  // ← CRITICAL for auto-resume
  }
}
```

### Docker Compose

**Development**:
```bash
docker-compose -f docker-compose.dev.yml up
```

**Production**:
```bash
docker-compose up -d
```

### Environment Variables

```bash
# Backend
API_PORT=3000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Broker APIs (per broker)
DERIBIT_API_KEY=...
DERIBIT_API_SECRET=...
BINANCE_API_KEY=...
# etc.
```

### Health Checks

**Endpoint**: `GET /health`

Returns: `{ status: 'ok', uptime: number }`

---

## Connection Lifecycle & State Management

### Complete Connection Flow

#### 1. Initial Connect (User Action)

**Frontend Flow**:
```typescript
// 1. User clicks "Verbind" in SettingsDialog
const credentials = { apiKey, apiSecret };

// 2. Store saves credentials to backend
await backendAPI.saveCredentials('deribit', credentials);

// 3. Store triggers connect
await backendAPI.connect(credentials, 'live');
// → POST /api/v2/connect with { environment: 'live' }

// 4. Backend response
{ success: true }
```

**Backend Flow** (`backend/src/strategy-service.ts`):
```typescript
async connect(environment: DeribitEnvironment): Promise<void> {
  // 1. Load credentials from KV storage
  const kvCreds = await credentialsManager.getCredentials('deribit');
  
  // 2. Create WebSocket client
  this.client = new BackendDeribitClient(environment);
  
  // 3. Connect to Deribit
  await this.client.connect({
    apiKey: kvCreds.api_key,
    apiSecret: kvCreds.api_secret
  });
  
  // 4. Verify connection
  if (!this.client.isConnected()) {
    throw new Error('Failed to establish WebSocket connection');
  }
  
  // 5. Save connection state
  await stateManager.setConnection({
    broker: 'deribit',
    environment: 'live',
    connected: true,
    connectedAt: Date.now(),
    manuallyDisconnected: false // ← Clear manual disconnect flag
  });
}
```

#### 2. Manual Disconnect (User Action)

**Frontend Flow**:
```typescript
// 1. User clicks "Verbreek verbinding"
await backendAPI.disconnect();
// → POST /api/v2/disconnect (NO BODY, NO HEADERS)

// 2. Backend response
{ success: true }

// 3. Credentials deleted from KV storage
```

**Backend Flow**:
```typescript
async disconnect(): Promise<void> {
  // 1. Stop all running strategies
  for (const strategyId of this.runningStrategies.keys()) {
    await this.stopStrategy({ strategyId });
  }
  
  // 2. Close WebSocket connection
  if (this.client) {
    this.client.disconnect();
    this.client = null;
  }
  
  // 3. Save disconnected state
  await stateManager.setConnection({
    broker: 'deribit',
    environment: this.environment,
    connected: false,
    connectedAt: undefined,
    manuallyDisconnected: true // ← CRITICAL: Prevent auto-reconnect
  });
}
```

#### 3. Auto-Resume (Server Restart)

**Scenario**: PM2 restarts backend, or page refresh

**Backend Initialize Flow**:
```typescript
async initialize(): Promise<void> {
  await stateManager.initialize(); // Load backend-state.json
  
  const connection = stateManager.getConnection();
  
  if (connection?.connected && !connection.manuallyDisconnected) {
    // ✅ Previous connection was active AND not manually disconnected
    console.log('Auto-resuming previous connection...');
    
    try {
      await this.connect(connection.environment);
      console.log('✅ Connection restored successfully');
    } catch (error) {
      console.error('❌ Failed to restore connection:', error);
      // Clear failed state
      await stateManager.setConnection({
        ...connection,
        connected: false,
        manuallyDisconnected: false
      });
    }
  } else if (connection?.manuallyDisconnected) {
    // 🚫 User manually disconnected - DO NOT auto-reconnect
    console.log('🚫 Not reconnecting: manual disconnect active');
  } else {
    console.log('No previous connection to restore');
  }
}
```

#### 4. Page Refresh (Frontend)

**Frontend Initialize Flow**:
```typescript
useEffect(() => {
  // Poll backend for connection status
  const interval = setInterval(async () => {
    const status = await backendAPI.getStatus();
    
    if (status.connection.connected) {
      // Update UI to show "Verbonden"
      setConnectionState('Active');
    } else {
      // Update UI to show "Verbroken"
      setConnectionState('Disconnected');
    }
  }, 2000); // Poll every 2 seconds
  
  return () => clearInterval(interval);
}, []);
```

### State Synchronization

**Backend → Frontend**: Via polling (every 2 seconds)

**Endpoints**:
- `GET /api/connection/status` - Connection state
- `GET /api/strategy/status` - Strategy state
- `GET /api/v2/balance` - Account balance
- `GET /api/v2/positions` - Open positions

**Why Polling?**: 
- Simple & reliable
- No WebSocket state management needed between frontend/backend
- Handles network interruptions gracefully
- Low overhead (2s interval)

### Critical Safeguards

#### 1. Prevent Auto-Reconnect on Manual Disconnect

**Requirement**: "Als ik handmatig disconnect wil ik ABSOLUUT niet dat we automatisch weer verbinding leggen"

**Implementation**:
```typescript
// backend/src/state-manager.ts
async setConnection(connection: ConnectionState): Promise<void> {
  this.state.connection = {
    broker: connection.broker,
    environment: connection.environment,
    connected: connection.connected,
    connectedAt: connection.connectedAt,
    manuallyDisconnected: connection.manuallyDisconnected ?? false
  };
  await this.save();
}
```

**Test**:
1. ✅ Connect → Status shows "Verbonden"
2. ✅ Disconnect → Status shows "Verbroken"
3. ✅ Refresh page → Status STAYS "Verbroken" (no auto-reconnect)
4. ✅ backend-state.json shows `manuallyDisconnected: true`

#### 2. Fastify Empty Body Handling

**Problem**: Fastify strict about Content-Type headers

**Error**: `Body cannot be empty when content-type is set to 'application/json'`

**Solution**: Don't send Content-Type header for empty POST requests
```typescript
// ❌ WRONG
fetch('/api/v2/disconnect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

// ✅ CORRECT
fetch('/api/v2/disconnect', {
  method: 'POST'
});
```

#### 3. Process Cleanup

**Problem**: Old tsx processes interfere with new instances

**Solution**: Systemd timer + cron cleanup every 5 minutes

**Verification**:
```bash
# Check for rogue processes
ps aux | grep tsx

# Check PM2 managed processes
pm2 list

# Verify timer is running
systemctl status tradebaas-cleanup.timer
```

---

## API Reference

### Frontend ↔ Backend REST API

All API calls from frontend go through `backendAPI` client (`src/lib/backend-api.ts`)

#### Connection & Credentials

**Save Credentials**
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

Response: { "success": true }
```

**Get Credentials**
```http
GET /api/credentials/deribit

Response: {
  "success": true,
  "credentials": {
    "api_key": "xxx",
    "api_secret": "yyy"
  }
}
```

**Delete Credentials**
```http
DELETE /api/credentials/deribit

Response: { "success": true }
```

**Connect to Broker**
```http
POST /api/v2/connect
Content-Type: application/json

{
  "environment": "live"
}

Response: { "success": true }
```

**Disconnect from Broker**
```http
POST /api/v2/disconnect
(NO BODY, NO HEADERS - Fastify strict mode)

Response: { "success": true }
```

**Get Connection Status**
```http
GET /api/connection/status

Response: {
  "connected": true,
  "environment": "live",
  "broker": "deribit",
  "connectedAt": 1699456789000,
  "manuallyDisconnected": false
}
```

#### Account & Positions

**Get Balance**
```http
GET /api/v2/balance

Response: {
  "success": true,
  "balance": {
    "currency": "BTC",
    "available": 0.5,
    "total": 0.6,
    "locked": 0.1
  }
}
```

**Get Positions**
```http
GET /api/v2/positions

Response: {
  "success": true,
  "positions": [
    {
      "instrument_name": "BTC_USDC-PERPETUAL",
      "size": 100,
      "direction": "buy",
      "average_price": 45000,
      "unrealized_pnl": 50.5,
      "leverage": 2.5
    }
  ]
}
```

**Close Position**
```http
POST /api/v2/positions/close
Content-Type: application/json

{
  "instrument": "BTC_USDC-PERPETUAL"
}

Response: { "success": true }
```

#### Market Data

**Get Ticker**
```http
GET /api/v2/ticker/BTC_USDC-PERPETUAL

Response: {
  "success": true,
  "ticker": {
    "instrument_name": "BTC_USDC-PERPETUAL",
    "last_price": 45123.5,
    "mark_price": 45120.0,
    "best_bid": 45122.0,
    "best_ask": 45125.0
  }
}
```

**Get Open Orders**
```http
GET /api/v2/orders/BTC_USDC-PERPETUAL

Response: {
  "success": true,
  "orders": [
    {
      "order_id": "123456",
      "instrument_name": "BTC_USDC-PERPETUAL",
      "direction": "buy",
      "amount": 100,
      "price": 45000,
      "order_state": "open",
      "order_type": "limit"
    }
  ]
}
```

#### Strategies

**List Strategies**
```http
GET /api/v2/strategies

Response: {
  "success": true,
  "strategies": [
    {
      "id": "razor",
      "name": "Razor",
      "description": "High-frequency scalping strategy",
      "author": "Tradebaas",
      "version": "1.0.0",
      "tags": ["scalping", "high-frequency"]
    }
  ]
}
```

**Start Strategy**
```http
POST /api/strategy/start
Content-Type: application/json

{
  "strategyId": "razor",
  "instrument": "BTC_USDC-PERPETUAL",
  "riskSettings": {
    "mode": "percent",
    "value": 1.0
  },
  "maxPositions": 1
}

Response: {
  "success": true,
  "strategyId": "strategy-1699456789000",
  "message": "Strategy Razor started"
}
```

**Stop Strategy**
```http
POST /api/strategy/stop
Content-Type: application/json

{
  "strategyId": "strategy-1699456789000"
}

Response: {
  "success": true,
  "message": "Strategy stopped"
}
```

**Get Strategy Status**
```http
GET /api/strategy/status

Response: {
  "isRunning": true,
  "strategyName": "Razor",
  "position": {
    "instrument": "BTC_USDC-PERPETUAL",
    "direction": "long",
    "entryPrice": 45000,
    "amount": 100
  },
  "connection": {
    "connected": true,
    "environment": "live",
    "broker": "deribit"
  }
}
```

**Get Strategy Analysis**
```http
GET /api/strategy/analysis/strategy-1699456789000

Response: {
  "success": true,
  "analysis": {
    "status": "analyzing",
    "lastCheck": 1699456789000,
    "signals": {
      "ema_cross": false,
      "rsi_oversold": false,
      "bb_breakout": false
    }
  }
}
```

#### Health & Monitoring

**Health Check**
```http
GET /health

Response: {
  "status": "ok",
  "uptime": 3600,
  "strategies": {
    "active": 1,
    "total": 1
  }
}
```

**Kill Switch**
```http
POST /api/killswitch

Response: { "success": true }
```

### Backend → Deribit WebSocket

**Authentication**
```json
{
  "jsonrpc": "2.0",
  "method": "public/auth",
  "params": {
    "grant_type": "client_credentials",
    "client_id": "API_KEY",
    "client_secret": "API_SECRET"
  }
}
```

**Subscribe to Channels**
```json
{
  "jsonrpc": "2.0",
  "method": "private/subscribe",
  "params": {
    "channels": [
      "user.trades.BTC_USDC-PERPETUAL.raw",
      "user.orders.BTC_USDC-PERPETUAL.raw",
      "user.portfolio.USDC"
    ]
  }
}
```

**Place OTOCO Order**
```json
{
  "jsonrpc": "2.0",
  "method": "private/buy",
  "params": {
    "instrument_name": "BTC_USDC-PERPETUAL",
    "amount": 100,
    "type": "market",
    "label": "trade_123",
    "linked_order_type": "one_triggers_one_cancels_other",
    "trigger_fill_condition": "first_hit",
    "otoco_config": [
      {
        "direction": "sell",
        "amount": 100,
        "type": "stop_market",
        "trigger_price": 44500,
        "trigger": "mark_price",
        "reduce_only": true,
        "label": "trade_123_sl"
      },
      {
        "direction": "sell",
        "amount": 100,
        "type": "limit",
        "price": 45500,
        "reduce_only": true,
        "label": "trade_123_tp"
      }
    ]
  }
}
```

### WebSocket Event Examples

**Trade Event**
```json
{
  "jsonrpc": "2.0",
  "method": "subscription",
  "params": {
    "channel": "user.trades.BTC_USDC-PERPETUAL.raw",
    "data": {
      "trade_id": "123456",
      "instrument_name": "BTC_USDC-PERPETUAL",
      "direction": "buy",
      "amount": 100,
      "price": 45000,
      "timestamp": 1699456789000
    }
  }
}
```

**Order Event**
```json
{
  "jsonrpc": "2.0",
  "method": "subscription",
  "params": {
    "channel": "user.orders.BTC_USDC-PERPETUAL.raw",
    "data": {
      "order_id": "123456",
      "order_state": "filled",
      "instrument_name": "BTC_USDC-PERPETUAL",
      "direction": "buy",
      "amount": 100,
      "filled_amount": 100,
      "average_price": 45000
    }
  }
}
```

---

## Performance Optimalisaties

- **WebSocket pooling**: Hergebruik van connections
- **Candle caching**: Minimale API calls
- **Lazy loading**: Components on-demand laden
- **State persistence**: KV storage voor settings
- **Throttling**: Order updates elke 2-3s max

---

## Troubleshooting & Debugging

### Connection Issues

#### Symptoom: Status blijft op "Connecting"
**Diagnose**:
```bash
# Check backend logs
pm2 logs tradebaas-backend --lines 50

# Check connection state
curl http://localhost:3000/api/connection/status | jq

# Verify credentials exist
curl http://localhost:3000/api/credentials/deribit | jq
```

**Oplossingen**:
1. ✅ Check API credentials validity
2. ✅ Verify network/firewall (port 3000 open)
3. ✅ Check Deribit API status (live vs testnet)
4. ✅ Restart backend: `pm2 restart tradebaas-backend`

#### Symptoom: Disconnect button doet niets
**Diagnose**:
```bash
# Check browser console for errors
# Look for 400/500 errors during disconnect

# Check backend logs
pm2 logs tradebaas-backend --lines 20
```

**Oplossingen**:
1. ✅ Hard refresh browser (Ctrl+Shift+F5) - cache issue
2. ✅ Check backend-api.ts disconnect() - moet NO headers hebben
3. ✅ Verify Fastify niet klaagt over empty body

#### Symptoom: Auto-reconnect na manual disconnect
**Diagnose**:
```bash
# Check backend-state.json
cat /root/tradebaas/backend-state.json | jq '.connection'

# Should show:
{
  "connected": false,
  "manuallyDisconnected": true  # ← CRITICAL
}
```

**Oplossingen**:
1. ✅ Verify disconnect() zet manuallyDisconnected: true
2. ✅ Check initialize() respecteert de flag
3. ✅ Test: disconnect → refresh → should stay disconnected

### Order Management Issues

#### Symptoom: "Invalid params" error bij order placement
**Diagnose**:
```typescript
// Check instrument details
const instrument = await client.getInstrument('BTC_USDC-PERPETUAL');
console.log('Tick size:', instrument.tick_size);
console.log('Lot size:', instrument.contract_size);
console.log('Min amount:', instrument.min_trade_amount);
```

**Oplossingen**:
1. ✅ Round price to tick_size multiple
2. ✅ Round amount to contract_size multiple
3. ✅ Ensure amount >= min_trade_amount
4. ✅ Check API key permissions (trading enabled)

#### Symptoom: OTOCO orders niet linked
**Diagnose**:
```bash
# Check order labels - should have common prefix
curl http://localhost:3000/api/v2/orders/BTC_USDC-PERPETUAL | jq

# Look for:
# - Entry: "trade_123"
# - SL: "trade_123_sl"
# - TP: "trade_123_tp"
```

**Oplossingen**:
1. ✅ Use linked_order_type: 'one_triggers_one_cancels_other'
2. ✅ Set trigger_fill_condition: 'first_hit'
3. ✅ Ensure otoco_config array is complete
4. ✅ Verify reduce_only: true on SL/TP

#### Symptoom: SL/TP niet auto-cancelled
**Expected**: When SL fills, TP should auto-cancel (OCO behavior)

**Diagnose**:
```bash
# Monitor open orders
watch -n 2 'curl -s http://localhost:3000/api/v2/orders/BTC_USDC-PERPETUAL | jq'
```

**Oplossingen**:
1. ✅ Verify OTOCO was used (not manual SL+TP placement)
2. ✅ Check Deribit order response has oco_ref field
3. ✅ Use position-based cleanup as fallback (monitorPositionBasedCleanup)

### Strategy Issues

#### Symptoom: Strategy "analyzing" maar geen trades
**Diagnose**:
```bash
# Get strategy analysis state
curl http://localhost:3000/api/strategy/analysis/STRATEGY_ID | jq

# Check signals
{
  "status": "analyzing",
  "signals": {
    "ema_cross": false,
    "rsi_oversold": false,
    "bb_breakout": false
  }
}
```

**Oplossingen**:
1. ✅ Check signal conditions zijn niet te strict
2. ✅ Verify market volatility binnen min/max range
3. ✅ Check cooldown period niet actief
4. ✅ Verify max daily trades niet bereikt

#### Symptoom: Strategy crashes met error
**Diagnose**:
```bash
# Check strategy error logs
pm2 logs tradebaas-backend | grep ERROR

# Get error logs via API
curl http://localhost:3000/api/strategy/errors | jq
```

**Oplossingen**:
1. ✅ Check broker connection is active
2. ✅ Verify sufficient balance for trades
3. ✅ Check risk engine calculations
4. ✅ Review error logs for specific issue

### State & Persistence Issues

#### Symptoom: State niet hersteld na restart
**Diagnose**:
```bash
# Check state file exists and is valid JSON
cat /root/tradebaas/backend-state.json | jq

# Check file permissions
ls -la /root/tradebaas/backend-state.json

# Verify PM2 can read/write
pm2 logs tradebaas-backend | grep StateManager
```

**Oplossingen**:
1. ✅ Ensure state file has correct permissions (644)
2. ✅ Verify JSON is valid (no corruption)
3. ✅ Check StateManager.save() is called after updates
4. ✅ Review initialize() logs for load errors

#### Symptoom: Credentials verdwijnen na restart
**Diagnose**:
```bash
# Check credentials in backend
curl http://localhost:3000/api/credentials/deribit | jq

# Expected: { "success": true, "credentials": {...} }
# If not: credentials not persisted properly
```

**Oplossingen**:
1. ✅ Use backendAPI.saveCredentials() before connect
2. ✅ Verify KV storage is working
3. ✅ Check credentials are in array format
4. ✅ Don't call deleteCredentials() during connect

### Process Management Issues

#### Symptoom: Multiple backend processes running
**Diagnose**:
```bash
# Check all tsx processes
ps aux | grep tsx

# Check PM2 processes
pm2 list

# Find rogue processes
pgrep -f "tsx.*server.ts"
```

**Oplossingen**:
1. ✅ Run cleanup script: `./cleanup-old-processes.sh`
2. ✅ Verify systemd timer is active: `systemctl status tradebaas-cleanup.timer`
3. ✅ Kill manually: `pkill -f "tsx.*server.ts"`
4. ✅ Restart PM2: `pm2 restart all`

#### Symptoom: PM2 process crashed
**Diagnose**:
```bash
# Check PM2 status
pm2 list

# Check logs for crash reason
pm2 logs tradebaas-backend --err --lines 100

# Check restart count
pm2 info tradebaas-backend
```

**Oplossingen**:
1. ✅ Review error logs for root cause
2. ✅ Check memory usage (max_memory_restart)
3. ✅ Verify Node.js version compatibility
4. ✅ Restart: `pm2 restart tradebaas-backend`

### Browser/Frontend Issues

#### Symptoom: UI toont oude code na update
**Diagnose**:
```bash
# Check frontend version in console
console.log('Frontend build:', document.querySelector('meta[name="build-time"]'));

# Check if vite dev server is serving cached files
pm2 logs tradebaas-frontend --lines 20
```

**Oplossingen**:
1. ✅ Hard refresh: Ctrl+Shift+F5 (clears cache)
2. ✅ Clear browser cache completely
3. ✅ Restart frontend: `pm2 restart tradebaas-frontend`
4. ✅ Check browser console for errors

#### Symptoom: Backend API calls failing with CORS
**Diagnose**:
```javascript
// Check browser console for CORS errors
// "Access-Control-Allow-Origin" missing

// Verify backend URL
console.log('Backend URL:', backendAPI.baseUrl);
```

**Oplossingen**:
1. ✅ Check Fastify CORS configuration
2. ✅ Verify frontend/backend on same origin (or CORS enabled)
3. ✅ Check network tab for actual error response
4. ✅ Use curl to test backend directly

### Debug Commands Cheat Sheet

```bash
# === Connection Status ===
curl http://localhost:3000/api/connection/status | jq

# === Account Balance ===
curl http://localhost:3000/api/v2/balance | jq

# === Open Positions ===
curl http://localhost:3000/api/v2/positions | jq

# === Strategy Status ===
curl http://localhost:3000/api/strategy/status | jq

# === Backend Logs (live) ===
pm2 logs tradebaas-backend --lines 50

# === Process Status ===
pm2 list

# === State File ===
cat /root/tradebaas/backend-state.json | jq

# === Check for Rogue Processes ===
ps aux | grep tsx

# === Cleanup Old Processes ===
./cleanup-old-processes.sh

# === Restart Everything ===
pm2 restart all

# === Hard Reset ===
pm2 delete all
pm2 flush  # Clear logs
./pm2-startup.sh
```

---

## Maintenance

### Logs Location

- **Frontend**: Browser console + ErrorDetailsDialog
- **Backend**: stdout/stderr (Docker logs)
- **Strategy**: StrategyErrorLogsDialog

### Monitoring Metrics

- Connection uptime
- Order success rate
- Strategy P&L
- API call latency
- Error rates

---

## Roadmap

- [ ] Meer broker implementations
- [ ] Backtesting framework
- [ ] Mobile app (iOS/Android)
- [ ] Portfolio optimization
- [ ] Multi-strategy orchestration
- [ ] Advanced charting

---

## Support & Contact

**Repository**: `/workspaces/spark-template`  
**Docs**: Zie markdown files in root directory  
**Issues**: Gebruik error logging systeem

---

**Laatste update**: Iteratie 85  
**Status**: Production ready voor Deribit, stubs voor andere brokers

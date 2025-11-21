# 🚀 Tradebaas Production-Ready Iteratieplan V2

**Doel:** 24/7 automatisch traden met generieke broker/strategy support  
**Start:** 6 November 2025  
**Status:** NIEUW PLAN - Gebouwd op bestaande infrastructuur (75% compleet)  
**Eigenaar:** Development Team + User

---

## 🎯 **HUIDIGE STATUS (6 nov 2025)**

### ✅ **WAT WE AL HEBBEN (Compleet):**

1. **OCO Order Infrastructure (95%)**
   - ✅ `DeribitBroker.placeOCOOrder()` - Atomische entry + SL + TP
   - ✅ Order validation (leverage, margin, lot size)
   - ✅ Rollback bij failures
   - ✅ Orphan cleanup (elke 60s)
   - ✅ 100+ tests (all passing)

2. **Risk Engine (100%)**
   - ✅ `PositionSizer` - Exact 5% risk calculation
   - ✅ Multi-currency (BTC, ETH, USDC)
   - ✅ Leverage optimization
   - ✅ 22 tests (≤0.1% accuracy in 1000 scenarios)

3. **Position Guards (100%)**
   - ✅ Single position enforcement
   - ✅ Single strategy enforcement
   - ✅ Position lifecycle state machine
   - ✅ Pause/resume analyzing

4. **Crash Recovery (90%)**
   - ✅ State persistence (JSON, atomic writes)
   - ✅ Hourly backups (24-hour retention)
   - ✅ Broker reconciliation
   - ✅ 26 tests (100 crash cycles, 0 state loss)

5. **Frontend & API (100%)**
   - ✅ REST API endpoints (`/api/v2/*`)
   - ✅ WebSocket realtime updates
   - ✅ Settings Dialog (broker credentials, testnet toggle)
   - ✅ Strategy Trading Card (risk settings, start/stop)
   - ✅ OpenAPI 3.0 spec

6. **Observability (100%)**
   - ✅ Winston structured logging
   - ✅ Prometheus metrics
   - ✅ Telegram notifications
   - ✅ Rate limiting (HTTP + WebSocket)
   - ✅ CORS whitelist

### ⚠️ **WAT ONTBREEKT (Focus van dit plan):**

1. ❌ **Live Deribit API testing** (code is er, nooit getest)
2. ❌ **Strategy Registry** (alleen Razor hardcoded)
3. ❌ **Broker selector UI** (alleen credentials, geen broker keuze)
4. ❌ **Risk settings integration** (% equity/vast bedrag niet gekoppeld aan orders)
5. ❌ **systemd production setup** (geen auto-restart)
6. ❌ **End-to-end workflow testing** (nooit volledige flow doorlopen)
7. ❌ **Error handling** (strategie pauzeren bij error niet geïmplementeerd)
8. ❌ **Manual reconnect enforcement** (WebSocket reconnect is automatisch)

---

## 📋 **NIEUWE ITERATIE STRUCTUUR**

We bouwen voort op wat er is. Focus op:
- ✅ **Behoud huidige UI/UX**
- ✅ **24/7 automatisch traden**
- ✅ **Generieke strategy system**
- ✅ **Generieke broker onboarding**
- ✅ **Risk settings enforcement**
- ✅ **Veiligheidsmechanismen**

---

## 🎯 **ITERATIE 9: Strategy Registry & Selection** (NIEUW)

**Doel:** Flexibel strategy systeem - kies en configureer strategies via UI  
**Duur:** 8-10 uur  
**Prioriteit:** P0 (Critical - Razor is nu hardcoded)

### Deliverables:

#### STRATEGY-001: IStrategy Interface & BaseStrategy
**Wat:** Herstructureer bestaande strategies naar generiek interface
- ✅ Al gebouwd: `ScalpingStrategy`, `FastTestStrategy`, `VortexStrategy`, `RazorStrategy`
- 🆕 Create `IStrategy` interface in `backend/src/strategies/IStrategy.ts`
- 🆕 Create `BaseStrategy` abstract class
- 🆕 Migrate Razor strategy naar nieuwe interface
- 🆕 Document interface in `STRATEGY_DEVELOPMENT.md`

```typescript
// backend/src/strategies/IStrategy.ts
export interface IStrategy {
  id: string;
  name: string;
  description: string;
  
  // Lifecycle
  initialize(config: StrategyConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // Analysis
  analyze(candle: Candle, indicators: Indicators): Signal | null;
  
  // Risk calculation
  calculateStopLoss(entry: number, side: 'long' | 'short'): number;
  calculateTakeProfit(entry: number, side: 'long' | 'short'): number;
  
  // State
  getState(): StrategyState;
}
```

**Acceptance Criteria:**
- [ ] `IStrategy` interface compleet
- [ ] `BaseStrategy` met common logic
- [ ] Razor strategy geconverteerd
- [ ] Razor tests blijven passing
- [ ] 3 example templates (SMC, Price Action, Moving Average)

---

#### STRATEGY-002: Strategy Registry
**Wat:** Dynamisch laden en selecteren van strategies

```typescript
// backend/src/strategies/StrategyRegistry.ts
export class StrategyRegistry {
  private strategies = new Map<string, IStrategy>();
  
  register(strategy: IStrategy): void;
  get(id: string): IStrategy | null;
  list(): StrategyMetadata[];
  exists(id: string): boolean;
}
```

**Acceptance Criteria:**
- [ ] Registry kan strategies registreren
- [ ] Auto-discover strategies in `backend/src/strategies/` folder
- [ ] `GET /api/v2/strategies` endpoint - lijst van beschikbare strategies
- [ ] `GET /api/v2/strategies/:id` endpoint - strategy details
- [ ] Validation: strategy moet bestaan voor start

---

#### STRATEGY-003: Frontend Strategy Selector
**Wat:** UI component om strategy te kiezen

**Locatie:** `src/components/StrategyTradingCard.tsx` (al bestaand, uitbreiden)

```tsx
// Voeg toe aan bestaande StrategyTradingCard
<Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
  <SelectTrigger>
    <SelectValue placeholder="Kies een strategie" />
  </SelectTrigger>
  <SelectContent>
    {strategies.map(s => (
      <SelectItem key={s.id} value={s.id}>
        {s.name} - {s.description}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Acceptance Criteria:**
- [ ] Strategy dropdown toont alle registered strategies
- [ ] Huidige `selectedStrategy` state blijft werken
- [ ] Strategy selection persist naar KV store
- [ ] Disabled wanneer strategy al draait
- [ ] Tooltip met strategy beschrijving

---

#### TEST-014: Strategy Registry Tests
**Wat:** Test strategy loading en switching

**Acceptance Criteria:**
- [ ] Unit tests: registry register/get/list
- [ ] Integration tests: strategy loading from folder
- [ ] E2E tests: switch between strategies in UI
- [ ] Invalid strategy → clear error message
- [ ] Strategy not found → 404 response

**Estimated Time:** 8-10 hours total

---

## 🎯 **ITERATIE 10: Broker Selection UI** (NIEUW)

**Doel:** Generieke broker selector - kies broker via UI  
**Duur:** 6-8 uur  
**Prioriteit:** P0 (Critical - nu alleen Deribit, geen keuze)

### Deliverables:

#### BROKER-006: Broker Selector Component
**Wat:** UI component om broker te kiezen

**Locatie:** `src/components/SettingsDialog.tsx` (al bestaand, uitbreiden)

```tsx
// Nieuwe tab in SettingsDialog: "Broker"
<TabsContent value="broker">
  <Select value={selectedBroker} onValueChange={setSelectedBroker}>
    <SelectTrigger>
      <SelectValue placeholder="Kies een broker" />
    </SelectTrigger>
    <SelectContent>
      {brokers.map(b => (
        <SelectItem key={b.id} value={b.id}>
          <div className="flex items-center gap-2">
            <img src={b.logo} className="w-6 h-6" />
            {b.name}
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  
  {/* API credentials per broker */}
  <Input 
    placeholder="API Key" 
    value={credentials[selectedBroker]?.apiKey} 
  />
  <Input 
    type="password"
    placeholder="API Secret" 
    value={credentials[selectedBroker]?.apiSecret}
  />
  
  {/* Testnet toggle per broker */}
  <Switch 
    checked={useTestnet[selectedBroker]} 
    label="Testnet Mode"
  />
</TabsContent>
```

**Acceptance Criteria:**
- [ ] Broker dropdown toont alle brokers uit `BROKER_METADATA`
- [ ] Credentials per broker opgeslagen (aparte KV keys)
- [ ] Testnet toggle per broker
- [ ] "Test Connection" button (gebruikt `handleConnectTest`)
- [ ] Status indicator: connected/disconnected
- [ ] Logo's tonen per broker

---

#### BROKER-007: Backend Broker State Management
**Wat:** Track welke broker actief is

```typescript
// backend/src/brokers/BrokerManager.ts (NIEUW)
export class BrokerManager {
  private activeBroker: IBroker | null = null;
  private activeBrokerId: string | null = null;
  
  async setActiveBroker(brokerId: string, credentials: Credentials): Promise<void>;
  getActiveBroker(): IBroker | null;
  getActiveBrokerId(): string | null;
  async disconnect(): Promise<void>;
}
```

**Acceptance Criteria:**
- [ ] `BrokerManager` singleton
- [ ] Only 1 broker actief tegelijk
- [ ] Disconnect oude broker voor nieuwe connect
- [ ] State persist naar disk (`data/broker-state.json`)
- [ ] Reconcile broker on startup

---

#### BROKER-008: API Endpoints
**Wat:** Backend API voor broker management

```typescript
// Nieuwe endpoints in backend/src/api.ts
GET  /api/v2/broker/active  → huidige actieve broker
POST /api/v2/broker/connect → connect met broker
POST /api/v2/broker/disconnect → disconnect broker
```

**Acceptance Criteria:**
- [ ] `GET /api/v2/broker/active` returns broker ID + connection status
- [ ] `POST /api/v2/broker/connect` - validate broker ID, connect, return status
- [ ] `POST /api/v2/broker/disconnect` - disconnect active broker
- [ ] Validation: broker moet in whitelist zitten
- [ ] Error handling: connection failures

---

#### TEST-015: Broker Selection Tests
**Wat:** Test broker switching

**Acceptance Criteria:**
- [ ] Unit tests: BrokerManager
- [ ] Integration tests: broker connect/disconnect
- [ ] UI tests: broker selector component
- [ ] E2E tests: switch broker → strategy restart required
- [ ] Edge case: switch broker met open position → block

**Estimated Time:** 6-8 hours total

---

## 🎯 **ITERATIE 11: Risk Settings Enforcement** (NIEUW)

**Doel:** % equity en vast bedrag risk settings ECHT toepassen op orders  
**Duur:** 4-6 uur  
**Prioriteit:** P0 (Critical - UI is er, maar wordt niet gebruikt!)

### Deliverables:

#### RISK-004: Risk Settings Integration
**Wat:** Koppel UI risk settings aan `PositionSizer`

**Huidige situatie:**
- ✅ UI heeft `RiskSettings` (mode: 'percent' | 'fixed', value: number)
- ✅ `PositionSizer` kan size berekenen
- ❌ **PROBLEEM:** Risk settings worden NIET doorgegeven aan `PositionSizer`!

**Oplossing:**
```typescript
// backend/src/strategy-runner/StrategyRunner.ts
async placeEntry(signal: Signal, riskSettings: RiskSettings) {
  const balance = await broker.getBalance();
  
  let riskAmount: number;
  if (riskSettings.mode === 'percent') {
    // % equity: riskAmount = balance * (value / 100)
    riskAmount = balance.available * (riskSettings.value / 100);
  } else {
    // Vast bedrag: riskAmount = value (in USD)
    riskAmount = riskSettings.value;
  }
  
  // Calculate position size using PositionSizer
  const position = PositionSizer.calculatePositionSize({
    balance: balance.available,
    balanceCurrency: 'BTC',
    entryPrice: signal.entry,
    stopLossPrice: signal.stopLoss,
    riskPercent: (riskAmount / balance.available) * 100, // convert back to %
    currentPrice: signal.entry,
    instrument: this.instrument,
  });
  
  // Place OCO order met calculated size
  await broker.placeOCOOrder({
    ...
    amount: position.quantity,
  });
}
```

**Acceptance Criteria:**
- [ ] Risk settings doorgegeven aan backend
- [ ] `placeEntry()` gebruikt risk settings
- [ ] % equity mode → risico = balance × percentage
- [ ] Vast bedrag mode → risico = fixed USD amount
- [ ] Logging: "Using risk settings: {mode: percent, value: 5%}"
- [ ] Verify: actual loss matches risk setting (±0.5%)

---

#### RISK-005: Frontend Risk Settings Persistence
**Wat:** Persist risk settings naar backend (niet alleen KV)

```typescript
// Nieuwe API endpoints
POST /api/v2/risk-settings → opslaan risk settings
GET  /api/v2/risk-settings → ophalen risk settings
```

**Acceptance Criteria:**
- [ ] Risk settings opgeslagen in `data/risk-settings.json`
- [ ] Risk settings loaded on startup
- [ ] Risk settings toegepast op ELKE trade
- [ ] UI sync: KV + backend API

---

#### TEST-016: Risk Settings Tests
**Wat:** Verify risk enforcement werkt

**Acceptance Criteria:**
- [ ] Unit tests: risk calculation per mode
- [ ] Integration tests: place order with % equity → verify size
- [ ] Integration tests: place order with fixed amount → verify size
- [ ] Live test (testnet): 5% risk → actual loss = 5% ±0.5%
- [ ] Live test (testnet): $50 fixed → actual loss = $50 ±$1

**Estimated Time:** 4-6 hours total

---

## 🎯 **ITERATIE 12: Safety Mechanisms** (NIEUW)

**Doel:** Absolute beveiliging tegen dubbele orders, orphans, errors  
**Duur:** 6-8 uur  
**Prioriteit:** P0 (Critical - user heeft veel fees verloren!)

### Deliverables:

#### SAFETY-001: Orphan Prevention - Double Check
**Wat:** Extra layer van bescherming tegen orphan SL/TP

**Huidige situatie:**
- ✅ `placeOCOOrder()` heeft rollback
- ✅ `scanAndCleanOrphans()` draait elke 60s
- ❌ **PROBLEEM:** Tientallen SL/TP zonder entry → veel fees!

**Oplossing:**
```typescript
// backend/src/brokers/DeribitBroker.ts
async placeOCOOrder(params: PlaceOrderParams) {
  // NIEUWE CHECK: Verify NO pending orphans BEFORE placement
  const orphans = await this.detectOrphans();
  if (orphans.length > 0) {
    throw new OrderValidationError(
      `Cannot place order: ${orphans.length} orphan orders detected. Clean up first.`,
      'ORPHANS_DETECTED',
      { orphans }
    );
  }
  
  // Bestaande atomic OCO logic...
  const txId = `oco-${Date.now()}-${uuid()}`;
  const placedOrders: string[] = [];
  
  try {
    // Place entry
    const entry = await this.client.placeOrder(...);
    placedOrders.push(entry.order_id);
    
    // NIEUWE CHECK: Verify entry is FILLED or OPEN
    await this.waitForOrderConfirmation(entry.order_id, 2000); // 2s timeout
    
    // Place SL (only if entry confirmed)
    const sl = await this.client.placeOrder(...);
    placedOrders.push(sl.order_id);
    
    // NIEUWE CHECK: Verify SL has entry reference
    await this.verifyOrderLink(sl.order_id, entry.order_id);
    
    // Place TP (only if SL confirmed)
    const tp = await this.client.placeOrder(...);
    placedOrders.push(tp.order_id);
    
    // NIEUWE CHECK: Verify TP has entry reference
    await this.verifyOrderLink(tp.order_id, entry.order_id);
    
    return entry;
  } catch (error) {
    // ENHANCED ROLLBACK met verification
    await this.rollbackOrders(placedOrders, txId);
    
    // EXTRA: Verify rollback succeeded
    const remaining = await this.checkRemainingOrders(placedOrders);
    if (remaining.length > 0) {
      // CRITICAL: Send Telegram alert
      await telegram.sendCritical({
        message: `⚠️ ROLLBACK FAILED: ${remaining.length} orders still open!`,
        orders: remaining,
        transaction: txId,
      });
    }
    
    throw error;
  }
}
```

**Acceptance Criteria:**
- [ ] Pre-flight check: block placement als orphans gedetecteerd
- [ ] Order confirmation check: verify entry is live
- [ ] Link verification: verify SL/TP reference entry
- [ ] Rollback verification: check all orders canceled
- [ ] Telegram alerts bij failures
- [ ] **GUARANTEE:** Alleen complete OCO sets (entry+SL+TP) of niets!

---

#### SAFETY-002: Strategy Auto-Pause on Error
**Wat:** Pauzeer strategy bij error, ALLEEN manual restart

**Huidige situatie:**
- ❌ Strategy blijft draaien na error (gevaarlijk!)
- ❌ Geen mechanisme om errors te catchen en pauzeren

**Oplossing:**
```typescript
// backend/src/lifecycle/StrategyManager.ts
export enum StrategyLifecycleState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SIGNAL_DETECTED = 'SIGNAL_DETECTED',
  ENTERING_POSITION = 'ENTERING_POSITION',
  POSITION_OPEN = 'POSITION_OPEN',
  CLOSING = 'CLOSING',
  PAUSED = 'PAUSED',        // NIEUW
  ERROR = 'ERROR',          // NIEUW
}

async onError(error: Error, context: string): Promise<void> {
  log.error(`Strategy error in ${context}:`, error);
  
  // Transition naar ERROR state
  await this.transitionTo(StrategyLifecycleState.ERROR, {
    metadata: {
      error: error.message,
      context,
      timestamp: Date.now(),
    },
  });
  
  // Send Telegram notification
  await telegram.sendError({
    strategy: this.state.strategyName,
    error: error.message,
    context,
    action: 'Strategy PAUSED - Manual restart required',
  });
  
  // Stop strategy execution (maar behoud state)
  this.shouldAnalyze = false;
  
  log.warn(`Strategy ${this.state.strategyName} PAUSED due to error. Manual restart required.`);
}
```

**Acceptance Criteria:**
- [ ] `StrategyLifecycleState.ERROR` state toegevoegd
- [ ] `onError()` method stopt strategy execution
- [ ] Telegram alert bij error
- [ ] UI toont "ERROR" status met error message
- [ ] **ONLY manual restart mogelijk** (geen auto-resume)
- [ ] Error logs accessible via UI

---

#### SAFETY-003: Manual Reconnect Enforcement
**Wat:** Broker disconnect → ALLEEN manual reconnect

**Huidige situatie:**
- ✅ Auto-reconnect met exponential backoff
- ❌ **PROBLEEM:** User wil MANUAL reconnect control!

**Oplossing:**
```typescript
// backend/src/deribit-client.ts
export class BackendDeribitClient {
  private autoReconnectEnabled = false; // NIEUW: disabled by default
  
  enableAutoReconnect(): void {
    this.autoReconnectEnabled = true;
  }
  
  disableAutoReconnect(): void {
    this.autoReconnectEnabled = false;
  }
  
  private scheduleReconnect(): void {
    if (!this.autoReconnectEnabled) {
      log.warn('[DeribitClient] Auto-reconnect DISABLED - Manual reconnect required');
      
      // Send Telegram alert
      telegram.sendWarning({
        message: '⚠️ Broker connection lost',
        action: 'Manual reconnect required',
      });
      
      return; // STOP hier, geen auto-reconnect
    }
    
    // Bestaande auto-reconnect logic...
  }
}
```

**UI Changes:**
```tsx
// src/components/SettingsDialog.tsx
<Switch
  checked={autoReconnect}
  onCheckedChange={setAutoReconnect}
  label="Auto-reconnect (gevaarlijk, niet aanbevolen)"
/>

{connectionState === 'Disconnected' && (
  <Button onClick={handleManualReconnect}>
    Handmatig Reconnect
  </Button>
)}
```

**Acceptance Criteria:**
- [ ] Auto-reconnect DISABLED by default
- [ ] UI optie om auto-reconnect in/uit te schakelen
- [ ] Bij disconnect: Telegram alert + manual reconnect button
- [ ] Strategy STOPT bij disconnect (geen trading zonder broker)
- [ ] **GUARANTEE:** Geen trading zonder expliciete user actie

---

#### TEST-017: Safety Tests
**Wat:** Test alle veiligheidsmechanismen

**Acceptance Criteria:**
- [ ] Unit tests: orphan detection + blocking
- [ ] Integration tests: strategy pauzeren bij error
- [ ] Integration tests: manual reconnect flow
- [ ] Chaos tests: kill broker connection → verify manual restart required
- [ ] Chaos tests: simulate OCO failure → verify NO orphans
- [ ] E2E tests: full error flow (error → pause → manual restart)

**Estimated Time:** 6-8 hours total

---

## 🎯 **ITERATIE 13: Live Testing & Production Setup** (NIEUW)

**Doel:** Test alles live op Deribit testnet + productionize  
**Duur:** 8-10 uur  
**Prioriteit:** P0 (Critical - nooit live getest!)

### Deliverables:

#### LIVE-001: Deribit Testnet End-to-End Tests
**Wat:** Volledige workflow testen met echte API

**Test Scenario's:**
1. **Broker Connection**
   - [ ] Connect Deribit testnet
   - [ ] Verify balance visible
   - [ ] Test disconnect + manual reconnect

2. **Strategy Selection**
   - [ ] Select Razor strategy
   - [ ] Configure risk settings (5% equity)
   - [ ] Start strategy → verify analyzing state

3. **OCO Order Placement**
   - [ ] Wait for signal
   - [ ] Verify entry + SL + TP placed atomically
   - [ ] Check Deribit UI: 3 orders visible
   - [ ] Verify labels: `entry-oco-{txId}`, `sl-oco-{txId}`, `tp-oco-{txId}`

4. **Position Management**
   - [ ] Entry filled → verify position open state
   - [ ] Strategy analyzing PAUSED
   - [ ] UI shows open position details

5. **Stop Loss Hit**
   - [ ] Manually trigger SL (market order)
   - [ ] Verify position closed
   - [ ] Verify actual loss = 5% ±0.5%
   - [ ] Strategy analyzing RESUMED

6. **Error Scenarios**
   - [ ] Simulate API error → verify strategy pauses
   - [ ] Check Telegram alert received
   - [ ] Manual restart required

7. **Orphan Prevention**
   - [ ] Attempt to place order with orphans detected → blocked
   - [ ] Orphan cleanup runs → orphans canceled
   - [ ] Place order again → succeeds

**Acceptance Criteria:**
- [ ] 10+ successful full-cycle trades
- [ ] 100% OCO success rate (no orphans)
- [ ] Actual risk matches target (5% ±0.5%)
- [ ] Error handling works (pause + manual restart)
- [ ] Telegram notifications received
- [ ] All UI states correct

---

#### LIVE-002: systemd Production Setup
**Wat:** Auto-restart + logging + monitoring

```bash
# /etc/systemd/system/tradebaas-backend.service
[Unit]
Description=Tradebaas 24/7 Trading Backend
After=network.target

[Service]
Type=simple
User=tradebaas
WorkingDirectory=/opt/tradebaas/backend
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5s

# Resource limits
MemoryLimit=512M
CPUQuota=100%

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tradebaas-backend

# Watchdog
WatchdogSec=60s

[Install]
WantedBy=multi-user.target
```

**Acceptance Criteria:**
- [ ] systemd service file created
- [ ] Auto-restart on crash (tested met `kill -9`)
- [ ] Health check integration (watchdog)
- [ ] Logs accessible via `journalctl -u tradebaas-backend`
- [ ] Service enabled on boot
- [ ] 24-hour uptime test

---

#### LIVE-003: Deployment Documentation
**Wat:** Complete deployment guide

**File:** `DOCS/PRODUCTION_DEPLOYMENT.md` (update bestaand)

**Content:**
- Prerequisites (Node.js, npm, credentials)
- Installation steps
- Environment configuration
- systemd setup
- Nginx reverse proxy (SSL)
- Firewall configuration
- Monitoring setup (Prometheus + Grafana)
- Backup strategy
- Recovery procedures
- Troubleshooting guide

**Acceptance Criteria:**
- [ ] Step-by-step deployment guide
- [ ] All environment variables documented
- [ ] Recovery procedures tested
- [ ] Rollback plan documented

---

#### TEST-018: Production Validation
**Wat:** Final production checks

**Checklist:**
```bash
# Pre-deployment
✓ All tests passing (unit + integration + e2e)
✓ TypeScript compile errors: 0
✓ Linting errors: 0
✓ npm audit: 0 critical vulnerabilities
✓ Test coverage: >80% (critical paths)

# Deployment
✓ systemd service enabled
✓ Auto-restart works (kill -9 test)
✓ Health check returns 200
✓ Logs structured (JSON format)
✓ Metrics exposed (/metrics)
✓ SSL certificate valid
✓ Firewall configured

# Post-deployment
✓ 24-hour stability test (no crashes)
✓ Broker connection stable
✓ Telegram alerts working
✓ UI accessible (https://app.tradebazen.nl)
✓ WebSocket realtime updates working
✓ Risk settings enforced (verified with 10 trades)
```

**Acceptance Criteria:**
- [ ] All checklist items ✓
- [ ] 7-day production run (uptime >99%)
- [ ] User acceptance testing
- [ ] Team sign-off

**Estimated Time:** 8-10 hours total

---

## 📊 **TOTAAL OVERZICHT**

| Iteratie | Doel | Uren | Status | Prioriteit |
|----------|------|------|--------|------------|
| **9** | Strategy Registry & Selection | 8-10 | 🆕 NIEUW | P0 |
| **10** | Broker Selection UI | 6-8 | 🆕 NIEUW | P0 |
| **11** | Risk Settings Enforcement | 4-6 | 🆕 NIEUW | P0 |
| **12** | Safety Mechanisms | 6-8 | 🆕 NIEUW | P0 |
| **13** | Live Testing & Production | 8-10 | 🆕 NIEUW | P0 |
| **TOTAAL** | | **32-42 uur** | | |

---

## 🎯 **EXECUTION PLAN**

### **Week 1 (16-20 uur):**
- **Dag 1-2:** Iteratie 9 - Strategy Registry (8-10u)
- **Dag 3:** Iteratie 10 - Broker Selection (6-8u)

### **Week 2 (16-22 uur):**
- **Dag 4:** Iteratie 11 - Risk Settings (4-6u)
- **Dag 5-6:** Iteratie 12 - Safety Mechanisms (6-8u)
- **Dag 7-8:** Iteratie 13 - Live Testing (8-10u)

### **Totaal: 2 weken fulltime of 4 weken parttime**

---

## 🚀 **RESULTAAT (Praktisch)**

Na deze 5 iteraties:

✅ **User opent tool** → werkt  
✅ **Kiest broker** (Deribit) via settings → werkt  
✅ **Login met credentials** → werkt  
✅ **Ziet live verbinding** → werkt  
✅ **Selecteert strategie** (Razor/Scalping/Vortex) → **NIEUW**  
✅ **Stelt max trades in** (default: 1) → werkt  
✅ **Kiest risk mode** (% equity of vast bedrag) → **GEFIXT**  
✅ **Start strategie handmatig** → werkt  
✅ **Live checkpoints zien** → werkt  
✅ **Tool beveiligd** tegen orphans → **GEFIXT**  
✅ **Errors simpel zien** + Telegram → werkt  
✅ **Strategie pauzeert bij error** → **NIEUW**  
✅ **Alleen handmatig herstart na error/disconnect** → **GEFIXT**  
✅ **Ziet ALTIJD entry + SL + TP gekoppeld** → **GEFIXT**  

---

## 💬 **COMMUNICATIE TIJDENS BOUWEN**

### **Per Iteratie:**

1. **Start:** Agent toont plan + acceptance criteria
2. **Build:** User heeft **live toegang** tot tool (lokaal runnen)
3. **Test:** Agent runt tests + toont output
4. **Demo:** Agent demonstreert feature in tool
5. **Feedback:** User test live + geeft feedback
6. **Next:** Agent wacht op approval: "Ga door naar volgende iteratie"

### **Live Testing Setup:**

```bash
# Terminal 1: Backend (hot-reload)
cd backend
npm run dev

# Terminal 2: Frontend (hot-reload)
cd ..
npm run dev

# Tool accessible at: http://localhost:5173
```

**User kan ALTIJD:**
- Tool openen in browser
- Settings aanpassen
- Strategies testen
- Errors zien
- Logs bekijken

---

## 📋 **ACCEPTANCE CRITERIA (MVP Production-Ready)**

### **Functional:**
- ✅ Tool draait 24/7 zonder crashes (7-day test)
- ✅ Max 1 strategy actief (enforced)
- ✅ Meerdere strategies beschikbaar (min. 3: Razor, Scalping, Vortex)
- ✅ Broker selectie werkt (Deribit + 14 andere in registry)
- ✅ Risk settings geëxecuteerd (% equity EN vast bedrag)
- ✅ Entry + SL + TP ALTIJD gekoppeld (100% OCO success rate)
- ✅ Errors pauzeren strategy (manual restart)
- ✅ Disconnect = manual reconnect (geen auto-reconnect)

### **Safety:**
- ✅ ZERO orphan orders (100 trades test)
- ✅ ZERO dubbele entries (concurrent request test)
- ✅ All errors go to Telegram
- ✅ Strategy stopt bij kritieke errors

### **Testing:**
- ✅ 10+ live testnet trades (all successful)
- ✅ Actual risk = target risk ±0.5%
- ✅ All unit tests passing
- ✅ All integration tests passing
- ✅ All E2E tests passing

### **Production:**
- ✅ systemd service enabled
- ✅ Auto-restart works
- ✅ 7-day uptime >99%
- ✅ Logs structured (JSON)
- ✅ Metrics exposed
- ✅ SSL configured
- ✅ Backups automated

---

## 🎉 **KLAAR VOOR PRODUCTIE!**

Na Iteratie 13: **LIVE TRADING APPROVED** 🚀

---

**Status:** READY TO START  
**Next Action:** User approval → Start Iteratie 9  
**Owner:** Development Team

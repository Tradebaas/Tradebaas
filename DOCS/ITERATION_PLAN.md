# Tradebaas 24/7 MVP - Gedetailleerd Iteratieplan

**Project Start:** 4 November 2025  
**Basis:** `tradebaas-complete-backup-20251103-221809.tar.gz`  
**Doel:** Server-side 24/7 trading tool met OCO-orders, exact risicobeheer, en crash-recovery

---

## 🎯 Iteratie 1 — Cold Audit & Scope Lock

### Overzicht
**Doel:** Volledige audit van huidige codebase zonder code te wijzigen  
**Verwachte Duur:** 2-4 uur  
**Status:** 🔵 READY TO START

### Rollen & Verantwoordelijkheden

#### Lead Architect (Primary)
- **Verantwoordelijkheid:** Overzicht hele codebase, architectuurpatronen identificeren
- **Deliverables:**
  - `DOCS/COLD_AUDIT.md` - Complete audit met technische staat
  - `DOCS/ARCHITECTURE_ANALYSIS.md` - Huidige vs gewenste architectuur
- **Exit Criteria:** Alle modules, dependencies, en data flows gedocumenteerd

#### Backend Engineer (Support)
- **Verantwoordelijkheid:** Backend code analysis (orchestrator, strategy-service, runners)
- **Deliverables:**
  - Backend module inventory in COLD_AUDIT.md
  - Identificeer duplicatie en technical debt
- **Exit Criteria:** Alle backend files gecategoriseerd (keep/refactor/delete)

#### Quant Engineer (Support)
- **Verantwoordelijkheid:** Strategy & indicator analysis
- **Deliverables:**
  - Strategy logic audit (razor-executor, ema-rsi-scalper, etc.)
  - Indicator berekeningen validatie
- **Exit Criteria:** Strategie-logica gedocumenteerd, bugs/issues geïdentificeerd

#### Trading/Broker Engineer (Support)
- **Verantwoordelijkheid:** Broker integration analysis (Deribit)
- **Deliverables:**
  - Broker API usage audit
  - OCO/OTOCO implementatie status
- **Exit Criteria:** Huidige order flow gedocumenteerd met gaps

#### QA Lead (Support)
- **Verantwoordelijkheid:** Test coverage analyse
- **Deliverables:**
  - `DOCS/BACKLOG.md` - Prioritized backlog (Now/Next/Later)
  - `DOCS/DOD_MVP.md` - Definition of Done checklist
  - `tests/README.md` - Test plan skeleton
- **Exit Criteria:** Test strategie gedefinieerd voor alle iteraties

#### Security Engineer (Review)
- **Verantwoordelijkheid:** Security audit
- **Deliverables:**
  - Security gaps in COLD_AUDIT.md
  - Credentials management review
- **Exit Criteria:** Alle security risks gedocumenteerd

### Takenlijst

#### Fase 1.1: Codebase Inventory (Lead Architect + Backend Engineer)
- [ ] Scan alle directories en identificeer duplicaten
- [ ] Map alle TypeScript/JavaScript files
- [ ] Identificeer orphaned files (niet geïmporteerd)
- [ ] Check package.json dependencies (frontend + backend)
- [ ] Document huidige folder structuur vs gewenste structuur

#### Fase 1.2: Module Analysis (Alle Engineers)
- [ ] **Backend Engineer:** Orchestrator, strategy-service, state-manager
- [ ] **Quant Engineer:** Strategy executors, indicator calculations
- [ ] **Trading Engineer:** Broker adapters, order management
- [ ] **Security Engineer:** Credentials, API keys, validation
- [ ] Document elk module met: purpose, dependencies, state, issues

#### Fase 1.3: Technical Debt Identification (Lead Architect)
- [ ] Root cause analysis van huidige bugs (EMA Fast null, spam logs)
- [ ] Identificeer race conditions
- [ ] Document compilation/caching issues (TSX)
- [ ] List inconsistente patterns (async/await, error handling)
- [ ] Identify tight coupling en missing abstractions

#### Fase 1.4: Documentation Creation (QA Lead + Lead Architect)
- [ ] Create `DOCS/COLD_AUDIT.md` met:
  - Executive summary
  - Module inventory (tabel met status)
  - Technical debt (prioritized)
  - Root causes van huidige issues
  - Recommendations
- [ ] Create `DOCS/BACKLOG.md` met:
  - NOW (Iteratie 2-3)
  - NEXT (Iteratie 4-5)
  - LATER (Iteratie 6-8)
- [ ] Create `DOCS/DOD_MVP.md` met:
  - Acceptance criteria per iteratie
  - Test requirements
  - Performance benchmarks
  - Security checklist
- [ ] Create `tests/README.md` met:
  - Test strategie (unit/integration/e2e)
  - Mock requirements
  - CI/CD pipeline plan

### Exit Criteria (Iteratie 1)
- ✅ Geen enkele regel code gewijzigd
- ✅ `DOCS/COLD_AUDIT.md` compleet (min. 500 regels)
- ✅ `DOCS/BACKLOG.md` compleet met prioriteiten
- ✅ `DOCS/DOD_MVP.md` compleet met checklists
- ✅ `tests/README.md` test plan skeleton
- ✅ Alle huidige bugs geïdentificeerd met root causes
- ✅ Team alignment op scope Iteratie 2

### Test Plan (Iteratie 1)
- **Geen code tests** - alleen documentatie review
- **Review checklist:**
  - [ ] Audit document peer reviewed door 2+ engineers
  - [ ] Backlog prioriteiten goedgekeurd door Lead Architect
  - [ ] DoD criteria realistisch en meetbaar
  - [ ] Test plan executable (tools/frameworks defined)

---

## 🎯 Iteratie 2 — Orchestrator & Runner Stabilisatie

### Overzicht
**Doel:** Stabiele 24/7 server-runtime zonder crashes  
**Verwachte Duur:** 4-6 uur → Actual: 10 uur  
**Status:** ✅ COMPLETE (2025-01-20)

### Rollen & Verantwoordelijkheden

#### Backend Engineer (Primary)
- **Verantwoordelijkheid:** Orchestrator hardening
- **Deliverables:**
  - Harden `backend/src/orchestrator/*`
  - Implement health checks
  - Graceful shutdown
  - Retry logic
- **Exit Criteria:** Orchestrator draait 24+ uur zonder crash

#### SRE/DevOps Engineer (Primary)
- **Verantwoordelijkheid:** Runtime monitoring & systemd
- **Deliverables:**
  - systemd service configuration
  - Health endpoint (`/health`)
  - Log aggregation setup
  - Process monitoring
- **Exit Criteria:** Service auto-restarts, health checks pass

#### QA Lead (Primary)
- **Verantwoordelijkheid:** Test orchestrator stability
- **Deliverables:**
  - Orchestrator start/stop tests
  - Crash recovery tests
  - Load tests (100+ ticker events/sec)
- **Exit Criteria:** All tests green, 99.9% uptime in 24h test

#### Lead Architect (Review)
- **Verantwoordelijkheid:** ADR documentation
- **Deliverables:**
  - `DOCS/ADR/0001-orchestrator-runtime.md`
- **Exit Criteria:** ADR approved

### Takenlijst

#### Fase 2.1: Health Checks (Backend + SRE)
- [ ] Implement `/health` endpoint met:
  - [ ] Orchestrator status
  - [ ] WebSocket connection status
  - [ ] Memory usage
  - [ ] Active strategy count
  - [ ] Last heartbeat timestamp
- [ ] Add `/ready` endpoint voor startup checks
- [ ] systemd watchdog integration

#### Fase 2.2: Graceful Shutdown (Backend)
- [ ] SIGTERM handler
- [ ] Close WebSocket connections cleanly
- [ ] Flush pending state updates
- [ ] Cancel pending orders (optional flag)
- [ ] Max shutdown time: 10 seconds

#### Fase 2.3: Retry Logic (Backend)
- [ ] Exponential backoff voor WebSocket reconnect
- [ ] Retry failed state writes (max 3x)
- [ ] Circuit breaker voor Deribit API
- [ ] Dead letter queue voor failed tasks

#### Fase 2.4: Queue Stability (Backend)
- [ ] Idempotent queue operations
- [ ] Status transitions: PENDING → RUNNING → COMPLETED/FAILED
- [ ] Prevent duplicate processing
- [ ] Queue persistence (filesystem or Redis)

#### Fase 2.5: Tests (QA)
- [ ] Unit tests: health check logic
- [ ] Integration tests:
  - [ ] Orchestrator start → health OK
  - [ ] Graceful shutdown completes in <10s
  - [ ] WebSocket reconnect after disconnect
  - [ ] State persistence after crash
- [ ] Load test: 1000 ticker events → no memory leak
- [ ] Chaos test: kill -9 → auto-restart → state synced

#### Fase 2.6: Documentation (Lead Architect)
- [ ] `DOCS/ADR/0001-orchestrator-runtime.md`:
  - [ ] Context: waarom orchestrator pattern
  - [ ] Decision: health checks + graceful shutdown
  - [ ] Consequences: latency, complexity
  - [ ] Alternatives considered

### Exit Criteria (Iteratie 2)
- ✅ Orchestrator draait 24 uur zonder crash
- ✅ Health endpoint returns 200
- ✅ Graceful shutdown werkt (<10s)
- ✅ WebSocket reconnect binnen 5s
- ✅ All integration tests green
- ✅ ADR-0001 documented
- ✅ No memory leaks (valgrind/heap snapshot)

### Test Plan (Iteratie 2)
```bash
# Unit tests
pnpm test backend/src/orchestrator

# Integration tests
pnpm test:integration orchestrator

# Stability test (24h)
systemctl start tradebaas-backend
watch -n 60 'curl http://localhost:3000/health'

# Chaos test
kill -9 $(pidof node)
sleep 5
systemctl status tradebaas-backend # should be running

# Load test
artillery run tests/load/ticker-flood.yml
```

---

## 🎯 Iteratie 3 — Deribit Adapter + OCO/OTOCO Lifecycle

### Overzicht
**Doel:** Werkende broker-communicatie met OCO-orders  
**Verwachte Duur:** 6-8 uur  
**Status:** 🔵 READY TO START (Awaiting User Approval)

### Rollen & Verantwoordelijkheden

#### Trading/Broker Engineer (Primary)
- **Verantwoordelijkheid:** OCO/OTOCO implementation
- **Deliverables:**
  - Harden `backend/src/brokers/DeribitBroker.ts`
  - Entry + SL + TP atomic placement
  - Orphan order cleanup
  - Leverage validation (≤50x)
- **Exit Criteria:** 100% OCO success rate in tests

#### Backend Engineer (Support)
- **Verantwoordelijkheid:** Error handling & rollback
- **Deliverables:**
  - Rollback logic bij failed OCO
  - State consistency checks
- **Exit Criteria:** No orphan orders after errors

#### QA Lead (Primary)
- **Verantwoordelijkheid:** OCO lifecycle testing
- **Deliverables:**
  - Unit tests: order validation
  - Integration tests: full OCO flow
  - Error tests: rollback scenarios
- **Exit Criteria:** All OCO tests green

#### Lead Architect (Review)
- **Verantwoordelijkheid:** ADR documentation
- **Deliverables:**
  - `DOCS/ADR/0002-otoco-lifecycle.md`
- **Exit Criteria:** ADR approved

### Takenlijst

#### Fase 3.1: Order Validation (Trading Engineer)
- [ ] Validate quantity (min/max, lot size)
- [ ] Validate price (tick size)
- [ ] Validate leverage (≤50x)
- [ ] Validate margin requirements
- [ ] Pre-flight checks before submission

#### Fase 3.2: OCO Placement (Trading Engineer)
- [ ] Atomic placement: entry → SL + TP
- [ ] Use Deribit `edit_order_by_label` for linking
- [ ] Transaction ID tracking
- [ ] Timeout: 5 seconds max
- [ ] Rollback on any failure

#### Fase 3.3: Orphan Cleanup (Trading Engineer + Backend)
- [ ] Detect orphan orders (no position, no parent)
- [ ] Periodic scan (every 1 min)
- [ ] Cancel orphans with warning log
- [ ] Telegram alert on orphan detected

#### Fase 3.4: Error Handling (Backend Engineer)
- [ ] Rollback logic:
  - [ ] Cancel SL if TP fails
  - [ ] Cancel entry if SL/TP fails
  - [ ] Log all partial states
- [ ] Retry strategy: 3x with exponential backoff
- [ ] Circuit breaker: disable strategy after 5 failures

#### Fase 3.5: Tests (QA)
- [ ] Unit tests:
  - [ ] Order validation (valid/invalid inputs)
  - [ ] Quantity calculation
  - [ ] Leverage checks
- [ ] Integration tests:
  - [ ] Full OCO lifecycle (entry → SL + TP → fill)
  - [ ] Rollback on SL failure
  - [ ] Rollback on TP failure
  - [ ] Orphan cleanup
- [ ] Error tests:
  - [ ] Network timeout during placement
  - [ ] Insufficient margin
  - [ ] Invalid instrument

#### Fase 3.6: Documentation (Lead Architect)
- [ ] `DOCS/ADR/0002-otoco-lifecycle.md`:
  - [ ] Context: waarom OCO pattern
  - [ ] Decision: atomic placement + rollback
  - [ ] Consequences: complexity, latency
  - [ ] Alternatives: separate orders (rejected)

### Exit Criteria (Iteratie 3)
- ✅ 100% OCO success in 100 test trades
- ✅ Zero orphan orders
- ✅ Rollback works in all error scenarios
- ✅ Leverage never exceeds 50x
- ✅ All integration tests green
- ✅ ADR-0002 documented

### Test Plan (Iteratie 3)
```bash
# Unit tests
pnpm test backend/src/brokers/DeribitBroker.test.ts

# Integration tests (testnet)
DERIBIT_ENV=test pnpm test:integration broker

# Error simulation
pnpm test tests/chaos/broker-failures.test.ts

# Manual verification (testnet)
curl -X POST /api/strategy/start -d '{...}'
# Check Deribit UI: entry + SL + TP visible
```

---

## 🎯 Iteratie 4 — Risk Engine + Strategy Registry

### Overzicht
**Doel:** Exact risicomanagement + flexibel strategy systeem  
**Verwachte Duur:** 8-10 uur  
**Status:** ⚪ WAITING (na Iteratie 3)

### Rollen & Verantwoordelijkheden

#### Quant Engineer (Primary)
- **Verantwoordelijkheid:** Position sizing algorithm
- **Deliverables:**
  - `backend/src/risk/PositionSizer.ts`
  - Risk calculation: balance × risk% / SL distance
  - Leverage minimization
- **Exit Criteria:** Accuracy ≤0.1% deviation

#### Trading/Broker Engineer (Support)
- **Verantwoordelijkheid:** Integration with broker
- **Deliverables:**
  - Pass calculated size to DeribitBroker
  - Validate against broker limits
- **Exit Criteria:** Sizes accepted by broker

#### QA Lead (Primary)
- **Verantwoordelijkheid:** Accuracy testing
- **Deliverables:**
  - Unit tests: position size calculations
  - Boundary tests: edge cases
- **Exit Criteria:** 1000+ test cases pass

#### Lead Architect (Review)
- **Verantwoordelijkability:** ADR documentation
- **Deliverables:**
  - `DOCS/ADR/0003-risk-model.md`
- **Exit Criteria:** ADR approved

### Takenlijst

#### Fase 4.1: Position Sizer Implementation (Quant)
- [ ] Create `PositionSizer.ts`:
  ```typescript
  calculatePositionSize(
    balance: number,
    riskPercent: number,
    entryPrice: number,
    stopLossPrice: number
  ): { quantity: number, leverage: number }
  ```
- [ ] Formula: `quantity = (balance × riskPercent) / |entryPrice - stopLossPrice|`
- [ ] Minimize leverage (prefer higher margin)
- [ ] Round to lot size
- [ ] Validate min/max position size

#### Fase 4.2: Leverage Optimization (Quant)
- [ ] Calculate required margin
- [ ] Choose lowest leverage ≤50x
- [ ] Warn if leverage >10x
- [ ] Reject if insufficient balance

#### Fase 4.3: Strategy Interface & Registry (Backend Engineer)
- [ ] Create `IStrategy` interface:
  ```typescript
  interface IStrategy {
    name: string;
    instrument: string;
    analyze(candle: Candle, indicators: Indicators): Signal | null;
    calculateStopLoss(entry: number, side: 'long' | 'short'): number;
    calculateTakeProfit(entry: number, side: 'long' | 'short'): number;
  }
  ```
- [ ] Create `StrategyRegistry` class
- [ ] Register Razor strategy
- [ ] Create strategy templates (SMC, Price Action)
- [ ] API endpoint: `GET /api/strategies` → list available
- [ ] API endpoint: `POST /api/strategy/start` accepts `strategyName`

#### Fase 4.4: Integration (Trading Engineer)
- [ ] Pass PositionSizer result to DeribitBroker
- [ ] Pre-validate with broker limits
- [ ] Log calculated vs actual size
- [ ] Integrate with all IStrategy implementations

#### Fase 4.5: Tests (QA)
- [ ] Unit tests:
  - [ ] Risk 5%, balance $1000, SL 1% → quantity correct
  - [ ] Edge case: SL = entry (should error)
  - [ ] Edge case: SL too tight → max leverage exceeded
  - [ ] 1000 random scenarios → accuracy ≤0.1%
- [ ] Integration tests:
  - [ ] Full trade with calculated size → SL hit → loss = 5% balance
- [ ] Strategy tests:
  - [ ] Razor strategy loads and runs
  - [ ] Custom strategy (SMC template) loads correctly
  - [ ] Switch between strategies works
  - [ ] Invalid strategy name → clear error

#### Fase 4.6: Documentation (Lead Architect)
- [ ] `DOCS/ADR/0003-risk-model-and-strategy-architecture.md`:
  - [ ] Context: waarom fixed % risk, waarom IStrategy interface
  - [ ] Decision: size based on SL distance, registry pattern
  - [ ] Consequences: variable position sizes, flexible strategies
  - [ ] Alternatives: fixed contracts (rejected), hardcoded strategies (rejected)
  - [ ] Future: JSON config, UI builder
- [ ] `DOCS/STRATEGY_DEVELOPMENT.md`:
  - [ ] IStrategy interface explanation
  - [ ] Step-by-step guide to create custom strategy
  - [ ] 3 examples: indicator-based, SMC, price action
  - [ ] How to register strategy
  - [ ] Testing custom strategies

### Exit Criteria (Iteratie 4)
- ✅ Accuracy ≤0.1% deviation in 1000 tests
- ✅ Leverage never exceeds 50x
- ✅ Actual loss matches expected loss (±0.5%)
- ✅ All unit tests green
- ✅ Strategy Registry working (can load multiple strategies)
- ✅ API endpoints for strategy selection working
- ✅ ADR-0003 documented
- ✅ STRATEGY_DEVELOPMENT.md complete

### Test Plan (Iteratie 4)
```bash
# Unit tests
pnpm test backend/src/risk/PositionSizer.test.ts

# Accuracy test
pnpm test tests/accuracy/risk-calculation.test.ts

# Live test (testnet)
# Place trade → hit SL → verify loss = 5% ± 0.5%
```

---

## 🎯 Iteratie 5 — Single-Position Guard + Lifecycle

### Overzicht
**Doel:** Garandeer max 1 open positie  
**Verwachte Duur:** 3-4 uur  
**Status:** ⚪ WAITING (na Iteratie 4)

### Rollen & Verantwoordelijkheden

#### Backend Engineer (Primary)
- **Verantwoordelijkheid:** Position guard implementation
- **Deliverables:**
  - Single position enforcement
  - Lifecycle state machine
- **Exit Criteria:** No double positions possible

#### Trading/Broker Engineer (Support)
- **Verantwoordelijkheid:** Broker position sync
- **Deliverables:**
  - Query open positions from broker
  - Reconcile with local state
- **Exit Criteria:** Local state = broker state

#### QA Lead (Primary)
- **Verantwoordelijkheid:** Lifecycle testing
- **Deliverables:**
  - State transition tests
  - Race condition tests
- **Exit Criteria:** All lifecycle tests green

### Takenlijst

#### Fase 5.1: Position Guard (Backend)
- [ ] Check open positions before entry
- [ ] Block if position exists
- [ ] Log rejection reason
- [ ] Expose via API: `canOpenPosition()`

#### Fase 5.2: Lifecycle State Machine (Backend)
- [ ] States: ANALYZING → SIGNAL → ENTRY → POSITION_OPEN → CLOSED → ANALYZING
- [ ] Pause analyzing when position open
- [ ] Resume analyzing after position closed
- [ ] Persist state across restarts

#### Fase 5.3: Broker Reconciliation (Trading Engineer)
- [ ] Query Deribit positions on startup
- [ ] Compare with local state
- [ ] Warn on mismatch
- [ ] Option: auto-close unknown positions

#### Fase 5.4: Tests (QA)
- [ ] Unit tests:
  - [ ] canOpenPosition() when no position → true
  - [ ] canOpenPosition() when position exists → false
- [ ] Integration tests:
  - [ ] Full lifecycle: analyze → signal → entry → open → close → analyze
  - [ ] Pause/resume works correctly
- [ ] Race condition test:
  - [ ] Simulate 2 simultaneous entry attempts → only 1 succeeds

#### Fase 5.5: Documentation (Lead Architect)
- [ ] Update `DOCS/ARCHITECTURE_OVERVIEW.md` with lifecycle diagram

### Exit Criteria (Iteratie 5)
- ✅ No double positions in 1000 test cycles
- ✅ Lifecycle transitions correct
- ✅ State persisted across restart
- ✅ All integration tests green

### Test Plan (Iteratie 5)
```bash
# Lifecycle test
pnpm test tests/integration/lifecycle.test.ts

# Race condition test
pnpm test tests/chaos/race-conditions.test.ts
```

---

## 🎯 Iteratie 6 — Persistentie & Crash-Recovery

### Overzicht
**Doel:** 24/7 runtime met crash recovery  
**Verwachte Duur:** 4-6 uur  
**Status:** ⚪ WAITING (na Iteratie 5)

### Rollen & Verantwoordelijkheden

#### Backend Engineer (Primary)
- **Verantwoordelijkheid:** State persistence
- **Deliverables:**
  - State store (JSON/SQLite/Redis)
  - Crash recovery logic
- **Exit Criteria:** Zero state loss after crash

#### SRE/DevOps Engineer (Primary)
- **Verantwoordelijkheid:** systemd + monitoring
- **Deliverables:**
  - systemd service with auto-restart
  - Health monitoring
  - Log rotation
- **Exit Criteria:** Service runs 7+ days without manual intervention

#### QA Lead (Primary)
- **Verantwoordelijkheid:** Crash testing
- **Deliverables:**
  - Kill → restart → state sync tests
  - Long-running stability tests
- **Exit Criteria:** 100% recovery rate

### Takenlijst

#### Fase 6.1: State Store (Backend)
- [ ] Choose: JSON file vs SQLite vs Redis
- [ ] Schema: strategy, instrument, orders, positions, balance
- [ ] Write on every state change (async)
- [ ] Atomic writes (temp file + rename)
- [ ] Backup every 1 hour

#### Fase 6.2: Crash Recovery (Backend)
- [ ] On startup: read state file
- [ ] Reconcile with broker:
  - [ ] Open positions → update local state
  - [ ] Orphan orders → cancel or adopt
- [ ] Resume strategy if was active
- [ ] Max recovery time: 30 seconds

#### Fase 6.3: systemd Service (SRE)
- [ ] Create `/etc/systemd/system/tradebaas-backend.service`
- [ ] Restart policy: always, delay 5s
- [ ] Resource limits: memory, CPU
- [ ] Log to journald
- [ ] Enable watchdog

#### Fase 6.4: Health Monitoring (SRE)
- [ ] Prometheus metrics endpoint `/metrics`
- [ ] Grafana dashboard (optional)
- [ ] Alert if health fails 3x in 5 min

#### Fase 6.5: Tests (QA)
- [ ] Unit tests: state serialization/deserialization
- [ ] Integration tests:
  - [ ] Write state → kill → restart → state matches
  - [ ] Position open → kill → restart → position still tracked
- [ ] Chaos tests:
  - [ ] SIGKILL every 10 min for 1 hour → no state loss
  - [ ] Disk full → graceful degradation

#### Fase 6.6: Documentation (Lead Architect)
- [ ] Update `DOCS/DEPLOYMENT.md` with systemd setup
- [ ] Create `DOCS/RECOVERY.md` with manual recovery steps

### Exit Criteria (Iteratie 6)
- ✅ Zero state loss in 100 crash tests
- ✅ Service runs 7 days without manual restart
- ✅ Recovery time <30s
- ✅ All crash tests green
- ✅ systemd service active

### Test Plan (Iteratie 6)
```bash
# Crash recovery test
pnpm test tests/chaos/crash-recovery.test.ts

# Long-running test (7 days)
systemctl start tradebaas-backend
# Monitor logs, health, crashes
# Report: uptime, crashes, recoveries

# Manual test
systemctl start tradebaas-backend
# Open position
kill -9 $(pidof node)
sleep 10
systemctl status tradebaas-backend
# Verify position still tracked
```

---

## 🎯 Iteratie 7 — Frontend Bridge & Status Modal

### Overzicht
**Doel:** UI toont realtime status, geen trading  
**Verwachte Duur:** 4-5 uur  
**Status:** ⚪ WAITING (na Iteratie 6)

### Rollen & Verantwoordelijkheden

#### Frontend Engineer (Primary)
- **Verantwoordelijkheid:** UI implementation
- **Deliverables:**
  - Status modal with realtime updates
  - Controls: start/stop strategy
- **Exit Criteria:** UI reflects backend state

#### Backend Engineer (Support)
- **Verantwoordelijkheid:** API endpoints
- **Deliverables:**
  - `/api/strategy/status`
  - `/api/strategy/analysis`
  - `/api/strategy/start` `/stop`
- **Exit Criteria:** API documented in OpenAPI

#### QA Lead (Primary)
- **Verantwoordelijkheid:** E2E testing
- **Deliverables:**
  - Playwright tests
  - Mock backend for UI tests
- **Exit Criteria:** All E2E tests green

### Takenlijst

#### Fase 7.1: API Endpoints (Backend)
- [ ] GET `/api/strategy/status` → active strategies
- [ ] GET `/api/strategy/analysis/:id` → live analysis state
- [ ] POST `/api/strategy/start` → start strategy
- [ ] POST `/api/strategy/stop` → stop strategy
- [ ] WebSocket `/ws/analysis` → realtime updates

#### Fase 7.2: Status Modal (Frontend)
- [ ] Show: strategy name, instrument, status
- [ ] Show: current price, indicators (EMA, RSI, volatility)
- [ ] Show: signal type, strength, confidence
- [ ] Show: checkpoints (momentum, volatility, RSI)
- [ ] Update every 1s via WebSocket

#### Fase 7.3: Controls (Frontend)
- [ ] Start button → POST /api/strategy/start
- [ ] Stop button → POST /api/strategy/stop
- [ ] Disable controls when loading
- [ ] Show error toast on failure

#### Fase 7.4: Tests (QA)
- [ ] Unit tests: React components
- [ ] Integration tests: API calls
- [ ] E2E tests (Playwright):
  - [ ] Open app → see status modal
  - [ ] Click start → strategy starts
  - [ ] See realtime updates
  - [ ] Click stop → strategy stops

#### Fase 7.5: Documentation (Lead Architect)
- [ ] Update `DOCS/FRONTEND_INTEGRATION.md` with API docs
- [ ] Add OpenAPI spec: `DOCS/openapi.yaml`

### Exit Criteria (Iteratie 7)
- ✅ UI shows realtime analysis
- ✅ Start/stop controls work
- ✅ No trading actions in frontend
- ✅ All E2E tests green
- ✅ API documented

### Test Plan (Iteratie 7)
```bash
# Unit tests
pnpm test src/components/AnalysisDetailsDialog.test.tsx

# E2E tests
pnpm test:e2e tests/e2e/status-modal.spec.ts

# Manual test
npm run dev
# Open http://localhost:5173
# Click start → verify backend starts
# Check realtime updates
```

---

## 🎯 Iteratie 8 — Observability, Telegram, QA Hardening

### Overzicht
**Doel:** Production-ready met monitoring & notifications  
**Verwachte Duur:** 5-7 uur  
**Status:** ⚪ WAITING (na Iteratie 7)

### Rollen & Verantwoordelijkheden

#### SRE/DevOps Engineer (Primary)
- **Verantwoordelijkheid:** Observability setup
- **Deliverables:**
  - Structured logging
  - Metrics (Prometheus)
  - Tracing (optional)
- **Exit Criteria:** Full observability stack

#### Backend Engineer (Support)
- **Verantwoordelijkheid:** Telegram integration
- **Deliverables:**
  - Telegram bot for notifications
  - Rate limiting
- **Exit Criteria:** Notifications work, no spam

#### Security Engineer (Primary)
- **Verantwoordelijkheid:** Security hardening
- **Deliverables:**
  - Input validation
  - Rate limiting
  - Secrets management
- **Exit Criteria:** Security audit passes

#### QA Lead (Primary)
- **Verantwoordelijkheid:** Final QA
- **Deliverables:**
  - Full test pipeline
  - Release checklist
- **Exit Criteria:** 100% test coverage on critical paths

### Takenlijst

#### Fase 8.1: Structured Logging (SRE)
- [ ] Replace console.log with winston/pino
- [ ] JSON format: timestamp, level, message, context
- [ ] Log levels: error, warn, info, debug
- [ ] Log rotation: daily, max 7 days
- [ ] Sensitive data filtering (no keys/passwords)

#### Fase 8.2: Metrics (SRE)
- [ ] Prometheus exporter: prom-client
- [ ] Metrics:
  - [ ] `trades_total` (counter)
  - [ ] `trades_win_rate` (gauge)
  - [ ] `position_duration_seconds` (histogram)
  - [ ] `api_request_duration_seconds` (histogram)
  - [ ] `websocket_reconnects_total` (counter)
- [ ] Grafana dashboard (optional)

#### Fase 8.3: Telegram Notifications (Backend)
- [ ] Integrate telegraf or node-telegram-bot-api
- [ ] Notifications:
  - [ ] Trade opened: instrument, side, size, entry
  - [ ] Trade closed: PnL, %, duration
  - [ ] Error: critical failures
- [ ] Rate limit: max 1 msg/5s
- [ ] Configurable: enable/disable per event

#### Fase 8.4: Security Hardening (Security Engineer)
- [ ] Input validation: all API endpoints
- [ ] Rate limiting: 10 req/min per IP
- [ ] Secrets: use environment variables + .env.example
- [ ] HTTPS: enforce in production
- [ ] CORS: whitelist frontend domain
- [ ] API authentication: API key or JWT (optional)

#### Fase 8.5: Final QA (QA Lead)
- [ ] Run full test suite: unit + integration + e2e
- [ ] Load test: 1000 concurrent users
- [ ] Security scan: npm audit, Snyk
- [ ] Performance benchmark: <100ms API latency
- [ ] Create release checklist:
  - [ ] All tests green
  - [ ] No critical vulnerabilities
  - [ ] Logs structured
  - [ ] Metrics exposed
  - [ ] Telegram tested
  - [ ] systemd service enabled
  - [ ] Backup strategy documented

#### Fase 8.6: Documentation (Lead Architect)
- [ ] Update `README.md` with:
  - [ ] Installation instructions
  - [ ] Configuration (env vars)
  - [ ] Running (systemd)
  - [ ] Monitoring (Grafana)
  - [ ] Troubleshooting
- [ ] Create `DOCS/RELEASE_CHECKLIST.md`

### Exit Criteria (Iteratie 8)
- ✅ All tests green (100% critical paths)
- ✅ Structured logging active
- ✅ Metrics exposed at `/metrics`
- ✅ Telegram notifications work
- ✅ Security audit passes
- ✅ Load test: 1000 users, <100ms latency
- ✅ Release checklist complete
- ✅ **MVP READY FOR PRODUCTION**

### Test Plan (Iteratie 8)
```bash
# Full test suite
pnpm test
pnpm test:integration
pnpm test:e2e

# Security scan
npm audit --production
snyk test

# Load test
artillery run tests/load/api-stress.yml

# Telegram test
curl -X POST /api/test/telegram

# Metrics check
curl http://localhost:3000/metrics | grep trades_total

# Final smoke test
systemctl restart tradebaas-backend
sleep 30
curl http://localhost:3000/health # should be 200
```

---

## 📋 Testmatrix (Alle Iteraties)

| Iteratie | Unit Tests | Integration Tests | E2E Tests | Manual Tests | Security Tests |
|----------|-----------|-------------------|-----------|--------------|----------------|
| 1 | ❌ N/A | ❌ N/A | ❌ N/A | ✅ Doc review | ❌ N/A |
| 2 | ✅ Health, Shutdown | ✅ Orchestrator, Queue | ❌ N/A | ✅ 24h stability | ❌ N/A |
| 3 | ✅ Order validation | ✅ OCO lifecycle | ❌ N/A | ✅ Testnet trades | ❌ N/A |
| 4 | ✅ Position sizer | ✅ Risk accuracy | ❌ N/A | ✅ Live risk test | ❌ N/A |
| 5 | ✅ Position guard | ✅ Lifecycle | ❌ N/A | ✅ Race conditions | ❌ N/A |
| 6 | ✅ State persistence | ✅ Crash recovery | ❌ N/A | ✅ 7-day run | ❌ N/A |
| 7 | ✅ React components | ✅ API integration | ✅ Playwright | ✅ UI flows | ❌ N/A |
| 8 | ✅ All modules | ✅ Full stack | ✅ Full flows | ✅ Load test | ✅ Audit |

---

## 🚦 Go/No-Go Criteria per Iteratie

### Iteratie 1 → 2
- ✅ COLD_AUDIT.md reviewed by team
- ✅ BACKLOG.md prioritized
- ✅ DOD_MVP.md accepted
- ✅ Test plan approved
- ✅ **User approval: "Ga door naar Iteratie 2"**

### Iteratie 2 → 3
- ✅ Orchestrator 24h uptime
- ✅ All integration tests green
- ✅ Health endpoint works
- ✅ No memory leaks
- ✅ **User approval: "Ga door naar Iteratie 3"**

### Iteratie 3 → 4
- ✅ 100 OCO trades success
- ✅ Zero orphan orders
- ✅ Rollback tested
- ✅ **User approval: "Ga door naar Iteratie 4"**

### Iteratie 4 → 5
- ✅ Risk accuracy <0.1%
- ✅ 1000 test cases pass
- ✅ Live test verified
- ✅ **User approval: "Ga door naar Iteratie 5"**

### Iteratie 5 → 6
- ✅ No double positions
- ✅ Lifecycle correct
- ✅ Race conditions tested
- ✅ **User approval: "Ga door naar Iteratie 6"**

### Iteratie 6 → 7
- ✅ 100% crash recovery
- ✅ 7-day uptime
- ✅ systemd service stable
- ✅ **User approval: "Ga door naar Iteratie 7"**

### Iteratie 7 → 8
- ✅ UI realtime updates work
- ✅ Controls functional
- ✅ E2E tests green
- ✅ **User approval: "Ga door naar Iteratie 8"**

### Iteratie 8 → PRODUCTION
- ✅ All tests green
- ✅ Security audit passed
- ✅ Load test passed
- ✅ Release checklist complete
- ✅ **User approval: "Deploy to production"**

---

## 📝 Daily Standup Format

**Elke iteratie:** dagelijkse check-in

1. **Wat hebben we gisteren bereikt?**
   - Completed tasks
   - Tests passed
   - Blockers resolved

2. **Wat doen we vandaag?**
   - Focus tasks
   - Tests to write/run
   - Expected completion

3. **Zijn er blockers?**
   - Technical issues
   - Missing information
   - Dependencies

4. **Metrics**
   - Test coverage
   - Code quality (linting)
   - Performance benchmarks

---

## 🎯 Success Criteria (Final MVP)

**Functioneel:**
- ✅ 24/7 server-side trading zonder crashes
- ✅ Één strategie tegelijk
- ✅ OCO-orders (entry + SL + TP) altijd gekoppeld
- ✅ Exact risicobeheer (5% per trade, accuracy <0.1%)
- ✅ Max 1 open positie tegelijk
- ✅ Crash recovery binnen 30 seconden
- ✅ UI toont realtime status
- ✅ Telegram notificaties bij trades

**Technisch:**
- ✅ Test coverage: >80% (unit), >70% (integration)
- ✅ No memory leaks (7-day test)
- ✅ API latency <100ms (p95)
- ✅ Health endpoint 99.9% uptime
- ✅ Structured logging (JSON)
- ✅ Metrics exposed (Prometheus)

**Security:**
- ✅ No secrets in code/logs
- ✅ Input validation on all endpoints
- ✅ Rate limiting active
- ✅ npm audit: 0 critical vulnerabilities

**Documentation:**
- ✅ README.md complete
- ✅ ADR's for all major decisions
- ✅ API documented (OpenAPI)
- ✅ Deployment guide
- ✅ Recovery procedures

---

## 📞 Communicatie

**Na elke iteratie:**
1. Agent presenteert resultaten
2. Agent voert tests uit en toont output
3. Agent wacht op user feedback
4. User zegt: **"Ga door naar Iteratie X"** of geeft feedback

**Format per iteratie completion:**
```
## ✅ Iteratie X Completed

### Deliverables
- [x] Item 1
- [x] Item 2

### Test Results
- Unit: 45/45 passed
- Integration: 12/12 passed
- Manual: verified

### Metrics
- Coverage: 85%
- Performance: 87ms p95
- Uptime: 99.9%

### Next Steps
Waiting for approval to proceed to Iteratie Y.
```

---

**Ready to start Iteratie 1!** 🚀

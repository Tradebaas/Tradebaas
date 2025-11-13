# Tradebaas 24/7 MVP — Product Backlog

**Last Updated:** 4 November 2025  
**Backlog Owner:** Lead Architect + QA Lead  
**Sprint Model:** Iteratie-based (see ITERATION_PLAN.md)  
**Prioritization:** MoSCoW (Must/Should/Could/Won't)

---

## 🎯 Backlog Overview

**Total Items:** 47  
**Must Have (NOW):** 22 items — Iteratie 2-3  
**Should Have (NEXT):** 15 items — Iteratie 4-5  
**Could Have (LATER):** 10 items — Iteratie 6-8  
**Won't Have (MVP):** Listed at bottom

---

## 🔴 NOW — Iteratie 2-3 (Must Have)

### Iteratie 2: Orchestrator & Runner Stabilisatie

#### BACKEND-001: Health Check Endpoints
**Priority:** P0 (Critical)  
**Story:** Als SRE wil ik health endpoints zodat ik service uptime kan monitoren  
**Acceptance Criteria:**
- `/health` endpoint returns 200 when healthy
- `/health` returns 503 when unhealthy (WebSocket down, etc.)
- `/ready` endpoint for startup checks
- Health check includes: orchestrator status, WebSocket status, memory usage, active strategy count
**Estimate:** 2 hours  
**Dependencies:** None  
**Assigned:** Backend Engineer + SRE

#### BACKEND-002: Graceful Shutdown Handler
**Priority:** P0 (Critical)  
**Story:** Als operator wil ik graceful shutdown zodat connections netjes worden afgesloten  
**Acceptance Criteria:**
- SIGTERM handler implemented
- WebSocket connections closed within 5s
- Pending state updates flushed
- Max shutdown time: 10 seconds
- Logs "Shutting down gracefully..."
**Estimate:** 3 hours  
**Dependencies:** None  
**Assigned:** Backend Engineer

#### BACKEND-003: WebSocket Reconnect Logic
**Priority:** P0 (Critical)  
**Story:** Als system wil ik auto-reconnect zodat service niet crasht bij disconnect  
**Acceptance Criteria:**
- Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 5 attempts)
- Circuit breaker after 5 failed attempts
- Telegram alert on circuit breaker trip
- Reconnect within 30 seconds (total)
**Estimate:** 4 hours  
**Dependencies:** BACKEND-001  
**Assigned:** Backend Engineer

#### BACKEND-004: Queue Idempotency
**Priority:** P1 (High)  
**Story:** Als developer wil ik idempotente queue zodat duplicate processing onmogelijk is  
**Acceptance Criteria:**
- Status transitions: PENDING → RUNNING → COMPLETED/FAILED
- Unique task IDs (UUID)
- Prevent duplicate processing (check status before run)
- Persist queue to disk (JSON or SQLite)
**Estimate:** 4 hours  
**Dependencies:** None  
**Assigned:** Backend Engineer

#### BACKEND-005: Retry Logic with Circuit Breaker
**Priority:** P1 (High)  
**Story:** Als system wil ik retry logic zodat transient failures opgelost worden  
**Acceptance Criteria:**
- Max 3 retries for failed state writes
- Exponential backoff: 1s, 2s, 4s
- Circuit breaker for Deribit API (5 failures in 1 min → open for 5 min)
- Dead letter queue for permanently failed tasks
**Estimate:** 3 hours  
**Dependencies:** BACKEND-004  
**Assigned:** Backend Engineer

#### TEST-001: Orchestrator Integration Tests
**Priority:** P0 (Critical)  
**Story:** Als QA wil ik integration tests zodat orchestrator stability gegarandeerd is  
**Acceptance Criteria:**
- Test: orchestrator start → health OK
- Test: graceful shutdown completes in <10s
- Test: WebSocket disconnect → reconnect within 30s
- Test: state persistence after crash (kill -9)
**Estimate:** 5 hours  
**Dependencies:** BACKEND-001, BACKEND-002, BACKEND-003  
**Assigned:** QA Lead

#### TEST-002: Load Test (Ticker Flood)
**Priority:** P1 (High)  
**Story:** Als QA wil ik load test zodat performance onder stress bekend is  
**Acceptance Criteria:**
- Test: 1000 ticker events → no memory leak
- Test: 100 ticker events/sec for 1 min → latency <50ms (p95)
- Use Artillery or custom script
**Estimate:** 3 hours  
**Dependencies:** BACKEND-003  
**Assigned:** QA Lead

#### DOCS-001: ADR-0001 Orchestrator Runtime
**Priority:** P2 (Medium)  
**Story:** Als architect wil ik ADR zodat beslissingen gedocumenteerd zijn  
**Acceptance Criteria:**
- Document: Context, Decision, Consequences, Alternatives
- Explain: waarom health checks, waarom graceful shutdown
- Reviewed by Lead Architect
**Estimate:** 1 hour  
**Dependencies:** BACKEND-002  
**Assigned:** Lead Architect

---

### Iteratie 3: Deribit Adapter + OCO/OTOCO Lifecycle

#### BROKER-001: Order Validation (Pre-flight Checks)
**Priority:** P0 (Critical)  
**Story:** Als trader wil ik order validation zodat invalid orders worden voorkomen  
**Acceptance Criteria:**
- Validate quantity (min/max, lot size)
- Validate price (tick size)
- Validate leverage (≤50x)
- Validate margin requirements
- Throw error with specific reason if validation fails
**Estimate:** 3 hours  
**Dependencies:** None  
**Assigned:** Trading Engineer

#### BROKER-002: Atomic OCO Placement
**Priority:** P0 (Critical)  
**Story:** Als trader wil ik atomic OCO zodat entry + SL + TP altijd gekoppeld zijn  
**Acceptance Criteria:**
- Place entry order → immediately place SL + TP
- Link orders using labels (Deribit `edit_order_by_label`)
- Transaction ID for tracking
- Timeout: 5 seconds max
- Rollback on ANY failure (see BROKER-003)
**Estimate:** 6 hours  
**Dependencies:** BROKER-001  
**Assigned:** Trading Engineer

#### BROKER-003: Rollback Logic on Partial Failure
**Priority:** P0 (Critical)  
**Story:** Als trader wil ik rollback zodat no orphan orders ontstaan  
**Acceptance Criteria:**
- If SL placement fails → cancel entry
- If TP placement fails → cancel entry + SL
- Log all rollback actions
- Telegram alert on rollback
- Retry 3x before rollback
**Estimate:** 4 hours  
**Dependencies:** BROKER-002  
**Assigned:** Trading Engineer + Backend Engineer

#### BROKER-004: Orphan Order Cleanup
**Priority:** P1 (High)  
**Story:** Als trader wil ik orphan cleanup zodat lingering orders niet blijven staan  
**Acceptance Criteria:**
- Periodic scan every 1 minute
- Detect orders without open position
- Detect orders without parent order (via labels)
- Auto-cancel orphans with warning log
- Telegram alert on orphan detected
**Estimate:** 4 hours  
**Dependencies:** BROKER-002  
**Assigned:** Trading Engineer

#### BROKER-005: Leverage Validation
**Priority:** P0 (Critical)  
**Story:** Als risk manager wil ik leverage limit zodat max 50x niet overschreden wordt  
**Acceptance Criteria:**
- Calculate required leverage before order placement
- Throw error if leverage >50x
- Warn if leverage >10x (log + Telegram)
- Display leverage in order confirmation
**Estimate:** 2 hours  
**Dependencies:** BROKER-001  
**Assigned:** Trading Engineer

#### TEST-003: OCO Lifecycle Integration Tests
**Priority:** P0 (Critical)  
**Story:** Als QA wil ik OCO tests zodat lifecycle 100% betrouwbaar is  
**Acceptance Criteria:**
- Test: Full OCO flow (entry → fill → SL+TP visible)
- Test: Rollback on SL failure → entry canceled
- Test: Rollback on TP failure → entry+SL canceled
- Test: Orphan cleanup detects and cancels orphans
- Test: 100 consecutive OCO placements → 100% success
**Estimate:** 6 hours  
**Dependencies:** BROKER-002, BROKER-003, BROKER-004  
**Assigned:** QA Lead

#### TEST-004: Error Injection Tests (Broker Failures)
**Priority:** P1 (High)  
**Story:** Als QA wil ik error tests zodat edge cases afgedekt zijn  
**Acceptance Criteria:**
- Test: Network timeout during placement → rollback works
- Test: Insufficient margin → order rejected gracefully
- Test: Invalid instrument → error message clear
- Test: Deribit API rate limit → circuit breaker trips
**Estimate:** 4 hours  
**Dependencies:** BROKER-003  
**Assigned:** QA Lead

#### DOCS-002: ADR-0002 OTOCO Lifecycle
**Priority:** P2 (Medium)  
**Story:** Als architect wil ik ADR zodat OCO beslissing gedocumenteerd is  
**Acceptance Criteria:**
- Document: waarom atomic placement, waarom rollback
- Alternatives considered: separate orders (rejected)
- Consequences: complexity, latency
**Estimate:** 1 hour  
**Dependencies:** BROKER-002  
**Assigned:** Lead Architect

---

## 🟡 NEXT — Iteratie 4-5 (Should Have)

### Iteratie 4: Risk Engine + Strategy Registry

#### RISK-001: Position Sizer Implementation
**Priority:** P0 (Critical for MVP)  
**Story:** Als trader wil ik position sizing zodat risk exact 5% per trade is  
**Acceptance Criteria:**
- Formula: `quantity = (balance × riskPercent) / |entryPrice - stopLossPrice|`
- Round to lot size (Deribit: 1 USD)
- Validate min/max position size
- Return: `{ quantity: number, leverage: number }`
**Estimate:** 4 hours  
**Dependencies:** None  
**Assigned:** Quant Engineer

#### RISK-002: Leverage Optimization
**Priority:** P1 (High)  
**Story:** Als risk manager wil ik minimale leverage zodat risk wordt geminimaliseerd  
**Acceptance Criteria:**
- Calculate required margin
- Choose lowest leverage ≤50x
- Prefer higher margin over higher leverage
- Warn if leverage >10x
**Estimate:** 3 hours  
**Dependencies:** RISK-001  
**Assigned:** Quant Engineer

#### RISK-003: Integration with Strategy Executors
**Priority:** P0 (Critical)  
**Story:** Als developer wil ik risk integration zodat calculated size wordt gebruikt  
**Acceptance Criteria:**
- Import `PositionSizer` into strategy executors
- Call `calculatePositionSize()` before order placement
- Pass calculated size to `DeribitBroker.placeOrder()`
- Log: calculated size, actual size, leverage
- Works with any IStrategy implementation
**Estimate:** 2 hours  
**Dependencies:** RISK-001, BROKER-002  
**Assigned:** Backend Engineer + Quant Engineer

#### STRATEGY-001: Strategy Interface & Base Classes
**Priority:** P0 (Critical for flexibility)  
**Story:** Als developer wil ik strategy interface zodat ik eigen strategies kan maken  
**Acceptance Criteria:**
- Define `IStrategy` interface with: `analyze()`, `calculateStopLoss()`, `calculateTakeProfit()`
- Create `BaseStrategy` abstract class with common utilities
- Document interface in STRATEGY_DEVELOPMENT.md
- Example strategies: Razor, SMC template, Price Action template
**Estimate:** 3 hours  
**Dependencies:** None  
**Assigned:** Backend Engineer + Quant Engineer

#### STRATEGY-002: Strategy Registry System
**Priority:** P0 (Critical for flexibility)  
**Story:** Als operator wil ik strategy registry zodat ik kan kiezen welke strategy draait  
**Acceptance Criteria:**
- Create `StrategyRegistry` with register/get/list methods
- Load strategies from `backend/src/strategies/` directory
- API endpoint: `GET /api/strategies` → list available strategies
- API endpoint: `POST /api/strategy/start` accepts `strategyName` parameter
- Validate strategy exists before starting
**Estimate:** 2 hours  
**Dependencies:** STRATEGY-001  
**Assigned:** Backend Engineer

#### STRATEGY-003: Strategy Hot-Reload (Optional)
**Priority:** P2 (Nice to have)  
**Story:** Als developer wil ik hot-reload zodat ik strategies kan updaten zonder restart  
**Acceptance Criteria:**
- Watch `backend/src/strategies/` for file changes
- Reload strategy on file save
- API endpoint: `POST /api/strategies/reload/:name`
- Validate strategy before reload
- Log reload events
**Estimate:** 2 hours  
**Dependencies:** STRATEGY-002  
**Assigned:** Backend Engineer

#### TEST-005: Risk Accuracy Tests (1000 Scenarios)
**Priority:** P0 (Critical)  
**Story:** Als QA wil ik accuracy tests zodat risk berekening ≤0.1% afwijking heeft  
**Acceptance Criteria:**
- Test: 1000 random scenarios (balance, risk%, SL distance)
- Accuracy: actual risk ≤0.1% deviation from target
- Edge case: SL = entry → error thrown
- Edge case: SL too tight → leverage exceeds 50x → error thrown
**Estimate:** 5 hours  
**Dependencies:** RISK-001  
**Assigned:** QA Lead

#### TEST-006: Live Risk Verification (Testnet)
**Priority:** P1 (High)  
**Story:** Als QA wil ik live test zodat actual loss = expected loss  
**Acceptance Criteria:**
- Place trade on testnet with 5% risk
- Hit stop-loss
- Verify: actual loss = 5% ± 0.5%
- Repeat 10 times
**Estimate:** 3 hours  
**Dependencies:** RISK-003, BROKER-002  
**Assigned:** QA Lead

#### TEST-006B: Multi-Strategy Tests
**Priority:** P1 (High)  
**Story:** Als QA wil ik strategy tests zodat alle strategy types werken  
**Acceptance Criteria:**
- Test: Razor strategy → signal detection → trade placement
- Test: Custom strategy (SMC template) → loads correctly
- Test: Invalid strategy → clear error message
- Test: Switch between strategies → state resets correctly
**Estimate:** 3 hours  
**Dependencies:** STRATEGY-002  
**Assigned:** QA Lead

#### DOCS-003: ADR-0003 Risk Model & Strategy Architecture
**Priority:** P2 (Medium)  
**Story:** Als architect wil ik ADR zodat risk model en strategy system gedocumenteerd zijn  
**Acceptance Criteria:**
- Document: waarom fixed % risk, waarom size based on SL distance
- Document: waarom IStrategy interface, waarom registry pattern
- Alternatives: fixed contracts (rejected), hardcoded strategies (rejected)
- Consequences: variable position sizes, flexible strategy system
- Future: JSON config loader, UI strategy builder
**Estimate:** 2 hours  
**Dependencies:** RISK-001, STRATEGY-002  
**Assigned:** Lead Architect

#### DOCS-004: STRATEGY_DEVELOPMENT.md
**Priority:** P1 (High)  
**Story:** Als developer wil ik strategy guide zodat ik eigen strategies kan maken  
**Acceptance Criteria:**
- Explain IStrategy interface
- Provide step-by-step guide to create custom strategy
- Include 3 examples: indicator-based, SMC, price action
- Document how to register strategy
- Document testing custom strategies
**Estimate:** 2 hours  
**Dependencies:** STRATEGY-001  
**Assigned:** Lead Architect + Quant Engineer

---

### Iteratie 5: Single-Position Guard + Lifecycle

#### GUARD-001: Single Position Guard
**Priority:** P0 (Critical for MVP)  
**Story:** Als trader wil ik position guard zodat max 1 open positie mogelijk is  
**Acceptance Criteria:**
- Check open positions before entry (query Deribit API)
- Block entry if position exists
- Log rejection reason
- Expose via API: `canOpenPosition() → boolean`
**Estimate:** 3 hours  
**Dependencies:** BROKER-002  
**Assigned:** Backend Engineer

#### GUARD-002: Single Strategy Guard
**Priority:** P0 (Critical for MVP)  
**Story:** Als operator wil ik strategy guard zodat max 1 active strategy mogelijk is  
**Acceptance Criteria:**
- Check active strategies count before start
- Throw error if >0 active strategies
- Stop old strategy before starting new one (optional)
- API: `/api/strategy/start` returns error if strategy already active
**Estimate:** 2 hours  
**Dependencies:** None  
**Assigned:** Backend Engineer

#### LIFECYCLE-001: State Machine Implementation
**Priority:** P0 (Critical)  
**Story:** Als developer wil ik lifecycle state machine zodat strategy correcte flow heeft  
**Acceptance Criteria:**
- States: ANALYZING → SIGNAL → ENTRY → POSITION_OPEN → CLOSED → ANALYZING
- Pause analyzing when position opens
- Resume analyzing when position closes
- Persist state to disk (JSON/SQLite)
- Load state on startup
**Estimate:** 5 hours  
**Dependencies:** GUARD-001  
**Assigned:** Backend Engineer

#### LIFECYCLE-002: Broker Reconciliation
**Priority:** P1 (High)  
**Story:** Als system wil ik reconciliation zodat local state = broker state  
**Acceptance Criteria:**
- On startup: query Deribit for open positions
- Compare with local state
- Warn on mismatch (log + Telegram)
- Option: auto-close unknown positions (configurable)
**Estimate:** 4 hours  
**Dependencies:** LIFECYCLE-001  
**Assigned:** Trading Engineer + Backend Engineer

#### TEST-007: Lifecycle State Transition Tests
**Priority:** P0 (Critical)  
**Story:** Als QA wil ik lifecycle tests zodat transitions correct werken  
**Acceptance Criteria:**
- Test: Full lifecycle flow (analyze → signal → entry → open → close → analyze)
- Test: Pause analyzing when position opens
- Test: Resume analyzing after position closes
- Test: State persists across restart
**Estimate:** 4 hours  
**Dependencies:** LIFECYCLE-001  
**Assigned:** QA Lead

#### TEST-008: Race Condition Tests
**Priority:** P1 (High)  
**Story:** Als QA wil ik race tests zodat concurrent operations veilig zijn  
**Acceptance Criteria:**
- Test: 2 simultaneous entry attempts → only 1 succeeds
- Test: 2 simultaneous strategy starts → only 1 succeeds
- Test: Entry while position closing → blocked until fully closed
**Estimate:** 3 hours  
**Dependencies:** GUARD-001, GUARD-002  
**Assigned:** QA Lead

---

## 🟢 LATER — Iteratie 6-8 (Could Have)

### Iteratie 6: Persistentie & Crash-Recovery

#### PERSIST-001: State Store Implementation
**Priority:** P0 (Critical for 24/7)  
**Story:** Als system wil ik state store zodat geen data loss bij crash  
**Acceptance Criteria:**
- Choose: JSON file vs SQLite vs Redis
- Schema: strategy, instrument, orders, positions, balance
- Write on every state change (async, non-blocking)
- Atomic writes (temp file + rename)
- Backup every 1 hour
**Estimate:** 5 hours  
**Dependencies:** LIFECYCLE-001  
**Assigned:** Backend Engineer

#### PERSIST-002: Crash Recovery Logic
**Priority:** P0 (Critical for 24/7)  
**Story:** Als system wil ik crash recovery zodat state hersteld wordt na restart  
**Acceptance Criteria:**
- On startup: read state file
- Reconcile with broker (see LIFECYCLE-002)
- Resume strategy if was active
- Max recovery time: 30 seconds
**Estimate:** 4 hours  
**Dependencies:** PERSIST-001, LIFECYCLE-002  
**Assigned:** Backend Engineer

#### SRE-001: systemd Service Configuration
**Priority:** P0 (Critical for 24/7)  
**Story:** Als SRE wil ik systemd service zodat auto-restart gegarandeerd is  
**Acceptance Criteria:**
- Create `/etc/systemd/system/tradebaas-backend.service`
- Restart policy: always, delay 5s
- Resource limits: memory 512MB, CPU 100%
- Log to journald
- Enable watchdog (health check integration)
**Estimate:** 2 hours  
**Dependencies:** BACKEND-001  
**Assigned:** SRE Engineer

#### SRE-002: Health Monitoring & Alerting
**Priority:** P1 (High)  
**Story:** Als SRE wil ik monitoring zodat downtime snel gedetecteerd wordt  
**Acceptance Criteria:**
- Prometheus metrics endpoint `/metrics`
- Grafana dashboard (optional)
- Alert if health fails 3x in 5 min
- Telegram alert on downtime
**Estimate:** 4 hours  
**Dependencies:** SRE-001  
**Assigned:** SRE Engineer

#### TEST-009: Crash Recovery Tests
**Priority:** P0 (Critical)  
**Story:** Als QA wil ik crash tests zodat recovery 100% betrouwbaar is  
**Acceptance Criteria:**
- Test: Write state → kill -9 → restart → state matches
- Test: Position open → kill -9 → restart → position still tracked
- Test: 100 crash cycles → 0 state loss
**Estimate:** 5 hours  
**Dependencies:** PERSIST-002  
**Assigned:** QA Lead

#### TEST-010: Chaos Engineering Tests
**Priority:** P1 (High)  
**Story:** Als QA wil ik chaos tests zodat system resilient is  
**Acceptance Criteria:**
- Test: SIGKILL every 10 min for 1 hour → no state loss
- Test: Disk full → graceful degradation
- Test: Network partition → reconnect after restore
**Estimate:** 4 hours  
**Dependencies:** PERSIST-002  
**Assigned:** QA Lead

---

### Iteratie 7: Frontend Bridge & Status Modal

#### FRONTEND-001: API Endpoints for Status
**Priority:** P1 (High)  
**Story:** Als frontend developer wil ik API endpoints zodat UI backend state kan tonen  
**Acceptance Criteria:**
- GET `/api/strategy/status` → active strategies
- GET `/api/strategy/analysis/:id` → live analysis state
- POST `/api/strategy/start` → start strategy
- POST `/api/strategy/stop` → stop strategy
- WebSocket `/ws/analysis` → realtime updates
**Estimate:** 3 hours  
**Dependencies:** LIFECYCLE-001  
**Assigned:** Backend Engineer

#### FRONTEND-002: Status Modal UI
**Priority:** P1 (High)  
**Story:** Als user wil ik status modal zodat ik realtime analysis zie  
**Acceptance Criteria:**
- Show: strategy name, instrument, status
- Show: current price, indicators (EMA, RSI, volatility)
- Show: signal type, strength, confidence
- Show: checkpoints (momentum, volatility, RSI)
- Update every 1s via WebSocket
**Estimate:** 4 hours  
**Dependencies:** FRONTEND-001  
**Assigned:** Frontend Engineer

#### FRONTEND-003: Start/Stop Controls
**Priority:** P1 (High)  
**Story:** Als user wil ik controls zodat ik strategy kan starten/stoppen  
**Acceptance Criteria:**
- Start button → POST /api/strategy/start
- Stop button → POST /api/strategy/stop
- Disable controls when loading
- Show error toast on failure
- Confirm dialog before stop (optional)
**Estimate:** 2 hours  
**Dependencies:** FRONTEND-001  
**Assigned:** Frontend Engineer

#### TEST-011: E2E Tests (Playwright)
**Priority:** P1 (High)  
**Story:** Als QA wil ik E2E tests zodat full flow getest is  
**Acceptance Criteria:**
- Test: Open app → see status modal
- Test: Click start → strategy starts → see realtime updates
- Test: See signal detected → see position open
- Test: Click stop → strategy stops
**Estimate:** 5 hours  
**Dependencies:** FRONTEND-003  
**Assigned:** QA Lead

---

### Iteratie 8: Observability, Telegram, QA Hardening

#### OBS-001: Structured Logging (Winston/Pino)
**Priority:** P0 (Critical for production)  
**Story:** Als SRE wil ik structured logging zodat debugging makkelijker is  
**Acceptance Criteria:**
- Replace console.log with winston/pino
- JSON format: timestamp, level, message, context
- Log levels: error, warn, info, debug
- Log rotation: daily, max 7 days
- Sensitive data filtering (no keys/passwords)
**Estimate:** 4 hours  
**Dependencies:** None  
**Assigned:** SRE Engineer + Backend Engineer

#### OBS-002: Prometheus Metrics
**Priority:** P1 (High)  
**Story:** Als SRE wil ik metrics zodat performance gemonitord kan worden  
**Acceptance Criteria:**
- Metrics: trades_total, trades_win_rate, position_duration_seconds
- Metrics: api_request_duration_seconds, websocket_reconnects_total
- Expose at `/metrics` (Prometheus format)
- Optional: Grafana dashboard
**Estimate:** 4 hours  
**Dependencies:** SRE-001  
**Assigned:** SRE Engineer

#### NOTIF-001: Telegram Integration
**Priority:** P1 (High)  
**Story:** Als trader wil ik Telegram notificaties zodat ik trade updates krijg  
**Acceptance Criteria:**
- Integrate telegraf or node-telegram-bot-api
- Notification: Trade opened (instrument, side, size, entry)
- Notification: Trade closed (PnL, %, duration)
- Notification: Error (critical failures)
- Rate limit: max 1 msg/5s
- Configurable: enable/disable per event
**Estimate:** 5 hours  
**Dependencies:** PERSIST-002  
**Assigned:** Backend Engineer

#### SEC-001: Input Validation (Zod)
**Priority:** P0 (Critical for security)  
**Story:** Als security engineer wil ik input validation zodat injection attacks onmogelijk zijn  
**Acceptance Criteria:**
- Add Zod schemas for all API endpoints
- Validate: strategyName, instrument, tradeSize, percentages
- Return 400 with clear error message on validation failure
**Estimate:** 3 hours  
**Dependencies:** FRONTEND-001  
**Assigned:** Security Engineer

#### SEC-002: Rate Limiting
**Priority:** P1 (High)  
**Story:** Als security engineer wil ik rate limiting zodat API flooding onmogelijk is  
**Acceptance Criteria:**
- Add fastify-rate-limit
- Limit: 10 req/min per IP for /api/strategy/*
- Return 429 Too Many Requests on limit exceeded
**Estimate:** 2 hours  
**Dependencies:** None  
**Assigned:** Security Engineer

#### SEC-003: CORS Whitelist
**Priority:** P1 (High)  
**Story:** Als security engineer wil ik CORS whitelist zodat alleen frontend toegang heeft  
**Acceptance Criteria:**
- Restrict CORS to frontend domain only
- Block all other origins
- Configurable via env var: FRONTEND_URL
**Estimate:** 1 hour  
**Dependencies:** None  
**Assigned:** Security Engineer

#### TEST-012: Security Scan
**Priority:** P0 (Critical for production)  
**Story:** Als QA wil ik security scan zodat vulnerabilities gedetecteerd worden  
**Acceptance Criteria:**
- Run: npm audit --production → 0 critical vulnerabilities
- Run: Snyk test → 0 high-severity issues
- Manual test: SQL injection, XSS attempts → all blocked
**Estimate:** 2 hours  
**Dependencies:** SEC-001  
**Assigned:** QA Lead + Security Engineer

#### TEST-013: Load Test (1000 Users)
**Priority:** P1 (High)  
**Story:** Als QA wil ik load test zodat performance onder load bekend is  
**Acceptance Criteria:**
- Test: 1000 concurrent users → API latency <100ms (p95)
- Test: 100 req/sec for 5 min → no crashes
- Use Artillery: tests/load/api-stress.yml
**Estimate:** 3 hours  
**Dependencies:** OBS-001  
**Assigned:** QA Lead

---

## ⚪ WON'T HAVE (MVP Scope)

**Excluded from MVP — Future Considerations:**

1. **Multiple Simultaneous Strategies** — MVP: 1 active strategy at a time (but multiple can be registered)
2. **Multi-Broker Support** — MVP: Deribit only
3. **UI Strategy Builder** — MVP: code-based strategies only (JSON config in post-MVP)
4. **Strategy Marketplace** — Post-MVP: import strategies from GitHub
5. **Backtesting Framework** — Post-MVP: test strategies on historical data
6. **Strategy Performance Analytics** — Post-MVP: win rate, Sharpe ratio, etc.
7. **Dynamic Parameter Optimization** — Post-MVP: auto-tune strategy parameters
8. **Multi-Timeframe Analysis** — MVP: single timeframe only
9. **Strategy Combinations** — Post-MVP: run multiple strategies on different instruments
10. **Paper Trading Mode** — Post-MVP: test strategies with fake money

**Note:** Strategy Registry enables easy addition of custom strategies (5 min per strategy), making the system highly extensible for post-MVP features.
4. **Backtesting Module** — MVP: live trading only
5. **Advanced Analytics Dashboard** — MVP: basic status modal
6. **User Authentication** — MVP: single-user system
7. **Database (PostgreSQL/MySQL)** — MVP: JSON/SQLite sufficient
8. **Kubernetes Deployment** — MVP: single server + systemd
9. **WebSocket Broadcasting (Multiple Clients)** — MVP: single frontend
10. **API Rate Limiting per User** — MVP: global rate limit only

---

## 📊 Backlog Metrics

| Iteratie | Total Items | Must Have | Should Have | Could Have | Estimated Hours |
|----------|-------------|-----------|-------------|------------|-----------------|
| 2 | 8 | 6 | 2 | 0 | 25 |
| 3 | 8 | 5 | 2 | 1 | 30 |
| 4 | 6 | 3 | 2 | 1 | 18 |
| 5 | 6 | 3 | 2 | 1 | 21 |
| 6 | 6 | 3 | 2 | 1 | 24 |
| 7 | 4 | 0 | 4 | 0 | 14 |
| 8 | 9 | 3 | 4 | 2 | 28 |
| **Total** | **47** | **23** | **18** | **6** | **160 hrs** |

**Estimated MVP Duration:** 4-6 weeks (at 30-40 hrs/week)

---

## 🔄 Backlog Refinement Process

**Weekly Refinement:**
- Review completed items
- Re-prioritize based on blockers
- Add new items from feedback
- Update estimates based on actuals

**Definition of Ready (Item):**
- [ ] Story written (As a... I want... So that...)
- [ ] Acceptance criteria clear
- [ ] Dependencies identified
- [ ] Estimate provided
- [ ] Assigned to role

**Definition of Done (Item):**
- [ ] Code implemented
- [ ] Unit tests written & passing
- [ ] Integration tests written & passing (if applicable)
- [ ] Code reviewed by peer
- [ ] Documentation updated
- [ ] Acceptance criteria verified by QA

---

**Backlog Status:** ✅ COMPLETE  
**Next Action:** Review with team → Proceed to DOD_MVP.md  
**Owner:** Lead Architect + QA Lead


# Tradebaas 24/7 MVP — Definition of Done

**Last Updated:** 4 November 2025  
**Document Owner:** QA Lead + Lead Architect  
**Purpose:** Defineer wanneer een iteratie "done" is en MVP production-ready  

---

## 🎯 Definition of Done Hierarchy

```
MVP Done
  ↓
Iteratie Done
  ↓
Feature Done
  ↓
Story Done
  ↓
Task Done
```

---

## ✅ Task Level DoD

Een taak is done wanneer:

- [ ] Code geschreven en committed
- [ ] Code volgt TypeScript best practices
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] No linting errors (`pnpm lint`)
- [ ] Code formatted (`pnpm format`)
- [ ] Comments toegevoegd voor complexe logica
- [ ] TODO's removed of als issue geregistreerd

---

## ✅ Story Level DoD

Een story is done wanneer:

**Code:**
- [ ] All acceptance criteria voldaan
- [ ] Code implemented volgens specificaties
- [ ] Error handling toegevoegd
- [ ] Edge cases afgehandeld
- [ ] No hardcoded values (use config/env vars)

**Tests:**
- [ ] Unit tests geschreven (min. 80% coverage voor nieuwe code)
- [ ] Integration tests geschreven (indien van toepassing)
- [ ] All tests passing (`pnpm test`)
- [ ] Manual testing voltooid door developer

**Documentation:**
- [ ] Code comments added
- [ ] API changes documented (if applicable)
- [ ] README updated (if needed)
- [ ] CHANGELOG updated

**Review:**
- [ ] Code review completed by peer
- [ ] QA verified acceptance criteria
- [ ] Security review (indien van toepassing)

---

## ✅ Feature Level DoD

Een feature is done wanneer:

**Functionality:**
- [ ] All related stories done
- [ ] Feature tested end-to-end
- [ ] Performance benchmarks met (zie Performance Criteria)
- [ ] No regressions in existing features

**Tests:**
- [ ] Integration tests passing
- [ ] E2E tests passing (if applicable)
- [ ] Load tests passing (if performance-critical)
- [ ] Chaos tests passing (if reliability-critical)

**Documentation:**
- [ ] Feature documented in relevant docs
- [ ] ADR written (if architectural decision made)
- [ ] API documentation updated (if API changes)
- [ ] User guide updated (if user-facing)

**Deployment:**
- [ ] Feature deployed to staging
- [ ] Smoke test passed on staging
- [ ] Rollback plan documented

---

## ✅ Iteratie Level DoD

### Iteratie 2: Orchestrator & Runner Stabilisatie

**Functional Criteria:**
- [ ] `/health` endpoint returns 200 OK
- [ ] `/ready` endpoint returns 200 when ready
- [ ] Graceful shutdown completes within 10 seconds
- [ ] WebSocket reconnects within 30 seconds after disconnect
- [ ] Queue processes tasks idempotently (no duplicates)
- [ ] Retry logic works (3 retries with backoff)
- [ ] Circuit breaker trips after 5 failures

**Test Criteria:**
- [ ] All unit tests passing (min. 80% coverage)
- [ ] All integration tests passing
- [ ] Orchestrator start/stop test passing
- [ ] Crash recovery test passing (kill -9 → restart → state synced)
- [ ] Load test passing (1000 ticker events → no memory leak)
- [ ] 24-hour stability test passed (no crashes)

**Performance Criteria:**
- [ ] API latency <50ms (p95)
- [ ] Health check response <10ms
- [ ] Memory usage stable (<200MB after 24h)
- [ ] CPU usage <20% (idle), <80% (load)

**Documentation Criteria:**
- [ ] ADR-0001 Orchestrator Runtime written
- [ ] ARCHITECTURE_OVERVIEW.md updated
- [ ] Deployment guide updated

**Security Criteria:**
- [ ] No secrets in logs
- [ ] No sensitive data exposed in API responses

**Deployment Criteria:**
- [ ] Backend restarts successfully
- [ ] systemd service configured (not yet enabled)
- [ ] Health checks accessible

---

### Iteratie 3: Deribit Adapter + OCO/OTOCO Lifecycle

**Functional Criteria:**
- [ ] Order validation rejects invalid orders (quantity, price, leverage)
- [ ] OCO placement atomic (entry + SL + TP together)
- [ ] Rollback works on partial failure (no orphan orders)
- [ ] Orphan cleanup detects and cancels orphans
- [ ] Leverage never exceeds 50x

**Test Criteria:**
- [ ] All unit tests passing (order validation)
- [ ] All integration tests passing (OCO lifecycle)
- [ ] 100 consecutive OCO placements → 100% success
- [ ] Rollback test passing (SL/TP failure → entry canceled)
- [ ] Orphan cleanup test passing
- [ ] Error injection tests passing (network timeout, insufficient margin)

**Performance Criteria:**
- [ ] OCO placement time <5 seconds
- [ ] Orphan scan time <1 second

**Documentation Criteria:**
- [ ] ADR-0002 OTOCO Lifecycle written
- [ ] BROKER_API.md updated with OCO details

**Security Criteria:**
- [ ] Leverage validation prevents >50x
- [ ] No API keys in logs

**Deployment Criteria:**
- [ ] Testnet trading tested (10 successful trades)
- [ ] Rollback tested on testnet

---

### Iteratie 4: Risk Engine + Strategy Registry

**Functional Criteria:**
- [ ] Position sizer calculates correct quantity based on risk%
- [ ] Leverage minimized (lowest possible ≤50x)
- [ ] Risk engine integrated with all strategy executors
- [ ] Calculated size used in all orders
- [ ] IStrategy interface defined and documented
- [ ] Strategy Registry can load/list/select strategies
- [ ] API endpoints for strategy selection working
- [ ] Multiple strategies can be registered (Razor + custom examples)
- [ ] Strategy switching works without restart

**Test Criteria:**
- [ ] All unit tests passing (position sizer)
- [ ] Accuracy test passing (1000 scenarios, <0.1% deviation)
- [ ] Edge case tests passing (SL=entry, SL too tight)
- [ ] Live risk test passing (testnet: 10 trades, actual loss = 5% ± 0.5%)
- [ ] Strategy loading tests passing (Razor, SMC template, Price Action template)
- [ ] Strategy switching tests passing
- [ ] Invalid strategy tests passing (clear error messages)

**Performance Criteria:**
- [ ] Position size calculation <1ms
- [ ] Strategy loading <100ms
- [ ] Strategy switching <500ms

**Documentation Criteria:**
- [ ] ADR-0003 Risk Model & Strategy Architecture written
- [ ] STRATEGY_DEVELOPMENT.md created with examples
- [ ] RISK_ENGINE.md updated
- [ ] API documentation updated with strategy endpoints

**Security Criteria:**
- [ ] Risk calculation prevents excessive leverage
- [ ] Strategy validation prevents malicious code execution
- [ ] Strategy files have proper permissions

**Deployment Criteria:**
- [ ] Risk engine tested on testnet (10 trades)
- [ ] Actual vs expected risk verified
- [ ] Multiple strategies tested on testnet
- [ ] Strategy templates verified working

---

### Iteratie 5: Single-Position Guard + Lifecycle

**Functional Criteria:**
- [ ] Single position guard prevents >1 open position
- [ ] Single strategy guard prevents >1 active strategy
- [ ] Lifecycle state machine transitions correctly
- [ ] Analyzing pauses when position opens
- [ ] Analyzing resumes when position closes
- [ ] State persists across restarts

**Test Criteria:**
- [ ] All unit tests passing (guards)
- [ ] All integration tests passing (lifecycle)
- [ ] Race condition tests passing (concurrent entry attempts → only 1 succeeds)
- [ ] State transition tests passing

**Performance Criteria:**
- [ ] Position check <100ms
- [ ] State save <10ms

**Documentation Criteria:**
- [ ] ARCHITECTURE_OVERVIEW.md updated with lifecycle diagram

**Security Criteria:**
- [ ] Guards enforce limits (no bypasses)

**Deployment Criteria:**
- [ ] Lifecycle tested end-to-end (testnet)

---

### Iteratie 6: Persistentie & Crash-Recovery

**Functional Criteria:**
- [ ] State stored to disk on every change
- [ ] State loaded on startup
- [ ] Crash recovery reconciles with broker
- [ ] Strategy resumes if was active
- [ ] systemd service auto-restarts
- [ ] Health monitoring active

**Test Criteria:**
- [ ] All unit tests passing (state store)
- [ ] All integration tests passing (crash recovery)
- [ ] 100 crash cycles → 0 state loss
- [ ] Chaos tests passing (SIGKILL every 10 min for 1 hour)
- [ ] 7-day stability test passed

**Performance Criteria:**
- [ ] State save <10ms (async)
- [ ] Crash recovery time <30 seconds
- [ ] Uptime 99.9% (7-day test)

**Documentation Criteria:**
- [ ] DEPLOYMENT.md updated with systemd setup
- [ ] RECOVERY.md created with manual recovery steps

**Security Criteria:**
- [ ] State file permissions: 600 (owner read/write only)
- [ ] No secrets in state file (use references)

**Deployment Criteria:**
- [ ] systemd service enabled and started
- [ ] Watchdog configured
- [ ] Log rotation configured

---

### Iteratie 7: Frontend Bridge & Status Modal

**Functional Criteria:**
- [ ] API endpoints return correct data
- [ ] WebSocket provides realtime updates
- [ ] Status modal shows live analysis
- [ ] Start/stop controls work
- [ ] No trading actions in frontend (server-side only)

**Test Criteria:**
- [ ] All unit tests passing (React components)
- [ ] All integration tests passing (API)
- [ ] All E2E tests passing (Playwright)
- [ ] Manual UI testing completed

**Performance Criteria:**
- [ ] API response time <100ms
- [ ] WebSocket latency <50ms
- [ ] UI updates <1 second after backend change

**Documentation Criteria:**
- [ ] FRONTEND_INTEGRATION.md updated
- [ ] API documented in OpenAPI spec

**Security Criteria:**
- [ ] Input validation on all API endpoints
- [ ] CORS whitelist configured

**Deployment Criteria:**
- [ ] Frontend deployed to production
- [ ] E2E tests passing against production backend

---

### Iteratie 8: Observability, Telegram, QA Hardening

**Functional Criteria:**
- [ ] Structured logging active (JSON format)
- [ ] Metrics exposed at `/metrics`
- [ ] Telegram notifications working
- [ ] Input validation on all endpoints
- [ ] Rate limiting active
- [ ] CORS whitelist configured

**Test Criteria:**
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] All E2E tests passing
- [ ] Security scan passing (npm audit: 0 critical)
- [ ] Load test passing (1000 users, <100ms p95)

**Performance Criteria:**
- [ ] API latency <100ms (p95) under load
- [ ] No memory leaks (7-day test)
- [ ] Log write latency <1ms

**Documentation Criteria:**
- [ ] README.md complete
- [ ] All ADRs written
- [ ] RELEASE_CHECKLIST.md created

**Security Criteria:**
- [ ] 0 critical vulnerabilities (npm audit)
- [ ] Input validation on all endpoints
- [ ] Rate limiting: 10 req/min per IP
- [ ] Secrets in env vars only

**Deployment Criteria:**
- [ ] Production deployment successful
- [ ] Monitoring dashboard active
- [ ] Alerting configured
- [ ] Telegram bot connected

---

## ✅ MVP Level DoD

**Het MVP is production-ready wanneer:**

### Functional Requirements ✅

- [ ] ✅ **24/7 Runtime:** Backend draait 7+ dagen zonder crash
- [ ] ✅ **Single Active Strategy:** Max 1 strategy actief tegelijk (enforced)
- [ ] ✅ **Multi-Strategy Support:** Meerdere strategies kunnen geregistreerd worden (switch via API)
- [ ] ✅ **Custom Strategies:** Developers kunnen eigen strategies maken (IStrategy interface)
- [ ] ✅ **Single Position:** Max 1 open positie tegelijk (enforced)
- [ ] ✅ **OCO Orders:** Entry + SL + TP altijd gekoppeld (100% success rate)
- [ ] ✅ **Exact Risk:** Actual loss = target risk ± 0.5% (verified with 10+ trades)
- [ ] ✅ **Crash Recovery:** Recovery time <30s, 0 state loss (100 crash tests)
- [ ] ✅ **Position Lifecycle:** Correct state transitions (analyzed → open → closed → analyzed)
- [ ] ✅ **UI Status:** Frontend shows realtime backend state (latency <1s)
- [ ] ✅ **Notifications:** Telegram alerts on trade open/close

### Test Coverage ✅

- [ ] ✅ **Unit Tests:** >80% coverage (critical paths)
- [ ] ✅ **Integration Tests:** >70% coverage (module interactions)
- [ ] ✅ **E2E Tests:** All critical flows covered
- [ ] ✅ **Chaos Tests:** Kill -9, network failures tested
- [ ] ✅ **Load Tests:** 1000 users, <100ms p95 latency
- [ ] ✅ **Security Tests:** 0 critical vulnerabilities

### Performance Benchmarks ✅

- [ ] ✅ **API Latency:** <100ms (p95)
- [ ] ✅ **Health Check:** <10ms response
- [ ] ✅ **WebSocket Reconnect:** <30 seconds
- [ ] ✅ **Crash Recovery:** <30 seconds
- [ ] ✅ **OCO Placement:** <5 seconds
- [ ] ✅ **Memory Usage:** <512MB (steady state)
- [ ] ✅ **CPU Usage:** <20% (idle), <80% (load)
- [ ] ✅ **Uptime:** 99.9% (7-day test)

### Security Checklist ✅

- [ ] ✅ **No Secrets in Code:** API keys in env vars only
- [ ] ✅ **No Secrets in Logs:** Structured logging filters sensitive data
- [ ] ✅ **Input Validation:** Zod schemas on all API endpoints
- [ ] ✅ **Rate Limiting:** 10 req/min per IP
- [ ] ✅ **HTTPS:** SSL certificate installed (Nginx)
- [ ] ✅ **CORS:** Whitelist frontend domain only
- [ ] ✅ **Leverage Limit:** Max 50x enforced
- [ ] ✅ **Audit Clean:** 0 critical vulnerabilities (npm audit, Snyk)

### Documentation Checklist ✅

- [ ] ✅ **README.md:** Installation, configuration, running, troubleshooting
- [ ] ✅ **ADRs:** All architectural decisions documented (ADR-0001 to ADR-0003+)
- [ ] ✅ **API Docs:** OpenAPI spec with all endpoints
- [ ] ✅ **Deployment Guide:** systemd setup, monitoring, backups
- [ ] ✅ **Recovery Guide:** Manual recovery procedures
- [ ] ✅ **Release Checklist:** Pre-deployment verification steps

### Observability Checklist ✅

- [ ] ✅ **Structured Logs:** JSON format, log levels, rotation
- [ ] ✅ **Metrics:** Prometheus endpoint with key metrics
- [ ] ✅ **Health Endpoint:** `/health` returns 200 when healthy
- [ ] ✅ **Monitoring Dashboard:** Grafana (or equivalent)
- [ ] ✅ **Alerting:** Telegram alerts on critical events
- [ ] ✅ **Log Aggregation:** Logs accessible via journalctl or cloud

### Deployment Checklist ✅

- [ ] ✅ **systemd Service:** Enabled and active
- [ ] ✅ **Auto-Restart:** Service restarts on failure
- [ ] ✅ **Watchdog:** Health check integration
- [ ] ✅ **Nginx Reverse Proxy:** SSL termination
- [ ] ✅ **Firewall:** Only necessary ports open (443, 22)
- [ ] ✅ **Backups:** State backup every 1 hour
- [ ] ✅ **Environment:** Production config applied

---

## 🚫 Definition of NOT Done

Het MVP is NIET done als:

- ❌ Meer dan 1 strategy tegelijk kan draaien
- ❌ Meer dan 1 positie tegelijk kan open zijn
- ❌ OCO orders niet gekoppeld zijn (orphan orders mogelijk)
- ❌ Risk niet exact 5% is (>0.5% afwijking)
- ❌ Crash recovery faalt (state loss)
- ❌ Uptime <99% (7-day test)
- ❌ Test coverage <80% (unit tests kritieke paden)
- ❌ Security vulnerabilities (critical/high)
- ❌ Documentatie onvolledig
- ❌ Deployment manual work vereist

---

## 🔍 Verification Process

### Pre-Deployment Verification (Iteratie 8)

**Run deze checks VOOR deployment:**

```bash
# 1. Code Quality
pnpm lint                # Must pass: 0 errors
pnpm typecheck           # Must pass: 0 errors
pnpm test                # Must pass: all tests

# 2. Security
npm audit --production   # Must show: 0 critical, 0 high
snyk test                # Must show: 0 high severity

# 3. Performance
artillery run tests/load/api-stress.yml  # Must meet: <100ms p95

# 4. Integration
pnpm test:integration    # Must pass: all tests

# 5. E2E
pnpm test:e2e            # Must pass: all tests

# 6. Deployment
./scripts/deploy-staging.sh  # Smoke test on staging
```

### Post-Deployment Verification

**Run deze checks NA deployment:**

```bash
# 1. Health Check
curl https://api.tradebazen.nl/health  # Must return: 200 OK

# 2. Metrics
curl https://api.tradebazen.nl/metrics | grep trades_total  # Must be accessible

# 3. Strategy Start
curl -X POST https://api.tradebazen.nl/api/strategy/start -d '{...}'  # Must work

# 4. Telegram
# Must receive: "Strategy started" notification

# 5. WebSocket
# Open frontend → Must see: realtime updates

# 6. Logs
sudo journalctl -u tradebaas-backend -n 50  # Must show: no errors

# 7. Stability (24h)
# Monitor for 24h → Must have: 0 crashes, uptime >99%
```

---

## 📋 Release Checklist

**Before declaring MVP done:**

- [ ] All 8 iteraties completed
- [ ] All DoD criteria met (per iteratie)
- [ ] Pre-deployment verification passed
- [ ] Deployment successful (staging + production)
- [ ] Post-deployment verification passed
- [ ] 7-day stability test passed (production)
- [ ] User acceptance testing completed
- [ ] Rollback plan tested
- [ ] Monitoring active and alerting configured
- [ ] Documentation reviewed and approved
- [ ] Team sign-off (all engineers)
- [ ] **User sign-off: "MVP production-ready"**

---

**DoD Status:** ✅ COMPLETE  
**Next Action:** Create tests/README.md → User review → Proceed to Iteratie 2  
**Owner:** QA Lead + Lead Architect


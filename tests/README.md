# Tradebaas 24/7 MVP — Test Strategy

**Last Updated:** 4 November 2025  
**Document Owner:** QA Lead  
**Purpose:** Comprehensive test plan voor alle iteraties  

---

## 🎯 Test Pyramid

```
        /\
       /  \
      / E2E\          ~10% tests (slow, expensive, high value)
     /______\
    /        \
   /Integration\     ~30% tests (medium speed, medium cost)
  /__________  \
 /              \
/  Unit Tests    \   ~60% tests (fast, cheap, high volume)
/__________________\
```

**Philosophy:** Meeste tests op unit level, critical flows op E2E level

---

## 🧪 Test Types

### 1. Unit Tests

**Purpose:** Test individuele functies/klassen in isolatie  
**Tools:** Vitest  
**Coverage Target:** >80% voor nieuwe code, >60% overall  
**Speed:** <100ms per test suite  

**Scope:**
- Pure functions (calculations, transformations)
- Business logic (position sizing, signal detection)
- Validations (order validation, input validation)
- Utilities (formatters, parsers)

**Examples:**
- `calculateEMA(prices, period)` → returns correct EMA
- `validateOrder(order)` → rejects invalid orders
- `calculatePositionSize(balance, risk, SL)` → returns correct size

### 2. Integration Tests

**Purpose:** Test interacties tussen modules  
**Tools:** Vitest + mocks  
**Coverage Target:** >70% voor module interactions  
**Speed:** <1s per test suite  

**Scope:**
- API endpoints with mocked broker
- Strategy service with mocked WebSocket
- Broker with mocked Deribit API
- State manager with file system

**Examples:**
- `POST /api/strategy/start` → creates strategy in state manager
- `Razor executor onTicker()` → updates analysis state
- `DeribitBroker placeOrder()` → calls Deribit API

### 3. End-to-End (E2E) Tests

**Purpose:** Test volledige user flows  
**Tools:** Playwright  
**Coverage Target:** All critical user flows  
**Speed:** <30s per test  

**Scope:**
- Full frontend flows (start strategy → see analysis → position opens → closes)
- API flows (start → ticker → signal → trade → close)

**Examples:**
- User opens app → clicks start → sees realtime updates → strategy executes trade
- API: start strategy → WebSocket sends tickers → strategy detects signal → places OCO

### 4. Chaos/Resilience Tests

**Purpose:** Test system behavior onder failure scenarios  
**Tools:** Custom scripts + Vitest  
**Coverage Target:** All failure scenarios  
**Speed:** Variable (can be slow)  

**Scope:**
- Crash recovery (kill -9 → restart)
- Network failures (disconnect → reconnect)
- Broker API failures (rate limit, timeout)
- Resource exhaustion (disk full, memory leak)

**Examples:**
- Kill backend → restart → state matches
- Disconnect WebSocket → reconnects within 30s
- Deribit API returns 429 → circuit breaker trips

### 5. Load/Performance Tests

**Purpose:** Test performance onder load  
**Tools:** Artillery  
**Coverage Target:** All performance-critical endpoints  
**Speed:** Variable (minutes)  

**Scope:**
- API endpoints (1000 concurrent users)
- WebSocket (100 messages/sec)
- Ticker processing (1000 tickers → no memory leak)

**Examples:**
- 1000 GET /api/strategy/status → p95 <100ms
- 100 ticker events/sec for 5 min → memory stable

### 6. Security Tests

**Purpose:** Test security controls  
**Tools:** npm audit, Snyk, manual penetration testing  
**Coverage Target:** All security controls  
**Speed:** Variable  

**Scope:**
- Dependency vulnerabilities (npm audit)
- Input validation (injection attempts)
- Rate limiting (flood API)
- Authentication bypass attempts

**Examples:**
- npm audit → 0 critical vulnerabilities
- POST /api/strategy/start with invalid data → 400 error
- 100 req/sec → rate limiter blocks at 10 req/min

---

## 🗂️ Test Organization

### Directory Structure

```
backend/
  tests/
    unit/
      risk-engine.test.ts
      technical-indicators.test.ts
      position-sizer.test.ts
    integration/
      api.test.ts
      deribit-broker.test.ts
      strategy-runner.test.ts
      orchestrator.test.ts
    e2e/
      (placeholder for future E2E)
    chaos/
      crash-recovery.test.ts
      network-failures.test.ts
      broker-failures.test.ts
    load/
      api-stress.yml (Artillery config)
      ticker-flood.yml
    fixtures/
      candles.json
      ticker-data.json
      orders.json
    helpers/
      mock-deribit.ts
      test-utils.ts

src/
  tests/
    components/
      AnalysisDetailsDialog.test.tsx
      StrategyEditor.test.tsx
    e2e/
      status-modal.spec.ts (Playwright)
      start-stop-flow.spec.ts
```

---

## 🧩 Test Patterns

### Unit Test Pattern (AAA)

```typescript
// tests/unit/position-sizer.test.ts
import { describe, it, expect } from 'vitest';
import { calculatePositionSize } from '@/risk/PositionSizer';

describe('PositionSizer', () => {
  describe('calculatePositionSize', () => {
    it('calculates correct size for 5% risk', () => {
      // ARRANGE
      const balance = 1000;
      const riskPercent = 5;
      const entryPrice = 100;
      const stopLossPrice = 99;
      
      // ACT
      const result = calculatePositionSize(balance, riskPercent, entryPrice, stopLossPrice);
      
      // ASSERT
      expect(result.quantity).toBe(50); // (1000 * 0.05) / (100 - 99) = 50
      expect(result.leverage).toBeLessThanOrEqual(50);
    });

    it('throws error when SL equals entry', () => {
      // ARRANGE
      const balance = 1000;
      const riskPercent = 5;
      const entryPrice = 100;
      const stopLossPrice = 100;
      
      // ACT & ASSERT
      expect(() => {
        calculatePositionSize(balance, riskPercent, entryPrice, stopLossPrice);
      }).toThrow('Stop loss cannot equal entry price');
    });
  });
});
```

### Integration Test Pattern (with Mocks)

```typescript
// tests/integration/api.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startServer } from '@/server';
import type { FastifyInstance } from 'fastify';

describe('API Integration', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await startServer();
    // Mock Deribit client
    vi.mock('@/deribit-client', () => ({
      DeribitClient: vi.fn().mockImplementation(() => ({
        subscribeTicker: vi.fn(),
        placeOrder: vi.fn().mockResolvedValue({ orderId: '123' })
      }))
    }));
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  it('POST /api/strategy/start creates strategy', async () => {
    // ARRANGE
    const payload = {
      strategyName: 'Razor',
      instrument: 'BTC_USDC-PERPETUAL',
      tradeSize: 100
    };

    // ACT
    const response = await server.inject({
      method: 'POST',
      url: '/api/strategy/start',
      payload
    });

    // ASSERT
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      strategyId: expect.stringMatching(/^strategy-\d+$/)
    });
  });
});
```

### E2E Test Pattern (Playwright)

```typescript
// src/tests/e2e/start-stop-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Strategy Start/Stop Flow', () => {
  test('user can start and stop strategy', async ({ page }) => {
    // ARRANGE
    await page.goto('http://localhost:5173');

    // ACT: Start strategy
    await page.click('button:has-text("Start Strategy")');
    
    // ASSERT: Strategy started
    await expect(page.locator('.strategy-status')).toContainText('Active');
    
    // Wait for realtime updates
    await page.waitForTimeout(2000);
    
    // ASSERT: Analysis updates visible
    await expect(page.locator('.current-price')).not.toBeEmpty();
    await expect(page.locator('.rsi-value')).not.toBeEmpty();

    // ACT: Stop strategy
    await page.click('button:has-text("Stop Strategy")');
    
    // ASSERT: Strategy stopped
    await expect(page.locator('.strategy-status')).toContainText('Stopped');
  });
});
```

### Chaos Test Pattern

```typescript
// tests/chaos/crash-recovery.test.ts
import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';

const execAsync = promisify(exec);

describe('Crash Recovery', () => {
  it('recovers state after kill -9', async () => {
    // ARRANGE: Start server and create state
    await execAsync('systemctl start tradebaas-backend');
    await execAsync('sleep 5'); // Wait for startup
    
    // Create state via API
    await fetch('http://localhost:3000/api/strategy/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategyName: 'Razor', instrument: 'BTC_USDC-PERPETUAL' })
    });
    
    await execAsync('sleep 2'); // Wait for state to persist
    
    // Read state before crash
    const stateBefore = JSON.parse(readFileSync('/var/lib/tradebaas/state.json', 'utf-8'));
    
    // ACT: Kill process
    const { stdout } = await execAsync('pidof node');
    const pid = stdout.trim();
    await execAsync(`kill -9 ${pid}`);
    
    // Wait for systemd to restart
    await execAsync('sleep 10');
    
    // ASSERT: State recovered
    const stateAfter = JSON.parse(readFileSync('/var/lib/tradebaas/state.json', 'utf-8'));
    expect(stateAfter).toEqual(stateBefore);
    
    // Verify health
    const health = await fetch('http://localhost:3000/health');
    expect(health.status).toBe(200);
  });
});
```

---

## 📋 Test Checklist per Iteratie

### Iteratie 2: Orchestrator & Runner

**Unit Tests:**
- [ ] Health check logic
- [ ] Graceful shutdown handler
- [ ] Retry logic with exponential backoff
- [ ] Circuit breaker logic

**Integration Tests:**
- [ ] Orchestrator start → health OK
- [ ] Graceful shutdown completes <10s
- [ ] WebSocket disconnect → reconnect <30s
- [ ] Queue idempotency (no duplicates)

**Chaos Tests:**
- [ ] Kill -9 → systemd restarts → service healthy
- [ ] Network disconnect → reconnects

**Load Tests:**
- [ ] 1000 ticker events → no memory leak
- [ ] 100 ticker events/sec → latency <50ms p95

---

### Iteratie 3: Deribit + OCO

**Unit Tests:**
- [ ] Order validation (quantity, price, leverage)
- [ ] Leverage calculation
- [ ] Orphan detection logic

**Integration Tests:**
- [ ] Full OCO lifecycle (entry → SL+TP visible)
- [ ] Rollback on SL failure
- [ ] Rollback on TP failure
- [ ] Orphan cleanup detects and cancels

**Error Injection Tests:**
- [ ] Network timeout → rollback
- [ ] Insufficient margin → error
- [ ] Invalid instrument → error

**Manual Tests (Testnet):**
- [ ] 10 OCO placements → 100% success
- [ ] Verify SL+TP visible in Deribit UI

---

### Iteratie 4: Risk Engine

**Unit Tests:**
- [ ] Position sizer accuracy (1000 random scenarios)
- [ ] Edge case: SL = entry → error
- [ ] Edge case: SL too tight → leverage >50x → error
- [ ] Leverage optimization (min leverage)

**Integration Tests:**
- [ ] Risk engine integrated with executor
- [ ] Calculated size used in orders

**Manual Tests (Testnet):**
- [ ] 10 trades with 5% risk → actual loss = 5% ± 0.5%

---

### Iteratie 5: Guards + Lifecycle

**Unit Tests:**
- [ ] Single position guard logic
- [ ] Single strategy guard logic
- [ ] Lifecycle state transitions

**Integration Tests:**
- [ ] Full lifecycle (analyze → entry → open → close → analyze)
- [ ] Pause analyzing when position opens
- [ ] Resume analyzing when position closes

**Race Condition Tests:**
- [ ] 2 simultaneous entry attempts → only 1 succeeds
- [ ] 2 simultaneous strategy starts → only 1 succeeds

---

### Iteratie 6: Persistence + Crash Recovery

**Unit Tests:**
- [ ] State serialization/deserialization
- [ ] Atomic file writes

**Integration Tests:**
- [ ] Write state → kill → restart → state matches
- [ ] Position open → kill → restart → position tracked

**Chaos Tests:**
- [ ] 100 crash cycles → 0 state loss
- [ ] SIGKILL every 10 min for 1 hour
- [ ] Disk full → graceful degradation

**7-Day Stability Test:**
- [ ] Run for 7 days → uptime >99%, 0 data loss

---

### Iteratie 7: Frontend + UI

**Unit Tests (React):**
- [ ] AnalysisDetailsDialog component
- [ ] StrategyEditor component
- [ ] API hooks

**Integration Tests:**
- [ ] API calls (start/stop/status)
- [ ] WebSocket connection

**E2E Tests (Playwright):**
- [ ] Open app → see status modal
- [ ] Click start → strategy starts → realtime updates
- [ ] Click stop → strategy stops

---

### Iteratie 8: Observability + Production

**Unit Tests:**
- [ ] Log sanitization (no secrets)
- [ ] Input validation (Zod schemas)
- [ ] Rate limiter logic

**Integration Tests:**
- [ ] Structured logging writes JSON
- [ ] Metrics endpoint returns Prometheus format
- [ ] Telegram notifications sent

**Security Tests:**
- [ ] npm audit → 0 critical
- [ ] Snyk test → 0 high
- [ ] SQL injection attempts → blocked
- [ ] XSS attempts → blocked

**Load Tests:**
- [ ] 1000 concurrent users → latency <100ms p95
- [ ] 100 req/sec for 5 min → no crashes

---

## 🚀 Running Tests

### Local Development

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test risk-engine.test.ts

# Run with coverage
pnpm test --coverage

# Watch mode
pnpm test --watch

# Integration tests only
pnpm test:integration

# E2E tests (requires running server)
pnpm test:e2e

# Chaos tests (requires sudo)
sudo pnpm test:chaos
```

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Lint
        run: pnpm lint
      
      - name: Type check
        run: pnpm typecheck
      
      - name: Unit tests
        run: pnpm test --coverage
      
      - name: Integration tests
        run: pnpm test:integration
      
      - name: E2E tests
        run: |
          pnpm build
          pnpm preview &
          sleep 5
          pnpm test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## 📊 Test Metrics & Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Unit Test Coverage | >80% | ~45% | 🔴 BELOW |
| Integration Test Coverage | >70% | ~20% | 🔴 BELOW |
| E2E Test Coverage | 100% critical flows | 0% | 🔴 MISSING |
| Test Execution Time | <5 min (all) | Unknown | ⚪ TBD |
| Flaky Test Rate | <1% | Unknown | ⚪ TBD |
| Bug Escape Rate | <5% | Unknown | ⚪ TBD |

---

## 🐛 Bug Tracking

**When a bug is found:**

1. Create GitHub issue with label `bug`
2. Add test case that reproduces bug
3. Verify test fails (red)
4. Fix bug
5. Verify test passes (green)
6. Close issue

**Template:**
```markdown
## Bug Description
[Clear description of bug]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Test Case Added
- [ ] Unit test: `tests/unit/bug-xxx.test.ts`
- [ ] Reproduces issue (red before fix)
- [ ] Passes after fix (green)
```

---

## ✅ Test Review Checklist

**Before merging PR:**

- [ ] All new code has unit tests
- [ ] Integration tests added for new features
- [ ] All tests passing locally
- [ ] All tests passing in CI
- [ ] Coverage not decreased (or justified)
- [ ] No flaky tests introduced
- [ ] Test names descriptive
- [ ] Happy path AND edge cases covered

---

## 📚 Test Resources

**Documentation:**
- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
- [Artillery Docs](https://www.artillery.io/docs)

**Best Practices:**
- Test one thing per test
- Use descriptive test names
- AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Clean up after tests (no side effects)
- Fast tests (unit <100ms, integration <1s)

---

**Test Plan Status:** ✅ COMPLETE  
**Next Action:** User review → Proceed to Iteratie 2  
**Owner:** QA Lead


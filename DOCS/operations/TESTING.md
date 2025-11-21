# Test Documentation

## Test Structure

```
/src/tests/                 # Frontend unit tests
├── riskEngine.test.ts      # Risk engine position sizing tests
├── license.test.ts         # License service tests
└── setup.ts                # Test environment setup

/backend/tests/             # Backend tests
├── deribit-broker.test.ts  # Broker adapter unit tests
└── integration.test.ts     # Integration tests
```

## Running Tests

### All Tests
```bash
npm run test:all
```

### Unit Tests Only
```bash
npm test
```

### Watch Mode (Development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Integration Tests
```bash
npm run test:integration
```

## Test Coverage

### Risk Engine Tests (`riskEngine.test.ts`)

**Valid Scenarios:**
- ✅ Percent risk mode calculation
- ✅ Fixed risk mode calculation
- ✅ Broker leverage cap enforcement
- ✅ Lot size rounding
- ✅ High leverage warnings
- ✅ Multi-broker compatibility

**Error Cases:**
- ✅ Zero/negative equity rejection
- ✅ Zero entry price rejection
- ✅ Zero stop distance rejection
- ✅ Out of range percent rejection
- ✅ Excessive fixed risk rejection
- ✅ Below minimum position rejection

**Bracket Orders:**
- ✅ Buy order brackets
- ✅ Sell order brackets
- ✅ Tick size rounding
- ✅ Risk/reward ratio application
- ✅ Invalid parameter rejection

**Broker Rules:**
- ✅ Deribit (50x leverage)
- ✅ Kraken (5x leverage)
- ✅ Binance (125x leverage)

### License Service Tests (`license.test.ts`)

**Initialization:**
- ✅ User creation from Spark API
- ✅ KV storage integration

**Entitlement Management:**
- ✅ Basic tier grants
- ✅ Premium tier grants
- ✅ Enterprise tier grants
- ✅ Lifetime entitlements (null expiry)
- ✅ Entitlement retrieval

**Receipt Verification:**
- ✅ Valid receipt processing
- ✅ Product ID validation
- ✅ Receipt format validation
- ✅ Tier assignment

**Status Checks:**
- ✅ Free tier default
- ✅ Active entitlement status
- ✅ Days remaining calculation
- ✅ Expired entitlement handling
- ✅ Lifetime entitlement handling

### Broker Adapter Tests (`deribit-broker.test.ts`)

**Connection Management:**
- ✅ Initial disconnected state
- ✅ Successful authentication
- ✅ Invalid credential rejection
- ✅ Disconnect handling
- ✅ Testnet/live environment switching

**Balance Operations:**
- ✅ USDC balance retrieval
- ✅ Default currency handling
- ✅ Unauthenticated request rejection

**Order Placement:**
- ✅ Market buy orders
- ✅ Market sell orders
- ✅ Limit orders
- ✅ Labeled orders
- ✅ OTOCO bracket orders

**Order Management:**
- ✅ Order cancellation by ID
- ✅ Cancel all orders
- ✅ Instrument-specific cancellation
- ✅ Order retrieval by ID
- ✅ Open orders listing
- ✅ Label inclusion in orders

**Instrument Info:**
- ✅ Tick size retrieval
- ✅ Min trade amount retrieval
- ✅ Max leverage retrieval
- ✅ Amount step retrieval

### Integration Tests (`integration.test.ts`)

**Mock Deribit Server:**
- ✅ Authentication flow
- ✅ Order lifecycle (place → retrieve → cancel)
- ✅ Market vs limit orders
- ✅ Open orders listing
- ✅ OTOCO bracket orders
- ✅ Label-based order matching
- ✅ Orphaned order detection
- ✅ Instrument filtering

**License Flow:**
- ✅ Receipt verification
- ✅ Entitlement granting
- ✅ Access control checks
- ✅ Tier hierarchy enforcement
- ✅ Free user restrictions

## Acceptance Criteria

### ✅ Unit Tests Pass
All unit tests for risk engine, license service, and broker adapters pass with 100% success rate.

### ✅ Integration Tests Pass
Mock Deribit server and license flow integration tests complete successfully.

### ✅ Coverage Thresholds
- Risk Engine: >95% coverage
- License Service: >90% coverage
- Broker Adapters: >85% coverage

### ✅ Docker Compose Starts
```bash
docker-compose up -d
# All services start healthy
```

### ✅ Health Checks Pass
```bash
curl http://localhost:3000/health
# Returns 200 OK with status: healthy
```

### ✅ Services Connected
- PostgreSQL accepts connections
- Redis accepts connections
- App connects to both services

### ✅ Data Persists
Volumes maintain data across container restarts.

## Continuous Integration

Tests run automatically on:
- Push to main/develop branches
- Pull requests
- Manual workflow dispatch

See `.github/workflows/ci.yml` for pipeline configuration.

## Manual Testing Checklist

Before deployment:

1. **Start Services**
   ```bash
   docker-compose up -d
   ```

2. **Verify Health**
   ```bash
   docker-compose ps
   curl http://localhost:3000/health
   ```

3. **Run Tests**
   ```bash
   npm run test:all
   ```

4. **Check Database**
   - Access Adminer: http://localhost:8080
   - Verify schema exists
   - Check tables created

5. **Check Redis**
   - Access Redis Commander: http://localhost:8081
   - Verify connection active

6. **Test Application**
   - Load frontend: http://localhost:3000
   - Test authentication
   - Verify trading functions

7. **Review Logs**
   ```bash
   docker-compose logs -f app
   ```

8. **Test Restart**
   ```bash
   docker-compose restart app
   docker-compose ps
   ```

## Troubleshooting Tests

### Tests Fail to Start
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
```

### Test Timeout
```bash
# Increase timeout in vitest.config.ts
test: {
  testTimeout: 10000,
}
```

### Mock Issues
```bash
# Check setup.ts is being loaded
# Verify global.spark is defined
```

### Coverage Not Generated
```bash
# Install coverage provider
npm install -D @vitest/coverage-v8
```

## Writing New Tests

### Unit Test Template
```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  describe('Success Cases', () => {
    it('should handle valid input', () => {
      const result = myFunction(validInput);
      expect(result).toBe(expectedOutput);
    });
  });

  describe('Error Cases', () => {
    it('should reject invalid input', () => {
      expect(() => myFunction(invalidInput)).toThrow();
    });
  });
});
```

### Integration Test Template
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Integration Test', () => {
  beforeAll(() => {
    // Setup test environment
  });

  afterAll(() => {
    // Cleanup
  });

  it('should complete end-to-end flow', async () => {
    // Test multi-step process
  });
});
```

## Performance Benchmarks

Target test execution times:
- Unit tests: <5 seconds
- Integration tests: <15 seconds
- Full test suite: <30 seconds

Current performance tracked in CI pipeline.

# FASE 6 TEST PLAN: Integration Testing

**Date:** 21 November 2025  
**Status:** 🧪 IN PROGRESS  
**Phase:** Multi-User SaaS - Integration Testing & Validation

---

## Test Philosophy

**CRITICAL RULES:**
1. ✅ **ZERO Code Changes** - This is pure testing/validation phase
2. ✅ **ZERO Tech Debt** - No new files, no duplicate logic, no workarounds
3. ✅ **UI/UX Intact** - Existing UI must work exactly as before
4. ✅ **Non-Destructive** - All tests can be rolled back without data loss
5. ✅ **Production-Ready** - Tests verify real production scenarios

---

## Test Environment Setup

### Prerequisites
- ✅ Backend running on http://127.0.0.1:3000
- ✅ Frontend running on http://localhost:5000
- ✅ PostgreSQL database accessible
- ✅ SQLite trades.db accessible
- ✅ At least 2 test user accounts created

### Test Users
```
User A (alice@test.com):
- Purpose: Multi-user isolation testing
- Strategies: Razor (testnet)
- Expected: Independent execution, separate trades

User B (bob@test.com):
- Purpose: Concurrent strategy testing
- Strategies: Thor (testnet)
- Expected: No interference with User A

User C (charlie@test.com):
- Purpose: Auto-resume testing
- Strategies: Razor (testnet) - will be stopped manually
- Expected: No auto-resume after manual stop
```

---

## Test Scenario 1: Multi-User Isolation

### Objective
Verify that multiple users can run the SAME strategy (Razor) on the SAME instrument (BTC-PERPETUAL) without interfering with each other.

### Test Steps

#### 1.1 Create Test Users
```bash
# User A
curl -X POST http://127.0.0.1:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@test.com",
    "password": "TestPassword123!",
    "disclaimerAccepted": true
  }'

# User B
curl -X POST http://127.0.0.1:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@test.com",
    "password": "TestPassword123!",
    "disclaimerAccepted": true
  }'
```

#### 1.2 Login Both Users (Get JWTs)
```bash
# User A
ALICE_TOKEN=$(curl -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@test.com", "password": "TestPassword123!"}' \
  | jq -r '.token')

# User B
BOB_TOKEN=$(curl -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "bob@test.com", "password": "TestPassword123!"}' \
  | jq -r '.token')
```

#### 1.3 Connect Both Users to Deribit
**Frontend Action:**
1. Login as alice@test.com
2. Navigate to Settings → Deribit Connection
3. Enter testnet credentials, click Connect
4. Verify: "Connected to Deribit (Testnet)" message

5. Logout, login as bob@test.com
6. Repeat steps 2-4

**Verification:**
```sql
-- PostgreSQL: Check user_broker_credentials
SELECT user_id, broker, environment, created_at 
FROM user_broker_credentials 
WHERE broker = 'deribit' AND environment = 'testnet';

-- Expected: 2 rows (alice, bob)
```

#### 1.4 Start Same Strategy for Both Users
**User A (alice):**
```bash
curl -X POST http://127.0.0.1:3000/api/user/strategy/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{
    "strategyName": "razor",
    "instrument": "BTC-PERPETUAL",
    "broker": "deribit",
    "environment": "testnet",
    "config": {
      "entryType": "limit",
      "limitPriceOffset": 10,
      "targetProfit": 50,
      "stopLoss": 30,
      "tradeAmount": 10
    }
  }'
```

**User B (bob):**
```bash
curl -X POST http://127.0.0.1:3000/api/user/strategy/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -d '{
    "strategyName": "razor",
    "instrument": "BTC-PERPETUAL",
    "broker": "deribit",
    "environment": "testnet",
    "config": {
      "entryType": "market",
      "targetProfit": 100,
      "stopLoss": 50,
      "tradeAmount": 20
    }
  }'
```

#### 1.5 Verify Database Isolation
```sql
-- PostgreSQL: Check user_strategies table
SELECT 
  user_id, 
  strategy_name, 
  instrument, 
  config->>'entryType' as entry_type,
  config->>'tradeAmount' as trade_amount,
  status
FROM user_strategies
WHERE strategy_name = 'razor' AND instrument = 'BTC-PERPETUAL'
ORDER BY user_id;

-- Expected: 2 rows
-- alice: entryType=limit, tradeAmount=10
-- bob: entryType=market, tradeAmount=20
```

#### 1.6 Verify In-Memory Isolation
**Backend Logs:**
```
[UserStrategyService] ✅ Strategy started: alice:razor:BTC-PERPETUAL:deribit:testnet
[UserStrategyService] ✅ Strategy started: bob:razor:BTC-PERPETUAL:deribit:testnet
```

**Verification:** Check `runningStrategies` Map has 2 entries with different composite keys

#### 1.7 Verify Trade History Isolation
**After strategies execute trades:**
```sql
-- SQLite: Check trades table
SELECT 
  user_id, 
  strategy_id, 
  entry_price, 
  amount,
  profit_loss
FROM trades
WHERE strategy LIKE '%razor%'
ORDER BY user_id, timestamp DESC
LIMIT 10;

-- Expected:
-- alice's trades have user_id = alice's userId
-- bob's trades have user_id = bob's userId
-- NO overlap
```

#### 1.8 Verify Frontend Isolation
**User A View (alice logged in):**
- Navigate to Strategies page
- Expected: Only sees alice's Razor strategy
- Does NOT see bob's strategy

**User B View (bob logged in):**
- Navigate to Strategies page
- Expected: Only sees bob's Razor strategy
- Does NOT see alice's strategy

**UI Verification Checklist:**
- ✅ StrategyTradingCard renders correctly
- ✅ Start/Stop buttons functional
- ✅ Strategy status shows 'active'
- ✅ No console errors
- ✅ No broken layouts
- ✅ Real-time updates work (polling /api/user/strategy/status)

### Expected Outcome
- ✅ **Database:** 2 separate entries in user_strategies
- ✅ **In-Memory:** 2 separate executor instances
- ✅ **Trade History:** Separate user_id per trade
- ✅ **Frontend:** Each user sees only own strategies
- ✅ **Isolation:** No interference between users

---

## Test Scenario 2: Auto-Resume Flow

### Objective
Verify that strategies auto-resume after backend restart ONLY if `autoReconnect=true` (not manually stopped).

### Test Steps

#### 2.1 Setup: Start Strategy for User A
```bash
# User A starts Razor
curl -X POST http://127.0.0.1:3000/api/user/strategy/start \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "razor",
    "instrument": "BTC-PERPETUAL",
    "environment": "testnet",
    "config": { "targetProfit": 50, "stopLoss": 30, "tradeAmount": 10 }
  }'
```

**Verify:**
```sql
SELECT status, auto_reconnect, last_action 
FROM user_strategies 
WHERE user_id = (SELECT id FROM users WHERE email = 'alice@test.com');

-- Expected: status='active', auto_reconnect=true, last_action='manual_start'
```

#### 2.2 Backend Restart (Simulate Crash/Update)
```bash
# Find backend PM2 process
pm2 list

# Restart backend
pm2 restart tradebaas-backend

# Or manual restart:
# pm2 stop tradebaas-backend && pm2 start tradebaas-backend
```

#### 2.3 Verify Auto-Resume Logs
**Expected Logs:**
```
[UserStrategyService] 🔄 Initializing with auto-resume...
[UserStrategyService] 📋 Found 1 strategy to auto-resume
[UserStrategyService]    - Testnet: 1
[UserStrategyService]    - Live: 0
[UserStrategyService] ✅ Auto-resumed: alice:razor:BTC-PERPETUAL:deribit:testnet
[UserStrategyService] ✅ Auto-resume complete:
[UserStrategyService]    - Resumed: 1
[UserStrategyService]    - Skipped: 0
[UserStrategyService]    - Failed: 0
```

#### 2.4 Verify Database Updated
```sql
SELECT status, auto_reconnect, last_action, last_heartbeat
FROM user_strategies
WHERE user_id = (SELECT id FROM users WHERE email = 'alice@test.com');

-- Expected: 
-- status='active'
-- auto_reconnect=true
-- last_action='auto_resume'
-- last_heartbeat=NOW() (within last minute)
```

#### 2.5 Verify Frontend Shows Active Strategy
**User A (alice) View:**
- Refresh page or wait for polling
- Expected: Strategy shows 'active' status
- Strategy card shows running state

#### 2.6 Manual Stop (Set autoReconnect=false)
```bash
curl -X POST http://127.0.0.1:3000/api/user/strategy/stop \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "razor",
    "instrument": "BTC-PERPETUAL",
    "environment": "testnet"
  }'
```

**Verify:**
```sql
SELECT status, auto_reconnect, last_action
FROM user_strategies
WHERE user_id = (SELECT id FROM users WHERE email = 'alice@test.com');

-- Expected:
-- status='stopped'
-- auto_reconnect=false  ← CRITICAL
-- last_action='manual_stop'
```

#### 2.7 Backend Restart Again
```bash
pm2 restart tradebaas-backend
```

#### 2.8 Verify NO Auto-Resume
**Expected Logs:**
```
[UserStrategyService] 🔄 Initializing with auto-resume...
[UserStrategyService] ℹ️  No strategies to auto-resume
```

**Database:**
```sql
SELECT status, auto_reconnect, last_action
FROM user_strategies
WHERE user_id = (SELECT id FROM users WHERE email = 'alice@test.com');

-- Expected: Still stopped, auto_reconnect=false, last_action unchanged
```

### Expected Outcome
- ✅ **Auto-resume works:** Strategy resumes after restart if autoReconnect=true
- ✅ **Manual stop respected:** No auto-resume if autoReconnect=false
- ✅ **Database accurate:** autoReconnect flag correctly set
- ✅ **Logs clear:** Summary shows resumed/skipped counts

---

## Test Scenario 3: Concurrent Strategies (Single User)

### Objective
Verify that a single user can run multiple strategies simultaneously without conflicts.

### Test Steps

#### 3.1 Start Razor for User A
```bash
curl -X POST http://127.0.0.1:3000/api/user/strategy/start \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "razor",
    "instrument": "BTC-PERPETUAL",
    "environment": "testnet",
    "config": { "targetProfit": 50, "stopLoss": 30, "tradeAmount": 10 }
  }'
```

#### 3.2 Start Thor for User A (Same User, Different Strategy)
```bash
curl -X POST http://127.0.0.1:3000/api/user/strategy/start \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "thor",
    "instrument": "ETH-PERPETUAL",
    "environment": "testnet",
    "config": { "targetProfit": 100, "stopLoss": 50, "tradeAmount": 20 }
  }'
```

#### 3.3 Verify Database
```sql
SELECT strategy_name, instrument, status
FROM user_strategies
WHERE user_id = (SELECT id FROM users WHERE email = 'alice@test.com')
ORDER BY strategy_name;

-- Expected: 2 rows
-- razor, BTC-PERPETUAL, active
-- thor, ETH-PERPETUAL, active
```

#### 3.4 Verify In-Memory
**Backend Logs:**
```
[UserStrategyService] ✅ Strategy started: alice:razor:BTC-PERPETUAL:deribit:testnet
[UserStrategyService] ✅ Strategy started: alice:thor:ETH-PERPETUAL:deribit:testnet
```

**Verification:** `runningStrategies` Map has 2 entries for alice

#### 3.5 Verify Trade History Separation
```sql
-- SQLite
SELECT user_id, strategy, instrument, COUNT(*) as trade_count
FROM trades
WHERE user_id = (SELECT id FROM users WHERE email = 'alice@test.com')
GROUP BY strategy, instrument;

-- Expected: 2 rows (if trades executed)
-- razor, BTC-PERPETUAL, X trades
-- thor, ETH-PERPETUAL, Y trades
```

#### 3.6 Verify Frontend
**User A View:**
- Navigate to Strategies page
- Expected: Sees BOTH strategies
  - Razor (BTC-PERPETUAL) - active
  - Thor (ETH-PERPETUAL) - active
- Both cards render correctly
- Independent start/stop buttons

### Expected Outcome
- ✅ **Concurrent execution:** Both strategies run independently
- ✅ **No conflicts:** Separate executors, separate trades
- ✅ **Database:** 2 entries per user
- ✅ **Frontend:** UI shows both strategies correctly

---

## Test Scenario 4: Edge Cases & Error Handling

### 4.1 Invalid JWT
```bash
curl -X POST http://127.0.0.1:3000/api/user/strategy/start \
  -H "Authorization: Bearer INVALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"strategyName": "razor", "instrument": "BTC-PERPETUAL", "environment": "testnet"}'

# Expected: 401 Unauthorized
```

### 4.2 User Not Connected to Broker
```bash
# User C (no Deribit credentials)
CHARLIE_TOKEN=$(curl -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "charlie@test.com", "password": "TestPassword123!"}' \
  | jq -r '.token')

curl -X POST http://127.0.0.1:3000/api/user/strategy/start \
  -H "Authorization: Bearer $CHARLIE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"strategyName": "razor", "instrument": "BTC-PERPETUAL", "environment": "testnet"}'

# Expected: { "success": false, "message": "User is not connected to broker. Please connect first." }
```

### 4.3 Duplicate Strategy Start
```bash
# Start same strategy twice
curl -X POST http://127.0.0.1:3000/api/user/strategy/start \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"strategyName": "razor", "instrument": "BTC-PERPETUAL", "environment": "testnet"}'

# Expected: { "success": false, "message": "Strategy is already running" }
```

### 4.4 Auto-Resume with User Disconnected
**Setup:**
1. User A starts Razor
2. Backend stores strategy (status='active', autoReconnect=true)
3. User A disconnects from Deribit (broker connection lost)
4. Backend restarts

**Expected Behavior:**
- Logs: `⚠️  Skipping alice:razor:BTC-PERPETUAL: User not connected to broker`
- Database: status='paused', last_action='auto_resume_skipped'
- Summary: Resumed: 0, Skipped: 1

**Verification:**
```sql
SELECT status, last_action
FROM user_strategies
WHERE user_id = (SELECT id FROM users WHERE email = 'alice@test.com');

-- Expected: status='paused', last_action='auto_resume_skipped'
```

### Expected Outcome
- ✅ **Error handling:** All edge cases handled gracefully
- ✅ **No crashes:** Backend stays online
- ✅ **Clear messages:** Errors logged and returned to frontend
- ✅ **Database consistent:** No corrupt state

---

## Test Scenario 5: UI/UX Verification

### Objective
**CRITICAL:** Verify that existing UI works EXACTLY as before. Zero breaking changes.

### 5.1 StrategyTradingCard Component
**Test:**
1. Login as alice@test.com
2. Navigate to Strategies page
3. Find StrategyTradingCard for Razor

**Verify:**
- ✅ Card renders without errors
- ✅ Strategy name displayed correctly
- ✅ Instrument displayed correctly
- ✅ Start button functional
- ✅ Stop button functional (when strategy active)
- ✅ Status indicator shows correct state (active/stopped)
- ✅ Config displayed (if applicable)
- ✅ No console errors
- ✅ No broken layouts
- ✅ Styling intact (colors, spacing, typography)

### 5.2 Real-Time Updates
**Test:**
1. Start strategy via API (not UI)
2. Wait for frontend polling (1-3 seconds)

**Verify:**
- ✅ Strategy status updates automatically
- ✅ Card shows 'active' state
- ✅ No page refresh needed
- ✅ WebSocket updates work (if applicable)

### 5.3 Multi-Strategy View
**Test:**
1. Start Razor + Thor for alice
2. View Strategies page

**Verify:**
- ✅ Both strategies displayed
- ✅ Separate cards for each
- ✅ No overlap or conflicts
- ✅ Independent controls

### 5.4 Browser Console Check
**Verify:**
- ✅ No JavaScript errors
- ✅ No React warnings
- ✅ No 404s for API calls
- ✅ No CORS errors

### 5.5 Responsive Design
**Test:**
- Desktop view (1920x1080)
- Tablet view (768x1024)
- Mobile view (375x667)

**Verify:**
- ✅ Layout adapts correctly
- ✅ No horizontal scroll
- ✅ Buttons accessible
- ✅ Text readable

### Expected Outcome
- ✅ **UI Unchanged:** Existing components work exactly as before
- ✅ **No Regressions:** Zero new bugs introduced
- ✅ **UX Intact:** User experience identical to pre-FASE implementation

---

## Database Verification Queries

### PostgreSQL Queries

#### Check User Strategies
```sql
SELECT 
  u.email,
  us.strategy_name,
  us.instrument,
  us.status,
  us.auto_reconnect,
  us.last_action,
  us.connected_at,
  us.last_heartbeat
FROM user_strategies us
JOIN users u ON us.user_id = u.id
WHERE us.broker = 'deribit'
ORDER BY u.email, us.strategy_name;
```

#### Check Broker Credentials
```sql
SELECT 
  u.email,
  ubc.broker,
  ubc.environment,
  ubc.created_at
FROM user_broker_credentials ubc
JOIN users u ON ubc.user_id = u.id
ORDER BY u.email;
```

### SQLite Queries (Trades Database)

#### Check Trade History Per User
```sql
SELECT 
  user_id,
  strategy,
  instrument,
  side,
  entry_price,
  amount,
  profit_loss,
  timestamp
FROM trades
WHERE user_id IS NOT NULL
ORDER BY user_id, timestamp DESC
LIMIT 20;
```

#### Verify User Isolation
```sql
SELECT 
  user_id,
  COUNT(*) as trade_count,
  SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as wins,
  SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) as losses,
  SUM(profit_loss) as total_pnl
FROM trades
WHERE user_id IS NOT NULL
GROUP BY user_id;
```

---

## API Endpoint Tests

### Health Check
```bash
curl http://127.0.0.1:3000/health
# Expected: { "status": "ok", "timestamp": "..." }
```

### User Strategy Status
```bash
curl http://127.0.0.1:3000/api/user/strategy/status?broker=deribit&environment=testnet \
  -H "Authorization: Bearer $ALICE_TOKEN"

# Expected: { "success": true, "strategies": [...] }
```

### User Trade History
```bash
curl http://127.0.0.1:3000/api/user/trades/history \
  -H "Authorization: Bearer $ALICE_TOKEN"

# Expected: { "success": true, "trades": [...] }
```

### User Trade Stats
```bash
curl http://127.0.0.1:3000/api/user/trades/stats \
  -H "Authorization: Bearer $ALICE_TOKEN"

# Expected: { "success": true, "stats": { "totalTrades": X, "winRate": Y, "totalPnl": Z } }
```

---

## Performance Metrics

### Server Boot Time
```bash
# Before restart
time pm2 restart tradebaas-backend

# Expected: <5 seconds (including auto-resume)
```

### Memory Usage
```bash
pm2 monit

# Check backend memory usage with 0, 5, 10 concurrent strategies
```

### API Response Times
```bash
# Test strategy start latency
time curl -X POST http://127.0.0.1:3000/api/user/strategy/start \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'

# Expected: <1 second
```

---

## Success Criteria

### ✅ FASE 6 Complete When:
1. ✅ All 5 test scenarios pass
2. ✅ Database queries show correct isolation
3. ✅ API endpoints return expected responses
4. ✅ UI/UX unchanged (zero regressions)
5. ✅ No console errors
6. ✅ Auto-resume works correctly
7. ✅ Multi-user isolation verified
8. ✅ Edge cases handled gracefully
9. ✅ Documentation complete (this test plan + results)
10. ✅ MASTER.md updated

---

## Known Issues to Document

### None Expected (But Track If Found)
- Issue 1: ...
- Issue 2: ...
- Workaround: ...

---

## Next Steps After FASE 6

1. Document all test results in FASE_6_COMPLETION_REPORT.md
2. Update MASTER.md with FASE 6 completion status
3. Move to FASE 7: Production Deployment
   - Environment configuration
   - Monitoring setup (Prometheus/Grafana)
   - Load testing
   - Documentation update
   - Production launch

---

**Test Plan Status:** 🧪 READY FOR EXECUTION  
**Expected Duration:** 2-3 hours (manual testing)  
**Automation Potential:** High (convert to Jest/Vitest tests later)

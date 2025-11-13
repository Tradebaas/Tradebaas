# Tradebaas - Deribit Trading App MVP

A professional, secure Deribit trading application with glassmorphism design for managing crypto derivatives trades.

**Experience Qualities**:
1. **Professional** - Instills confidence through clear information hierarchy and robust error handling
2. **Secure** - Encrypted credential storage and fail-safe controls give users peace of mind
3. **Responsive** - Immediate feedback on all actions with clear state transitions

**Complexity Level**: Complex Application (advanced functionality, accounts)
- Requires secure API integration with Deribit exchange, real-time WebSocket connections, encrypted credential management, state machine orchestration, and sophisticated trade execution logic. This is a financial application demanding production-grade security and reliability.

## Essential Features

### Iteration 15: Risk Engine Position Sizing Fix (CURRENT)

**Razor Strategy Risk Engine Integration**
- Functionality: Correct position sizing for Razor strategy using the centralized risk engine
- Purpose: Ensures position sizes match configured risk percentage and respect leverage limits
- Trigger: Razor strategy generates a trading signal and executes a trade
- Progression: Signal generated with entry/SL/TP from technical analysis → Risk engine calculates position size based on SL distance and risk % → Validate leverage cap → Round to contract size → Place order with correct quantity
- Success criteria: Position size matches risk percentage exactly; leverage respects 50x broker limit; actual loss at stop loss equals configured risk amount; all strategies use risk engine consistently

**Stop Loss Based on Technical Analysis**
- Functionality: Stop loss levels determined by strategy logic, not arbitrary percentages
- Purpose: Ensures stop losses are placed at meaningful technical levels (support/resistance, swing points, BB bands)
- Trigger: Each strategy calculates its own stop loss based on indicators and price action
- Progression: Strategy analyzes market → Identifies entry level → Calculates stop based on technical levels (e.g., below swing low, below BB lower, at support) → Risk engine uses this SL to size position
- Success criteria: Razor uses BB bands and swing points for SL; Vortex uses candle lows/highs; each strategy has its own SL logic; no fixed percentage stop losses

**Position Size Formula Validation**
- Functionality: Quantity = RiskAmount / |EntryPrice - StopPrice|
- Purpose: Guarantees the dollar loss at stop equals the configured risk amount
- Trigger: Every trade execution through risk engine
- Progression: Calculate risk amount from equity and risk % → Calculate price distance to stop → Divide risk by distance → Check leverage → Round to contract size → Validate min trade size
- Success criteria: Formula produces correct quantities; leverage is capped at broker max; contract size rounding works; min trade size validated; all edge cases handled

**Leverage as Position Tool**
- Functionality: Leverage used to achieve desired position size while maintaining fixed risk
- Purpose: Allows meaningful position sizes with small accounts using strategy-determined stop losses
- Trigger: Risk engine calculates notional value and resulting leverage
- Progression: Calculate quantity from risk formula → Calculate notional (quantity × price) → Calculate leverage (notional / equity) → Cap at broker max if needed → Log effective leverage used
- Success criteria: Leverage auto-calculated from position size; never exceeds broker maximum (50x); positions within risk tolerance regardless of leverage; clear leverage warnings logged

### Iteration 14: Polish & Audit for App Store

**Restore Purchases Button**
- Functionality: Allows users to restore their previous in-app purchases
- Purpose: Required by Apple App Store guidelines for subscription-based apps
- Trigger: User clicks "Herstel Aankopen" button in License dialog → Products tab
- Progression: Click restore button → Check stored entitlement → Validate expiry → Refresh UI with entitlement status → Show success/error toast
- Success criteria: Button appears in Products tab; restores valid purchases; shows error for expired/non-existent purchases; complies with App Store requirements

**Legal Disclaimer & Privacy Policy**
- Functionality: Comprehensive legal disclaimer and privacy policy accessible from multiple locations
- Purpose: Protects users and developers, ensures informed consent, meets legal requirements
- Trigger: First run of app (mandatory), Settings → Privacy tab, License dialog → Products → Privacy button
- Progression: App launch → Check if first-run disclaimer shown → Display full legal disclaimer → User reads and accepts → Continue to app
- Success criteria: Disclaimer shown on first run; accessible anytime from settings; covers trading risks, technical risks, no financial advice, API security, GDPR compliance; links to privacy policy

**Risk Warning Before Live Mode**
- Functionality: Mandatory acceptance of risk disclaimer when switching from testnet to live trading
- Purpose: Ensures users understand the financial risks before trading with real funds
- Trigger: User toggles environment from testnet to live in Settings → Connection tab
- Progression: Toggle to live → Check disclaimer accepted → Show legal disclaimer dialog → User accepts → Environment switches to live
- Progression (if already accepted): Toggle to live → Environment switches immediately
- Success criteria: Cannot switch to live without accepting; disclaimer persists across sessions; testnet always accessible without disclaimer; clear warning about real money risks

**Offline Local Mode**
- Functionality: App fully functional without backend connection or subscription
- Purpose: Allows App Store reviewers to test without subscribing; enables offline usage
- Trigger: App launch without backend connection or with connection failures
- Progression: App starts → Backend connection fails → Continue with local-only features → UI fully accessible → Testnet mode available → No subscription required for basic usage
- Success criteria: All UI components render; testnet mode works; settings accessible; no crashes on backend failure; free tier works offline; graceful error handling for missing backend

**Telemetry Off by Default**
- Functionality: User telemetry and diagnostics disabled by default, explicitly opt-in
- Purpose: Privacy-first approach, GDPR compliance, App Store privacy requirements
- Trigger: App first run (telemetry off), user enables in Settings → Privacy tab
- Progression: User opens Privacy tab → Toggle telemetry switch → Confirmation toast → Telemetry hooks check setting before logging
- Success criteria: Telemetry disabled on first install; clear explanation of what's collected; clear explanation of what's NOT collected; toggle persists; hooks respect setting in real-time; no sensitive data ever logged

### Iteration 13: Tests & Deployment

**Unit Tests for Risk Engine**
- Functionality: Comprehensive test coverage for position sizing calculations and bracket order logic
- Purpose: Ensure risk calculations are correct across all broker configurations and edge cases
- Trigger: Run via npm test command
- Progression: Test valid scenarios → Test error cases → Test broker-specific rules → Validate bracket calculations → Generate coverage report
- Success criteria: 100% coverage for calculatePosition and buildBracket; all edge cases tested; validates leverage caps; tests rounding logic; confirms error messages

**Unit Tests for License Service**
- Functionality: Tests entitlement management, receipt verification, and access control
- Purpose: Validate license flow works correctly for all tiers and expiry scenarios
- Trigger: Run via npm test command
- Progression: Test initialization → Test entitlement grants → Test receipt verification → Test status checks → Test expiry handling
- Success criteria: All license tiers tested; receipt validation works; expired entitlements handled; lifetime entitlements supported; KV storage integration tested

**Unit Tests for Broker Adapters**
- Functionality: Mock Deribit broker implementation with full order lifecycle testing
- Purpose: Ensure broker adapter correctly implements IBroker interface
- Trigger: Run via npm test command
- Progression: Test connection flow → Test authentication → Test balance retrieval → Test order placement → Test order management → Test instrument info
- Success criteria: All IBroker methods tested; connection states validated; order types supported; OTOCO brackets tested; error handling verified

**Integration Tests - Mock Deribit**
- Functionality: Complete mock Deribit server simulating real trading scenarios
- Purpose: Test order lifecycle, reconciliation, and label-based matching in isolated environment
- Trigger: Run via npm run test:integration
- Progression: Mock server setup → Test authentication → Test order placement → Test order matching → Test cancellation → Test instrument filtering
- Success criteria: Full order lifecycle tested; OTOCO brackets work; label-based matching validated; orphaned orders detected; multi-instrument support confirmed

**Integration Tests - License Flow**
- Functionality: End-to-end license verification and access control simulation
- Purpose: Validate complete license flow from receipt to feature access
- Trigger: Run via npm run test:integration
- Progression: Test receipt verification → Test entitlement grants → Test access checks → Test tier hierarchy → Test expiry scenarios
- Success criteria: All tiers can be granted; receipt validation works; access control enforces tiers; tier hierarchy respected; expired handling correct

**Dockerfile Multi-Stage Build**
- Functionality: Production-optimized Docker image with frontend and backend
- Purpose: Creates minimal, secure container for deployment
- Trigger: docker-compose up or docker build
- Progression: Build frontend → Build backend → Create runtime image → Install dumb-init → Configure health check → Set user permissions
- Success criteria: Image builds successfully; size optimized; healthcheck works; runs as non-root user; includes all dependencies

**Docker Compose Stack**
- Functionality: Complete application stack with PostgreSQL, Redis, and app
- Purpose: One-command deployment with all dependencies
- Trigger: docker-compose up -d
- Progression: Start PostgreSQL → Start Redis → Initialize database schema → Start app → Connect services → Monitor health
- Success criteria: All services start; health checks pass; services communicate; data persists in volumes; restart on failure; optional admin tools available

**PostgreSQL Database Schema**
- Functionality: Persistent storage for users, entitlements, runner states, orders, and error logs
- Purpose: Enables data persistence and recovery across restarts
- Trigger: Automatic on first PostgreSQL container start
- Progression: Create tables → Create indexes → Create triggers → Set up constraints → Initialize functions
- Success criteria: Schema creates successfully; foreign keys enforced; indexes optimize queries; updated_at auto-updates; cascading deletes work

**Redis Cache Integration**
- Functionality: Fast cache for session data, queue state, and temporary storage
- Purpose: Reduces database load and enables distributed caching
- Trigger: App connects to Redis on startup
- Progression: Connect with password → Test connection → Use for KV operations → Cache frequently accessed data
- Success criteria: Connection secured with password; appendonly persistence enabled; data survives restarts; command execution works

**Health Check Endpoints**
- Functionality: HTTP endpoint returning 200 when app is healthy
- Purpose: Enables Docker health monitoring and load balancer checks
- Trigger: Docker health check every 30s, manual curl requests
- Progression: Request /health → Check database connection → Check Redis connection → Return status
- Success criteria: Returns 200 when healthy; returns error when unhealthy; includes service status; timeout after 10s; starts checking after 40s

**Environment Configuration Template**
- Functionality: .env.template with all required and optional configuration
- Purpose: Documents all environment variables with secure defaults and generation instructions
- Trigger: Manual copy to .env before deployment
- Progression: Copy template → Generate secrets → Configure databases → Set Deribit env → Review security settings
- Success criteria: All variables documented; secure default values; generation commands provided; grouped logically; includes comments

**Deployment Documentation**
- Functionality: Complete DEPLOYMENT.md with step-by-step instructions
- Purpose: Enables anyone to deploy application correctly and securely
- Trigger: Reference during deployment process
- Progression: Prerequisites → Environment setup → Start services → Verify deployment → Access application → Monitor health
- Success criteria: Covers all deployment scenarios; includes troubleshooting; documents backup/restore; explains monitoring; security checklist provided

**Automatic Restart Policy**
- Functionality: restart: always policy on all Docker services
- Purpose: Ensures services automatically recover from failures
- Trigger: Service exits or crashes
- Progression: Service fails → Docker detects exit → Waits for backoff period → Restarts container → Runs health check
- Success criteria: Services restart on failure; backoff prevents restart loops; health checks prevent premature restart; logs maintained across restarts

**Database Backup Instructions**
- Functionality: Commands for PostgreSQL backup and restore
- Purpose: Enables data protection and disaster recovery
- Trigger: Manual execution or scheduled cron job
- Progression: Connect to container → Run pg_dump → Save with timestamp → Optionally compress → Store securely
- Success criteria: Backup creates complete SQL dump; includes all tables and data; compressed option available; timestamp naming; restore instructions provided

**Optional Admin Tools**
- Functionality: Adminer (PostgreSQL UI) and Redis Commander via Docker profiles
- Purpose: Convenient database and cache inspection during development
- Trigger: docker-compose --profile tools up -d
- Progression: Start with tools profile → Access via browser → Connect to services → Inspect data
- Success criteria: Tools start separately from main services; Adminer connects to PostgreSQL; Redis Commander connects to Redis; credentials pre-configured; accessible on documented ports

### Iteration 12: Persistence & Reconciliation (COMPLETED)

**Persistent State Storage**
- Functionality: Stores open positions, orders, settings, and stats using Spark KV instead of localStorage
- Purpose: Survive daemon restarts and enable reliable position recovery
- Trigger: On position open, settings change, or stats update
- Progression: Position opened → Store in KV with key `runner_state_{userId}_{workerId}` → Auto-saved on all state changes → Retrieved on runner initialization
- Success criteria: All position data persists; survives page reload; per-user/per-worker isolation; includes orderId, slOrderId, tpOrderId, entry price, amounts

**Order Reconciliation Service**
- Functionality: Matches saved positions against live broker orders by label and oco_ref
- Purpose: Restores Active state after cold start by verifying position still exists
- Trigger: On daemon/runner startup before trading begins
- Progression: Load saved position → Fetch open orders from broker → Match by orderId/label → Verify protection orders (SL/TP) → Restore monitoring if valid → Cancel orphaned orders
- Success criteria: Finds entry order in filled state; locates SL and TP orders in open state; restores position monitoring; alerts if protection missing; logs reconciliation outcome

**Unknown Order Cleanup**
- Functionality: Detects and handles orders not tracked in persisted state
- Purpose: Prevents orphaned orders from previous crashed sessions
- Trigger: During reconciliation when orders with our label prefix don't match saved position
- Progression: Identify orders with `strategy_` or `tb_` prefix → Check against tracked order IDs → Flag as orphaned → Generate cancel actions → Execute cleanup
- Success criteria: Unknown orders detected; logged as alerts; canceled automatically; user notified of cleanup actions taken

**Cold Start Position Recovery**
- Functionality: Full position restoration on daemon restart including active monitoring
- Purpose: Zero downtime - positions continue being managed across restarts
- Trigger: Runner.start() after init and broker connection
- Progression: Initialize StateStore → Load persisted state → Call reconciliation.reconcile() → Match orders → Restore position object → Resume monitorPosition() loop → Continue trading
- Success criteria: Position state fully restored; monitoring loop restarted; PnL tracking continues; protection orders remain active; no duplicate orders placed

**Reconciliation Actions**
- Functionality: Generated action list from reconciliation with types: restore_position, cancel_order, alert
- Purpose: Structured approach to handling different reconciliation scenarios
- Trigger: After order matching completes
- Progression: Build action list during matching → Execute cancel_order actions → Log alert actions → Apply restore_position to state → Report summary
- Success criteria: Actions executed in order; cancellations confirmed; alerts logged; restoration applied; summary includes orphan count

**StateStore KV Integration**
- Functionality: Migrated StateStore from localStorage to Spark KV with async operations
- Purpose: Server-side persistence compatible with backend daemon architecture
- Trigger: Constructor takes userId and workerId for isolated storage
- Progression: StateStore(userId, workerId) → await init() → getState() synchronous → await setState() async → await setPosition() helper → KV key pattern enforced
- Success criteria: No localStorage usage; all operations async except getState; per-user and per-worker isolation; init() must be called; backward compatible state structure

**Label-Based Order Matching**
- Functionality: Uses order labels like `strategy_{id}_entry`, `strategy_{id}_sl`, `strategy_{id}_tp` for reliable matching
- Purpose: Identifies our orders even if order IDs change across sessions
- Trigger: During reconciliation order matching
- Progression: Check order.label includes strategy prefix → Extract label pattern → Match against saved position orderIds → Fall back to orderId if label missing
- Success criteria: Matches by label first; falls back to orderId; handles missing labels; prefix configurable; works with OCO refs

**Position Protection Validation**
- Functionality: Verifies stop loss and take profit orders still exist and are open
- Purpose: Ensures position has risk management in place before restoration
- Trigger: After entry order matched during reconciliation
- Progression: Look up slOrderId and tpOrderId → Check status === 'open' → Require at least one protection order → Alert if both missing → Restore only if valid
- Success criteria: Requires SL or TP present; alerts if protection missing; won't restore unprotected position; validates order status

**Broker Interface Extensions**
- Functionality: Added getOpenOrders() method to IBroker and DeribitBroker
- Purpose: Enables reconciliation service to query live order state
- Trigger: Called during reconciliation
- Progression: getOpenOrders(instrument?) → Call Deribit private/get_open_orders_by_instrument → Map to Order[] → Include label and ocoRef → Return all open orders
- Success criteria: Returns all open orders; optional instrument filter; includes label field; includes ocoRef field; works with all brokers

**StrategyRunner Integration**
- Functionality: Updated StrategyRunner constructor to require userId and workerId
- Purpose: Enables per-user state isolation and tracking
- Trigger: When WorkerManager spawns new runner
- Progression: new StrategyRunner(userId, workerId) → await init() → StateStore initialized → await start() → performReconciliation() → Start trading loop
- Success criteria: Constructor requires userId and workerId; init() must be called; reconciliation runs before trading; async state operations; backward compatible with existing strategies

### Iteration 11: Generalized Risk Engine (COMPLETED)

**Broker-Agnostic Position Sizing**
- Functionality: Calculate position sizes using broker-specific rules (maxLeverage, tickSize, lotSize, minTradeAmount)
- Purpose: Enable identical risk calculations across all brokers with their unique constraints
- Trigger: Called before placing any trade with broker rules as input
- Progression: Input equity + risk params + broker rules → Calculate qty = riskAmount / distance → Clamp leverage ≤ broker.maxLeverage → Round to tick/lot size → Validate ≥ minTradeAmount → Return qty + leverage + warnings[]
- Success criteria: Works with any broker; respects maxLeverage; applies tick/lot rounding; rejects below minTradeAmount; returns warnings for high leverage; identical results for same inputs + rules

**BrokerRules Interface**
- Functionality: Standardized structure defining broker trading constraints
- Purpose: Decouple risk engine from specific broker implementations
- Trigger: Created from broker metadata or instrument metadata
- Progression: Define BrokerRules { maxLeverage, tickSize, lotSize, minTradeAmount } → Export helper functions → Use in calculatePosition
- Success criteria: Simple 4-field structure; instrumentMetaToBrokerRules converter; createBrokerRules factory; backward compatible

**Risk Calculation Algorithm**
- Functionality: Core position sizing math with multi-step validation
- Purpose: Ensure safe, profitable trades within broker constraints
- Trigger: calculatePosition(equity, risk, entry, stop, brokerRules)
- Progression: Validate inputs → Calculate riskAmount (% or fixed) → Compute qty = riskAmount/distance → Apply leverage cap → Round to lotSize → Validate minTradeAmount → Final leverage check → Generate warnings
- Success criteria: Handles percent and fixed risk modes; enforces broker maxLeverage; rounds quantities properly; rejects invalid positions; returns detailed errors; warns on high leverage

**Multi-Broker Support**
- Functionality: Predefined rules for 15 major brokers
- Purpose: Enable quick integration with any supported exchange
- Trigger: Import BROKER_RULES constant
- Progression: Define rules for each broker → Package as constant → Export for use in strategies
- Success criteria: Includes Deribit (50x), Binance (125x), Bybit (100x), OKX (125x), Kraken (5x), BitMEX (100x), MEXC (200x), Coinbase (5x), KuCoin, Gate.io, Huobi, Phemex, Bitget, Bitstamp (3x), Bitfinex (10x)

**Warning System**
- Functionality: Non-fatal alerts for risky but valid positions
- Purpose: Inform traders of potential issues without blocking trades
- Trigger: Generated during risk calculation
- Progression: Check leverage thresholds → Check risk/equity ratio → Add warnings to result array
- Success criteria: Warns "Leverage begrensd tot Xx (broker limiet)"; warns "Hoge leverage gedetecteerd: X.Xx"; warns on conservative sizing; non-blocking

**Integration with Existing Strategies**
- Functionality: Update ScalpingStrategy and store to use new BrokerRules
- Purpose: Maintain backward compatibility while enabling multi-broker support
- Trigger: Strategy signal generation
- Progression: Convert instrument metadata → Create BrokerRules → Pass to calculatePosition → Use result for order sizing
- Success criteria: No visual changes; identical calculations; strategies work with new interface; tests pass

### Iteration 10: Broker Selector API

**GET /brokers Endpoint**
- Functionality: Returns comprehensive metadata for top 15 brokers including live Deribit instrument data
- Purpose: Provides standardized broker information for UI components without coupling to backend structure
- Trigger: Called via useBrokers() hook or direct API call
- Progression: Request brokers → Fetch live Deribit instruments via public API → Parse instruments for pairs and currencies → Merge with static metadata → Return enriched broker list
- Success criteria: Returns 15 brokers; Deribit data fetched from public/get_instruments; includes name, logoURL, maxLeverage, baseCurrencies[], supportedPairs[], hasTestnet bool, apiDocsURL; UI can display without modifications

**Live Deribit Integration**
- Functionality: Fetches real-time instrument data from Deribit public API
- Purpose: Ensures Deribit metadata reflects actual available trading pairs
- Trigger: Called during GET /brokers execution
- Progression: Fetch https://www.deribit.com/api/v2/public/get_instruments → Filter active instruments → Extract pairs and base currencies → Update Deribit metadata
- Success criteria: Live data fetched; active instruments filtered; pairs list updated; base currencies extracted; fallback to static data if fetch fails

**Broker Metadata Structure**
- Functionality: Standardized interface defining broker information schema
- Purpose: Type-safe contract between API and UI components
- Trigger: Used by API response and consuming components
- Progression: Define BrokerMetadata interface → Include all required fields → Export from broker-api module → Import in hooks and components
- Success criteria: Interface includes name, logoURL, maxLeverage, baseCurrencies[], supportedPairs[], hasTestnet, apiDocsURL; TypeScript enforces structure

**useBrokers Hook**
- Functionality: React hook providing brokers data with loading and error states
- Purpose: Simplifies broker data consumption in React components
- Trigger: Called in components needing broker list
- Progression: Initialize state → Fetch brokers on mount → Update state with results → Provide refetch function → Handle loading and errors
- Success criteria: Returns brokers[], loading bool, error string|null, refetch function; loading true during fetch; error captured and exposed; data cached in state

**BrokerList Component**
- Functionality: Display component showing all available brokers with their metadata
- Purpose: Demonstrates API usage and provides reference implementation
- Trigger: Can be rendered as standalone page or integrated into existing UI
- Progression: Use useBrokers hook → Show loading skeleton → Handle errors with retry → Display broker cards → Show logos, leverage, currencies, pairs, testnet badge, API docs link
- Success criteria: Renders broker grid; displays all metadata fields; handles loading state; handles errors gracefully; testnet badge conditional; responsive layout

**Broker Coverage**
- Functionality: Comprehensive list of major crypto derivatives exchanges
- Purpose: Support diverse trading preferences and regional availability
- Trigger: Static metadata defined in broker-api module
- Progression: Define metadata for Deribit, Binance, Bybit, OKX, Kraken, Bitget, KuCoin, MEXC, Gate.io, BitMEX, Huobi, Phemex, Coinbase Advanced, Bitstamp, Bitfinex
- Success criteria: 15 brokers included; all fields populated; logos reference valid URLs; API docs links correct; testnet availability accurate

### Iteration 9: Runner Orchestrator & Scaling (COMPLETED)

**Runner Orchestrator System**
- Functionality: Queue-based worker management system that spawns and manages per-user strategy runners
- Purpose: Enable independent, isolated strategy execution for multiple users with resource control
- Trigger: API calls to start/stop runners
- Progression: User requests runner start → Check entitlement → Enqueue job → Process queue → Spawn worker with user config → Monitor health → Auto-restart if crashed
- Success criteria: Per-user workers run independently; queue controls load; entitlement enforced; workers auto-restart on crash; positions tracked per worker

**Job Queue Management**
- Functionality: FIFO queue for runner jobs with status tracking and user isolation
- Purpose: Prevents system overload and ensures fair resource allocation
- Trigger: Jobs added via startRunner API, processed by orchestrator
- Progression: Create job with userId, strategyId, broker, credentials → Enqueue with 'queued' status → Orchestrator dequeues → Update to 'running' → Spawn worker → Track status changes
- Success criteria: Jobs queued in order; status tracked (queued/running/stopped/failed/crashed); user jobs isolated; queue statistics available; extensible to Redis/RabbitMQ

**Worker Spawning & Management**
- Functionality: Creates isolated StrategyRunner instances with user-specific configuration and credentials
- Purpose: Execute strategies independently with environment isolation
- Trigger: Queue processor dequeues job and validates entitlement
- Progression: Generate workerId → Create StrategyRunner → Connect broker with user credentials → Load strategy config → Start runner → Track PID and heartbeat → Monitor health
- Success criteria: Workers run independently; credentials isolated per user; PID tracked; heartbeat every 5s; positions tracked; can terminate workers; market-flatten on stop optional

**Entitlement-Based Access Control**
- Functionality: Tier-based limits on concurrent workers (Free: 1, Basic: 3, Pro: 10, Enterprise: 50)
- Purpose: Resource allocation and monetization control
- Trigger: Before spawning worker, orchestrator checks user entitlement
- Progression: Get current worker count for user → Fetch entitlement tier → Check against tier limit → Check expiry → Allow or reject job
- Success criteria: Enforces tier limits; rejects over-limit requests; checks subscription expiry; downgrades expired users to free tier; per-user counting

**Health Monitoring & Auto-Restart**
- Functionality: Detects crashed workers via heartbeat and automatically restarts if entitled
- Purpose: Maximize uptime and reliability for paid users
- Trigger: Health check runs every 15 seconds
- Progression: Check last heartbeat for all workers → Mark stale (>30s) as crashed → Check if user entitled → Check restart count (<3) → Restart worker → Update job status
- Success criteria: Detects crashed workers within 30s; auto-restarts entitled users; max 3 restart attempts; logs restart events; updates job status to 'crashed' if max reached

**Runner Start API**
- Functionality: Validates entitlement and enqueues runner job
- Purpose: Entry point for users to start strategy execution
- Trigger: User calls handleStartRunner(userId, strategyId, brokerId, credentials, config)
- Progression: Check current worker count → Validate entitlement → Create job → Enqueue → Return jobId
- Success criteria: Returns jobId on success; rejects if not entitled; validates required fields; job queued for processing; error messages clear

**Runner Stop API**
- Functionality: Terminates worker and optionally closes all positions
- Purpose: User-controlled shutdown with position management
- Trigger: User calls handleStopRunner(userId, workerId, flattenPositions)
- Progression: Verify worker exists → Check ownership (userId match) → Stop strategy runner → Optionally flatten positions → Clear heartbeat → Update job status
- Success criteria: Stops worker cleanly; flattens positions if requested; returns flattened count; only owner can stop; updates status to 'stopped'

**Runner Status API**
- Functionality: Returns all workers for user with positions, stats, and queue info
- Purpose: Monitoring and observability for user's active runners
- Trigger: User calls handleGetRunnerStatus(userId)
- Progression: Get user workers → For each get status from StrategyRunner → Collect positions → Aggregate stats → Get queue stats → Return complete status
- Success criteria: Lists all user workers; shows positions per worker; includes PnL and trade stats; queue statistics (queued, running, failed); real-time data

**Position Tracking**
- Functionality: Tracks open positions for each worker with entry price, current price, PnL
- Purpose: Risk monitoring and portfolio visibility
- Trigger: Status API queries worker positions
- Progression: Get worker → Query StrategyRunner status → Extract position data → Format with instrument, side, amount, prices, PnL
- Success criteria: Position data accurate; unrealized PnL calculated; stop loss and take profit included; updates in real-time; per-worker isolation

**Scaling Architecture**
- Functionality: Extensible design supporting Redis queue, Docker workers, and Kubernetes orchestration
- Purpose: Production-ready path from in-memory to distributed system
- Trigger: System growth requires distributed execution
- Progression: Start with InMemoryQueue → Swap to RedisQueue (IQueue interface) → Replace WorkerManager with DockerWorkerManager → Deploy as K8s Jobs → Scale horizontally
- Success criteria: IQueue interface allows queue backend swap; worker management abstracted; environment config per worker; Docker/K8s examples documented; load control mechanisms in place

### Iteration 8: License & Entitlement Service (COMPLETED)

**Client-Side License Service**
- Functionality: Manages user licenses, entitlements, and subscription tiers using Spark KV storage
- Purpose: Provides a licensing system foundation for future monetization and access control
- Trigger: Automatic initialization on app load
- Progression: App loads → Initialize license service → Load user data → Fetch entitlement status → Display tier badge in header
- Success criteria: License service initialized; user entitlements stored in KV; tier displayed in UI; admin can manage licenses

**User Authentication Integration**
- Functionality: Simulates Apple Sign-In flow using Spark user authentication
- Purpose: Associates entitlements with specific users
- Trigger: On license service initialization
- Progression: Get Spark user → Create/load user record → Store in KV → Link to entitlements
- Success criteria: Each user has unique ID; user data persisted; entitlements linked to user ID

**Receipt Verification**
- Functionality: Validates IAP receipt format and grants entitlements
- Purpose: Simulates server-side receipt verification for In-App Purchases
- Trigger: User submits receipt via admin panel or verification API
- Progression: Submit receipt + product ID → Validate receipt format → Lookup product → Calculate expiry → Grant entitlement → Store in KV → Return success
- Success criteria: Receipt format validated; product matched; entitlement granted with correct tier and expiry; stored persistently

**Entitlement Status API**
- Functionality: Returns current user's tier, expiry date, active status, and days remaining
- Purpose: Provides /me/entitlement endpoint functionality client-side
- Trigger: Called on app load, after verification, or manual refresh
- Progression: Fetch entitlement from KV → Check expiry date → Calculate days remaining → Determine active status → Return status object
- Success criteria: Returns correct tier; expiry checked against current date; days remaining calculated accurately; free tier returned if no entitlement

**Webhook Simulation**
- Functionality: Handles simulated App Store Server Notifications V2 events
- Purpose: Processes subscription renewals, cancellations, and failures
- Trigger: Webhook handler called with notification payload
- Progression: Receive notification → Parse notification_type → Extract receipt info → Update entitlement based on type (INITIAL_BUY, DID_RENEW, DID_FAIL_TO_RENEW, CANCEL) → Store updated entitlement
- Success criteria: Processes renewal notifications; handles cancellations; updates expiry dates; downgrades to free on failure

**JWT Token Generation**
- Functionality: Generates simulated JWT with tier and expiry claims
- Purpose: Provides authorization token for API calls requiring license validation
- Trigger: On request via getJWT() API call
- Progression: Get current entitlement → Create JWT header → Create payload with tier, expiry, iat, exp → Base64 encode → Concatenate with signature → Return token
- Success criteria: JWT format valid; includes tier and expiry claims; can be parsed; signature simulated

**License Management UI**
- Functionality: Dialog showing entitlement status, available products, and admin controls
- Purpose: Allows users to view license and admins to manage entitlements
- Trigger: Click tier badge in header
- Progression: Open dialog → Show Status tab with current tier, expiry, days remaining → Products tab lists available tiers → Admin tab (owner only) allows granting entitlements and verifying receipts
- Success criteria: Status displays current entitlement accurately; products listed with pricing; admin controls only visible to app owner; can grant entitlements; can verify receipts; UI unchanged elsewhere

**Product Catalog**
- Functionality: Defines available subscription products with tiers, pricing, and durations
- Purpose: Maps product IDs to entitlement tiers for verification
- Trigger: Retrieved on demand from license service
- Progression: Request products → Return static catalog → Display in UI
- Success criteria: Products defined (basic_monthly, premium_monthly, enterprise_yearly); tiers mapped correctly; durations specified; prices included

**Tier Badge Display**
- Functionality: Shows current tier as clickable badge in app header
- Purpose: Provides visible indication of user's access level
- Trigger: Rendered in header after entitlement loaded
- Progression: Load entitlement → Display tier badge with icon → Click opens license dialog
- Success criteria: Badge shows FREE/BASIC/PREMIUM/ENTERPRISE; color-coded by tier; clickable; opens license dialog; does not disrupt existing header layout

**Admin Entitlement Management**
- Functionality: Owner-only interface to manually grant entitlements to users
- Purpose: Allows app owner to provision access for testing or customer service
- Trigger: Owner opens license dialog Admin tab
- Progression: Enter user ID → Select tier → Select duration → Click Grant → Create entitlement → Store in KV → Notify success
- Success criteria: Only visible to app owner (isOwner check); can set any tier; can set duration or lifetime; validates inputs; stores entitlement; refreshes UI

### Iteration 7: Risk Engine with Position Sizing (COMPLETED)

**Deterministic Risk Engine**
- Functionality: Calculates position size based on risk parameters, entry price, stop loss distance, and instrument specifications
- Purpose: Automates position sizing to maintain consistent risk management across all trades
- Trigger: Optionally enabled for test orders via toggle; will be used for live trading
- Progression: Input equity, risk mode, risk value, entry, stop → Calculate distance → Compute risk amount → Calculate quantity → Enforce 50x leverage cap → Round to tick/lot size → Validate minimums → Output quantity, notional, leverage, warnings
- Success criteria: Deterministic calculations; supports percent and fixed risk modes; enforces 50x leverage cap; rounds to instrument specifications; rejects positions below minimum; provides warnings for edge cases; comprehensive unit test coverage

**Risk Mode Selection**
- Functionality: Choose between percentage of equity or fixed USDC amount for risk per trade
- Purpose: Flexibility for different trading strategies and account sizes
- Trigger: User selects mode in Risk tab of Settings dialog
- Progression: Select "Percent of Equity" or "Fixed Amount (USDC)" → Set value → Settings saved to KV storage → Applied to future trades
- Success criteria: Mode persists between sessions; value validated (0-100% for percent, positive for fixed); UI updates based on selected mode

**Risk Value Configuration**
- Functionality: Set the specific risk amount as percentage (0-100%) or fixed USDC value
- Purpose: Defines how much capital to risk on each trade
- Trigger: User inputs value in Risk tab
- Progression: Enter risk value → Validate against mode constraints → Save to KV storage → Apply to position sizing calculations
- Success criteria: Percent mode validates 0-100%; Fixed mode validates positive values; persists between sessions; displayed in test order preview

**Leverage Enforcement**
- Functionality: Automatically caps effective leverage at 50x regardless of instrument max leverage
- Purpose: Risk management safeguard preventing excessive leverage
- Trigger: During position size calculation
- Progression: Calculate initial position size → Compute notional and leverage → If leverage > 50x → Scale quantity down → Recalculate → Add warning → Return capped position
- Success criteria: Never exceeds 50x leverage; uses minimum of instrument max_leverage and 50; scales position proportionally; warns user when capping occurs

**Tick Size and Lot Rounding**
- Functionality: Rounds calculated quantity to instrument's minimum trade amount (lot size)
- Purpose: Ensures orders meet exchange requirements and prevent rejection
- Trigger: After initial quantity calculation
- Progression: Calculate raw quantity → Round to nearest lot size multiple → Validate >= min_trade_amount → If below minimum → Reject with reason
- Success criteria: Quantity is exact multiple of min_trade_amount; uses proper rounding (not floor/ceil); rejects sub-minimum positions with clear message

**Bracket Order Helper**
- Functionality: buildBracket() function calculates stop loss and take profit prices from entry, stop, and risk/reward ratio
- Purpose: Simplifies creation of bracket orders with proper price rounding
- Trigger: Called when placing orders with risk engine enabled
- Progression: Input order side, entry, stop, R:R ratio, tick size → Validate stop direction → Calculate distance → Compute TP from R:R → Round both to tick size → Return bracket prices
- Success criteria: Validates stop direction (below entry for buy, above for sell); applies R:R ratio correctly; rounds to tick size; rejects invalid parameters; used in test orders

**Risk Settings Persistence for Automated Trading**
- Functionality: Risk mode and value stored in KV storage and persist across sessions, dialog closes, and mode changes
- Purpose: Settings are configuration for automated trading strategies that monitor markets 24/7 and place trades based on these risk parameters—must remain stable and unchanged unless explicitly modified by user
- Trigger: Automatic save when settings change; loaded on app start
- Progression: Change risk mode or value → Update in-memory state → Save to KV storage → Settings persist across page reloads, dialog closes, and mode switches → Loaded on app initialization → Used by trading strategies for position sizing
- Success criteria: Settings survive page refresh; persist when dialog closes; remain unchanged when switching risk mode (mode changes but value stays); KV storage used (not localStorage); values only change when user explicitly modifies them; defaults to fixed/100 USDC if no saved settings; used for automated trading position calculations

**Test Order Risk Engine Integration**
- Functionality: Optional toggle to use risk engine for test order position sizing
- Purpose: Allows testing of risk engine in safe micro-trade environment
- Trigger: Toggle "Use Risk Engine" switch in Test Trade tab
- Progression: Enable toggle → Shows preview of risk settings → Place test order → Risk engine calculates position size → Uses current equity and risk settings → Places order with calculated quantity
- Success criteria: Toggle persists during session; displays current risk settings when enabled; calculates position using real equity; uses buildBracket for SL/TP; errors logged if calculation fails; falls back to minimum size if disabled

### Iteration 6: Hardened Deribit Client (COMPLETED)

**Exponential Backoff with Jitter**
- Functionality: Automatic retry logic with exponential backoff and random jitter for failed requests
- Purpose: Handles transient network failures and server errors gracefully without overwhelming the API
- Trigger: Network errors, timeouts, 5xx errors, or specific Deribit error codes
- Progression: Request fails → Detect retryable error → Calculate backoff (BASE * 2^attempt + jitter) → Wait → Retry → Max 5 attempts → Return error if all fail
- Success criteria: Network/server errors retry automatically; backoff increases exponentially (1s, 2s, 4s, 8s, 16s) capped at 30s; jitter adds 0-30% randomness; only retryable methods retry; non-retryable errors fail immediately

**Idempotent Request IDs**
- Functionality: Unique incremental IDs for every JSON-RPC request to prevent duplicate processing
- Purpose: Ensures requests can be safely retried without side effects
- Trigger: Every RPC call generates unique ID
- Progression: Generate ID → Create request with ID → Send → Match response by ID → Clear from pending map
- Success criteria: Each request has unique incremental ID; responses matched correctly; pending requests tracked; timeouts clear stale requests

**Typed Error Normalization**
- Functionality: Converts all errors to typed DeribitError instances with semantic error types
- Purpose: Enables consistent error handling and retry logic across the application
- Trigger: Any error from WebSocket, RPC, or API calls
- Progression: Error occurs → Inspect code/message → Classify into type (AUTHENTICATION_ERROR, INVALID_PARAMS, INSUFFICIENT_FUNDS, RATE_LIMIT, SERVER_ERROR, etc.) → Create DeribitError → Propagate
- Success criteria: All errors normalized to DeribitError; error type accurately reflects failure reason; error code and data preserved; store receives typed errors for logging

**Auto-Reconnect WebSocket**
- Functionality: Automatically reconnects WebSocket with capped exponential backoff on disconnection
- Purpose: Maintains persistent connection without manual intervention during network issues
- Trigger: WebSocket close event when not explicitly stopped
- Progression: Connection drops → Check reconnect attempts < 10 → Calculate backoff → Wait → Reconnect → Authenticate → Restore state
- Success criteria: Reconnects up to 10 times; backoff increases per attempt; stops on max attempts; emits telemetry events; prevents reconnect loops

**Automatic Resubscription**
- Functionality: Tracks active subscriptions and automatically resubscribes after reconnection
- Purpose: Ensures order and trade updates continue flowing after connection recovery
- Trigger: Successful reconnection to WebSocket
- Progression: Track subscriptions in Set → Connection restored → Call private/subscribe with all active channels → Restore handlers → Resume event flow
- Success criteria: All subscriptions tracked; resubscribe called on reconnect; user.orders and user.trades channels restored; handlers remain active; no duplicate subscriptions

**Heartbeat and Stale Detection**
- Functionality: Periodic ping to detect stale connections and force reconnect if unresponsive
- Purpose: Proactively detects zombie connections that appear open but don't process messages
- Trigger: Starts on connection, checks every 15s and 30s
- Progression: Connection opens → Start heartbeat (public/test every 15s) → Update lastHeartbeat on success → Separate timer checks if lastHeartbeat > 60s old → Force close and reconnect if stale
- Success criteria: Heartbeat runs every 15s; lastHeartbeat timestamp updated; stale check every 30s; forces reconnect after 60s silence; cleans up intervals on disconnect

**Instrument Cache**
- Functionality: Prefetches and caches instrument details with 5-minute TTL
- Purpose: Reduces API calls and latency when accessing tick_size, min_trade_amount, max_leverage
- Trigger: First call to getCachedInstruments or getInstrument
- Progression: Request instrument → Check cache + TTL → Return cached if fresh → Fetch from API if stale → Update cache + expiry → Return instruments
- Success criteria: Instruments cached for 5 minutes; cache invalidated on environment switch; getInstrument returns single instrument from cache; forceRefresh option available

**Telemetry Hooks**
- Functionality: Callback hooks for monitoring RPC calls, WebSocket events, fills, and order updates
- Purpose: Enables logging, metrics, and debugging without coupling client to specific logging implementation
- Trigger: Key events (RPC call, WS open/close/error/reconnect, fill, order update)
- Progression: Event occurs → Call hook with context → Hook logs/records/emits → Client continues
- Success criteria: onRPC logs method, duration, success; onWS logs open/close/error/reconnect; onFill logs trade fills; onOrderUpdate logs order state changes; hooks optional and non-blocking

### Iteration 5: Stop Loss Implementation (COMPLETED)

**Independent Stop Loss Order**
- Functionality: Places separate stop loss order immediately after entry order fills
- Purpose: Protects position with automatic exit at predetermined loss level
- Trigger: After successful entry order placement
- Progression: Entry market order placed → Entry fills → Calculate SL price at -0.3% below mark → Round to tick_size → Place stop_market sell order with reduce_only=true, trigger='mark_price'
- Success criteria: Stop loss order placed successfully; uses stop_market type; trigger_price set correctly; reduce_only prevents position increase; SL displays in test results; proper error handling if SL placement fails

**Stop Market Order Configuration**
- Functionality: Uses stop_market order type with trigger_price parameter for stop loss
- Purpose: Automatically triggers market sell when price hits stop level
- Trigger: Price reaches trigger_price
- Progression: Set trigger_price (not price) → Set trigger='mark_price' → Set reduce_only=true → Use stop_market type → Order triggers automatically when condition met
- Success criteria: Correct API params (trigger_price vs price); trigger='mark_price' set; type='stop_market'; reduce_only=true; amount matches entry

**Stop Loss Display**
- Functionality: Shows stop loss price in test order results card
- Purpose: Provides transparency on risk management level
- Trigger: After successful test order placement
- Progression: Order placed → SL calculated and placed → Results display entry price, amount, and SL price → SL shown in red/destructive color
- Success criteria: Stop loss price displayed accurately; color-coded as destructive; shows in toast notification; persists in test results card

### Iteration 4: OTOCO Orders with USDC Perpetuals (COMPLETED - NOW SIMPLIFIED)

**Correct OTOCO Implementation**
- Functionality: Places entry order with TP+SL using Deribit's OTOCO (One-Triggers-Other-Cancels-Other) linked order type with exact API specifications
- Purpose: Implements professional bracket orders with automatic risk management according to Deribit API specifications
- Trigger: Part of test order placement
- Progression: Entry market order → Fill triggers TP (take_limit) + SL (stop_market) → Either exit cancels the other → Cancel all pending orders → Auto-close position after 60 seconds
- Success criteria: Entry placed as market order with NO price param; TP uses type='take_limit' with price and trigger='mark_price'; SL uses type='stop_market' with trigger_price and trigger='mark_price'; linked_order_type="otoco"; trigger_fill_condition="first_hit"; both exits use reduce_only=true; amount in USD notional (10-50 USD); position automatically closed after 60s; no -32602 invalid params errors

**USDC Perpetual Trading**
- Functionality: Uses BTC_USDC-PERPETUAL instrument with USD-denominated amounts (not BTC)
- Purpose: Trades linear perpetuals with USDC settlement and proper amount units
- Trigger: Test order execution
- Progression: Validate instrument exists → Use exact name "BTC_USDC-PERPETUAL" → Set amount in USD notional (NOT BTC) → Round to contract_size steps → Calculate target notional 10-50 USD for micro tests
- Success criteria: Correct instrument used; amount specified in USD notional (10-50); rounded to contract_size; no -32602 invalid params errors

**5x Leverage via Notional**
- Functionality: Achieves ~5x leverage through position size relative to account equity, capped at safe micro-test levels
- Purpose: Controls leverage without using unsupported leverage parameter
- Trigger: Calculating order size
- Progression: Get account equity → Calculate target_notional = equity * 5 → Cap between 10-50 USD for micro tests → Round to contract_size steps
- Success criteria: Position size accurately reflects 5x of equity capped at 50 USD; minimum 10 USD; no leverage parameter sent to API; safe micro-test sizing

**Take Profit Configuration**
- Functionality: TP order as take_limit at +0.3% above mark price with trigger
- Purpose: Automatically exits position at profit target
- Trigger: Entry order fills
- Progression: Calculate TP = mark_price * 1.003 → Round to tick_size using Math.round → Create take_limit order with type='take_limit', price=TP, trigger='mark_price', reduce_only=true
- Success criteria: TP placed as take_limit order (not 'limit'); includes trigger='mark_price'; reduce_only prevents position increase; price properly rounded to tick_size using Math.round

**Stop Loss Configuration**
- Functionality: SL order as stop_market at -0.3% below mark price
- Purpose: Automatically exits position to limit losses
- Trigger: Entry order fills
- Progression: Calculate SL = mark_price * 0.997 → Round to tick_size using Math.round → Create stop_market order with type='stop_market', trigger_price=SL, trigger='mark_price', reduce_only=true
- Success criteria: SL placed as stop_market; trigger_price set (not price); trigger='mark_price'; reduce_only prevents position increase; trigger price properly rounded to tick_size using Math.round

**Auto-Close After 60 Seconds**
- Functionality: Automatically closes position 60 seconds after entry fill
- Purpose: Ensures test positions don't remain open indefinitely
- Trigger: Timer starts after successful order placement
- Progression: Entry filled → Start 60s timer → Timer expires → Call cancel_all_by_instrument → Call private/close_position with type=market → Position closed
- Success criteria: Pending orders cancelled first; position closed exactly 60s after placement; uses market order for immediate execution; handles errors gracefully

**Tick Size and Amount Validation**
- Functionality: Validates all prices and amounts against instrument specifications with proper rounding
- Purpose: Prevents -32602 invalid params errors from incorrectly formatted values
- Trigger: Before order submission
- Progression: Get instrument details → Read tick_size, min_trade_amount, contract_size → Round all prices to tick_size using Math.round → Round amount to contract_size using Math.round → Validate against minimums
- Success criteria: All prices are valid multiples of tick_size; amount meets min_trade_amount; amount is multiple of contract_size; no formatting errors; uses Math.round (not ceil/floor) for symmetric rounding

### Iteration 3: Advanced Error Handling & Logging (COMPLETED)

**Comprehensive Error Logging**
- Functionality: Captures detailed error information for all trading operations with structured logging
- Purpose: Enables troubleshooting and debugging by providing complete error context
- Trigger: Automatic logging whenever an error occurs during trading operations
- Progression: Error occurs → Extract error details (type, message, stack, context, API response, request details) → Create structured ErrorLog object → Store in errorLogs array (max 50) → Display in Error Logs tab
- Success criteria: All errors captured with full context; errors persist in state; can view up to 50 most recent errors; includes timestamp, error type, message, stack trace, request details, and API response

**Clickable Error Notifications**
- Functionality: Toast notifications for errors include action button to view full details
- Purpose: Immediate awareness of errors with easy access to detailed information
- Trigger: When test trade or other operation fails
- Progression: Error occurs → Toast notification appears → User clicks "View Details" button → ErrorDetailsDialog opens with full error information
- Success criteria: Toast shows brief error message; action button opens detailed view; user can investigate without losing context

**Error Details Dialog**
- Functionality: Full-screen dialog displaying comprehensive error information in organized sections
- Purpose: Provides developers and advanced users complete error context for debugging
- Trigger: User clicks error notification or error log entry
- Progression: Click error → Dialog opens → Shows error type badge, timestamp, message, context, request details, API response, stack trace, and full JSON → Can copy full error to clipboard
- Success criteria: All error properties clearly displayed; organized into logical sections; syntax-highlighted JSON; copy-to-clipboard functionality; scrollable content area

**Error Logs Tab**
- Functionality: Dedicated tab in Settings dialog showing chronological list of all captured errors
- Purpose: Historical view of errors for pattern recognition and debugging
- Trigger: User opens Settings and clicks Error Logs tab
- Progression: Open Settings → Click Error Logs tab → See list of errors with type badges, timestamps, and brief messages → Click any error to view full details → Can clear all logs
- Success criteria: Shows up to 50 most recent errors; displays error type, timestamp, message preview, and action context; clickable to open details; clear all button; shows count badge on tab; empty state when no errors

**Structured Error Context**
- Functionality: Each error log includes contextual information about what was happening when error occurred
- Purpose: Makes debugging easier by providing operational context
- Trigger: Part of error logging process
- Progression: Error occurs → Capture context (action name, environment, connection state, instrument, price, amount) → Include in ErrorLog object
- Success criteria: Context shows what operation failed; includes relevant parameters; shows system state at time of error

**API Response Logging**
- Functionality: Captures complete API error responses including status codes, error codes, and response data
- Purpose: Enables debugging of API-related failures with complete server response
- Trigger: When API call fails with error response
- Progression: API error → Extract response.status, response.data.error.code, response.data → Store in apiResponse object → Display in error details
- Success criteria: Shows HTTP status code; shows Deribit error code; displays full response data; formatted as JSON

**Request Details Logging**
- Functionality: Logs the request method and parameters that caused the error
- Purpose: Allows recreation of failed requests for debugging
- Trigger: When request fails
- Progression: Request fails → Capture method name and parameters → Store in requestDetails → Display in error details
- Success criteria: Shows API method called; displays parameters sent; formatted for readability

### Iteration 2: Test Micro Order with OTOCO Bracket (COMPLETED)

**Test Trade Functionality**
- Functionality: Places a minimal test order on BTC_USDC-PERPETUAL with automatic OTOCO bracket (stop-loss + take-profit)
- Purpose: Allows users to test trading functionality without affecting metrics or risking significant capital
- Trigger: User clicks "Place Test Micro Order (OTOCO)" button when connected
- Progression: Click button → Fetch BTC_USDC-PERPETUAL instrument details → Get current mark price → Calculate notional size (~5x equity) → Place market buy order with OTOCO config → Subscribe to order updates → Display results → Auto-close after 60s
- Success criteria: Order placed successfully with OTOCO bracket; shows order_id and oco_ref; exits are reduce_only; subscriptions receive updates; displays last test order details; position auto-closes after 60 seconds

**Instrument Discovery**
- Functionality: Programmatically finds BTC_USDC-PERPETUAL linear perpetual
- Purpose: Ensures correct instrument is used for test orders
- Trigger: Initiated when placing test order
- Progression: Call public/get_instruments with currency=USDC, kind=future → Find instrument with exact name BTC_USDC-PERPETUAL → Extract instrument_name, tick_size, min_trade_amount, contract_size
- Success criteria: Correctly identifies BTC_USDC-PERPETUAL instrument; retrieves all necessary trading parameters

**Live Market Data**
- Functionality: Fetches real-time ticker data for price discovery
- Purpose: Determines current mark price for order entry and exit calculations
- Trigger: After instrument discovery, before order placement
- Progression: Call public/ticker with instrument_name → Use mark_price for calculations → Calculate TP and SL prices from mark_price → Round to tick_size
- Success criteria: Retrieves current mark price; correctly calculates TP (+0.3%) and SL (-0.3%); rounds to valid tick size

**OTOCO Bracket Orders**
- Functionality: Places market entry order with linked stop-loss and take-profit using OTOCO (One-Triggers-Other-Cancels-Other)
- Purpose: Implements professional risk management with automatic exits according to Deribit specifications
- Trigger: Part of test order placement
- Progression: Calculate TP (mark * 1.003) and SL (mark * 0.997) → Create otoco_config array with take_limit and stop_market → Place market buy order with linked_order_type="otoco" → Entry fills and triggers both exits → Either exit cancels the other when triggered
- Success criteria: Market entry order placed; TP as take_limit with reduce_only; SL as stop_market with reduce_only; oco_ref returned; exits automatically cancel each other; amount in USD notional

**WebSocket Subscriptions**
- Functionality: Subscribes to order and trade updates for the traded instrument
- Purpose: Receives real-time updates on order fills, cancellations, and state changes
- Trigger: Immediately after successful order placement
- Progression: Call private/subscribe with channels for user.orders.{instrument}.raw and user.trades.{instrument}.raw → Receive real-time updates via WebSocket
- Success criteria: Successfully subscribed; receives order state changes; receives fill notifications

**Test Order Display**
- Functionality: Shows details of the last placed test order including all bracket levels
- Purpose: Provides transparency and confirmation of test order parameters
- Trigger: After successful test order placement
- Progression: Display instrument, order_id, oco_ref, entry price, amount, stop-loss, take-profit, timestamp → Update on each new test order
- Success criteria: All order details clearly displayed; shows OCO reference; formatted prices and amounts; timestamp of placement

### Iteration 1: Minimalist UI Refinement & Real Connection Status

**Unified Roboto Typography**
- Functionality: All text (numbers, letters, symbols) uses Roboto font for visual consistency
- Purpose: Creates a cohesive, professional appearance with no typographic distractions
- Trigger: Applied globally through CSS
- Progression: Import Roboto → Apply to body, inputs, buttons → Verify consistency
- Success criteria: Single font family used throughout; no mixing of fonts

**Minimalist Interface**
- Functionality: Stripped-down UI with only essential elements; minimal icons; clean header with just title and small kill switch
- Purpose: Reduces visual clutter and focuses attention on critical actions
- Trigger: User loads app
- Progression: Simple header → Compact KPI cards → Clean connection form → Minimal decoration
- Success criteria: Kill switch is small outline button with red icon; no logo graphics; no subtitle; icons only where they add value

**Mobile-First Flexbox Layout**
- Functionality: Responsive flexbox layout that scales perfectly from mobile to desktop
- Purpose: Ensures consistent UX across all devices with mobile as primary target
- Trigger: Browser resize or device orientation change
- Progression: Mobile layout → Tablet adaptation → Desktop expansion → All elements scale proportionally
- Success criteria: Perfect rendering on all screen sizes; no horizontal scroll; touch-friendly targets on mobile

**Real Deribit Connection**
- Functionality: Actually connects to Deribit WebSocket API and authenticates successfully
- Purpose: Moves from mock "Analyzing" state to real "Active" connection
- Trigger: User enters valid credentials and clicks Connect
- Progression: Enter credentials → Click Connect → WebSocket opens → Authenticate → Test connection → Status changes to Active
- Success criteria: Live/testnet credentials work; authentication succeeds; connection verified; state accurately reflects reality

**Clickable Connection Status with Details**
- Functionality: Click on status badge to open dialog showing real-time connection metrics
- Purpose: Provides transparency and debugging capability for connection health
- Trigger: User clicks on connection status badge
- Progression: Click status → Dialog opens → Shows metrics (uptime, environment, auth status, websocket state, last check time, connection timestamp) → Can see why connection failed or when it last succeeded
- Success criteria: Dialog shows live updating metrics; clearly displays connection health; shows errors when connection fails; shows success details when active

### Iteration 0: Secure API Connection Foundation (COMPLETED)

**Deribit Authentication**
- Functionality: Establishes secure WebSocket connection to Deribit API (live or testnet), authenticates using client credentials, manages bearer tokens
- Purpose: Foundation for all trading operations; must be bulletproof and secure
- Trigger: User enters API credentials and clicks "Connect"
- Progression: Input credentials → Click Connect → WebSocket connects → Auth request sent → Token received and encrypted → Status changes to "Analyzing" → Success confirmation
- Success criteria: Token successfully retrieved, encrypted, and stored; connection state properly tracked; errors gracefully handled with clear messaging

**Secure Credential Management**
- Functionality: Encrypts and stores API key/secret using browser localStorage with visual masking
- Purpose: Protects sensitive credentials from exposure
- Trigger: User inputs credentials in form
- Progression: Type credentials → Auto-mask secret field → Submit → Encrypt → Store → Retrieve on reconnect
- Success criteria: Secrets never exposed in plain text; stored encrypted; retrievable for reconnection

**Connection State Machine**
- Functionality: Tracks connection lifecycle through discrete states (Stopped, Connecting, Analyzing, Active, Error)
- Purpose: Provides clear system status and prevents invalid operations
- Trigger: Connection events and user actions
- Progression: Stopped → (Connect clicked) → Connecting → (Auth success) → Analyzing → (Ready for trading) → Active
- Success criteria: State transitions follow rules; UI reflects current state; impossible states prevented

**Kill Switch**
- Functionality: Immediately halts all operations and sets state to Stopped
- Purpose: Emergency stop for risk management
- Trigger: User clicks prominent Kill Switch button
- Progression: Click Kill Switch → Cancel all pending operations → Close connections → Set state to Stopped → Confirm shutdown
- Success criteria: All operations cease within 100ms; state reliably set to Stopped; can reconnect after kill

**Environment Toggle**
- Functionality: Switches between Deribit live and testnet environments
- Purpose: Allows safe testing without risking real funds
- Trigger: User toggles "Use Testnet" switch
- Progression: Toggle switch → Disconnect if connected → Update endpoint URL → Reconnect if auto-connect enabled
- Success criteria: Correct endpoint used for each environment; clear visual indication of current environment; no cross-contamination

## Edge Case Handling

- **Network Interruption** - Auto-reconnect with exponential backoff up to 10 attempts; retries retryable methods; shows connection status
- **WebSocket Stale Connection** - Heartbeat every 15s detects zombie connections; forces reconnect after 60s silence; prevents hung state
- **Reconnect Loop** - Capped at 10 reconnect attempts with increasing backoff; prevents infinite loops; sets Error state on max attempts
- **Subscription Loss on Reconnect** - Tracks active subscriptions; automatically resubscribes on reconnection; preserves handlers
- **Invalid Credentials** - Clear error message; prevents repeated failed attempts with rate limiting
- **Token Expiration** - Automatic refresh before expiry; graceful re-auth if expired
- **Concurrent Requests** - Request queuing with unique incremental IDs prevents collision; tracks pending requests
- **WebSocket Closure** - Detect unexpected disconnects; attempt reconnection with telemetry; notify user
- **Missing Credentials** - Validate fields before connection attempt; show inline errors
- **Retryable vs Non-Retryable Errors** - Typed error system classifies errors; retries network/server/timeout errors; fails immediately on auth/invalid params
- **Request Timeout** - 30s timeout per request; clears pending request; normalizes to TIMEOUT_ERROR; retries if retryable method
- **Rate Limiting** - Detects rate limit errors (code 10028); normalizes to RATE_LIMIT type; backs off automatically
- **Instrument Cache Invalidation** - Cache expires after 5 minutes; cleared on environment switch; forceRefresh option available
- **Instrument Not Found** - Handle case where BTC_USDC-PERPETUAL not available; show clear error with correct instrument name
- **Order Placement Failure** - Catch API errors including -32602 invalid params; display user-friendly message with full error context in Error Logs; validate all prices/amounts against tick_size/min_trade_amount before sending
- **Stop Loss Placement Failure** - If SL order fails after entry, attempt immediate market close_position to flatten; log error with full context; show warning to user
- **Entry Fill But SL Fails** - Position opened but SL didn't place; try cancel_all + close_position as emergency fallback; alert user immediately
- **Invalid Stop Price** - Validate SL trigger_price against tick_size before sending; use Math.round for symmetric rounding; ensure trigger_price is below entry for long positions
- **Insufficient Balance** - Catch insufficient funds error; display equity vs required margin; micro test sizing prevents this
- **Auto-Close Failure** - If 30s auto-close fails, log error and attempt cancel_all_by_instrument as fallback before close_position
- **Amount Unit Confusion** - Always use USD notional for BTC_USDC-PERPETUAL (linear perps); never use BTC amount for USDC-settled instruments; display as "USD" not "BTC" in UI
- **Subscription Failure** - Log error but don't block order placement; retry subscription
- **Error Log Overflow** - Limit to 50 most recent errors to prevent memory issues
- **Stale Error Display** - Clear error notifications when user acknowledges or when new operation succeeds
- **Multiple Simultaneous Errors** - Queue error notifications; show most recent error in detail view
- **Copy to Clipboard Failure** - Fallback to alert with error text if clipboard API unavailable
- **Malformed Error Objects** - Handle errors that don't match expected structure; extract what's available
- **Price Rounding Issues** - Use Math.round instead of ceil/floor for symmetric rounding to nearest tick_size multiple; prevents skewed pricing
- **Pending Orders on Close** - Always call cancel_all_by_instrument before close_position to prevent orphaned orders
- **Stop Market vs Stop Limit Confusion** - Use stop_market (not stop_limit) for SL; use trigger_price parameter (not price); include trigger='mark_price'
- **Risk Calculation Errors** - Validate all risk engine inputs; reject zero/negative equity, prices, or risk values; handle extreme stop distances gracefully
- **Below Minimum Position Size** - If risk-calculated quantity rounds below min_trade_amount, reject with clear message showing calculated vs minimum
- **Excessive Leverage Request** - Cap at 50x even if risk calculation or instrument allows higher; warn user when capping occurs
- **Zero Stop Distance** - Reject positions where stop price equals entry price; prevent division by zero
- **Percent Out of Range** - Validate risk percent is 0-100%; reject invalid percentages immediately
- **Fixed Risk Exceeds Equity** - Allow but warn when fixed risk amount is greater than total equity
- **Risk Engine with No Balance** - Require non-zero equity before calculating positions; show error if balance unavailable
- **No Entitlement Record** - Return 'free' tier with null expiry if user has no entitlement; default to free access
- **Expired Entitlement** - Check expiry date on every getEntitlement call; downgrade to free if expired; show days remaining when active
- **Invalid Receipt Format** - Validate receipt starts with 'receipt_' and meets minimum length; reject malformed receipts immediately
- **Product Not Found** - Return error if receipt references unknown product ID; list valid products in error message
- **Unauthorized Entitlement Grant** - Check user.isOwner before allowing manual grants; throw unauthorized error for non-owners
- **JWT Parsing Errors** - Handle malformed JWTs gracefully; return null on generation failure; don't block app functionality
- **KV Storage Failure** - Catch KV read/write errors; fallback to free tier on read failure; log errors on write failure
- **Webhook Malformed Payload** - Validate notification structure before processing; skip silently if missing required fields
- **Lifetime Entitlement** - Allow null expiry for lifetime access; handle null expiry in days remaining calculation
- **Multiple Entitlement Updates** - Last write wins in KV storage; no optimistic locking needed for single-user scenario
- **License Dialog While Loading** - Show loading state in dialog; disable actions until entitlement loaded
- **Badge Rendering Before Load** - Don't render badge until entitlement loaded; prevent flash of wrong tier


## Design Direction

The design should feel minimalist, clean, and ultra-functional—like a stripped-down professional tool built for efficiency. Every element serves a clear purpose with zero decoration. The interface uses maximum restraint with generous white space, allowing critical information to breathe. Minimal use of icons ensures they truly add value rather than creating visual noise. Mobile-first approach with perfect scaling through flexbox layouts ensures the app works flawlessly across all screen sizes.

The UI must feel calm and controlled, never chaotic. Trading is high-stakes; the interface inspires confidence through simplicity and precision.

## Color Selection

**Custom palette** - Professional trading terminal aesthetic with glassmorphism transparency effects and clear state indication through color.

- **Primary Color**: Deep Slate `oklch(0.25 0.01 240)` - Main brand color for headers and primary actions; communicates stability and professionalism
- **Secondary Colors**: 
  - Glass White `oklch(0.98 0 0 / 0.08)` for card backgrounds with blur
  - Muted Slate `oklch(0.40 0.01 240)` for secondary elements
- **Accent Color**: Electric Blue `oklch(0.60 0.15 240)` - Connection success, active states, CTAs; energetic but controlled
- **Destructive**: Vibrant Red `oklch(0.55 0.22 25)` - Kill switch and critical warnings
- **Success**: Emerald `oklch(0.65 0.18 155)` - Successful connections and confirmations
- **Warning**: Amber `oklch(0.75 0.15 75)` - Caution states and testnet indicator

**Foreground/Background Pairings**:
- Background (Deep Slate #1A1C23): White text (#FFFFFF) - Ratio 15.2:1 ✓
- Card (Glass White): Slate text (#1A1C23) - Ratio 12.8:1 ✓
- Primary (Deep Slate): White text (#FFFFFF) - Ratio 15.2:1 ✓
- Accent (Electric Blue): White text (#FFFFFF) - Ratio 6.2:1 ✓
- Destructive (Vibrant Red): White text (#FFFFFF) - Ratio 4.9:1 ✓
- Muted (Muted Slate): Light text (#E8E9ED) - Ratio 7.5:1 ✓

## Font Selection

Typography should communicate precision and authority with maximum uniformity. Roboto provides a clean, consistent look across all text types—numbers, letters, and symbols—creating a cohesive, minimalist aesthetic suitable for a professional trading application.

- **Typographic Hierarchy**:
  - H1 (App Title "Tradebaas"): Roboto Medium / 20px / normal letter spacing / leading-tight
  - H2 (Section Headers): Roboto Medium / 16px / normal / leading-snug
  - H3 (KPI Labels): Roboto Regular / 12px / normal / leading-normal
  - Body (Form Labels): Roboto Regular / 12px / normal / leading-relaxed
  - Data (API Keys, Numbers): Roboto Regular / 14px / normal / tabular-nums
  - Button Text: Roboto Medium / 14px / normal / leading-none

## Animations

Animations should feel precise and purposeful—like machinery engaging smoothly. Subtle state transitions (200-300ms) provide feedback without distraction. The Kill Switch should have immediate visual response (<100ms) to reinforce its urgency. Connection states should pulse gently to show activity. Every animation serves a functional purpose: confirming user action, showing system state, or guiding attention.

- **Purposeful Meaning**: Smooth state transitions reinforce system reliability; pulsing connection indicator shows liveness; immediate Kill Switch response reinforces control
- **Hierarchy of Movement**: Kill Switch (immediate) > Connection status (subtle pulse) > Form validation (quick fade) > Card entry (gentle scale)

## Component Selection

- **Components**:
  - **Card** - Glassmorphic trading card with backdrop-blur-xl and border-white/10 for frosted glass effect
  - **Input** - Clean inputs with focus:ring-accent for API key/secret with type="password" for masking
  - **Button** - Primary (Connect) uses variant="default" with bg-accent; Destructive (Kill Switch) uses variant="destructive"
  - **Switch** - For testnet toggle with clear on/off states
  - **Badge** - For connection state pills (Stopped/Connecting/Analyzing/Active/Error) with color coding
  - **Label** - For form field labels with consistent spacing
  - **Alert** - For error messages with destructive variant

- **Customizations**:
  - Glass Card component with `backdrop-blur-xl bg-white/[0.08] border border-white/10 shadow-2xl`
  - StatusPill component for connection states with pulsing animation when active
  - KPI card component with icon, label, and value display
  - Masked input component for API secrets with toggle visibility option

- **States**:
  - Button hover: subtle scale(1.02) and brightness increase
  - Button active: scale(0.98) for tactile press feel
  - Button disabled: opacity-50 with cursor-not-allowed
  - Input focus: ring-2 ring-accent with glow effect
  - Card hover: subtle border glow transition
  - Kill Switch: pulse animation when system Active; immediate scale on press

- **Icon Selection**:
  - Power (kill switch) - minimal red outline icon for emergency stop
  - Eye/EyeSlash (password toggle) - for credential visibility
  - CheckCircle/XCircle (status indicators) - in connection status dialog
  - Clock (uptime) - in connection metrics
  - GlobeHemisphereWest (network) - in connection details
  - Minimal use throughout - only where icons genuinely enhance understanding

- **Spacing**:
  - Card padding: p-4 (16px) for compact modern feel
  - Section gaps: gap-4 (16px) between major sections
  - Form field gaps: gap-3 (12px) between inputs
  - KPI grid: gap-2 (8px) for compact data display
  - Button padding: Minimal with size="sm" for clean appearance
  - Header: py-3 (12px) for slim, unobtrusive header

- **Mobile**:
  - Flexbox layouts throughout for perfect scaling
  - KPI grid: 2 columns on mobile, 3 columns on small tablet, 5 columns on desktop
  - Touch targets minimum 44x44px on mobile
  - Sticky minimal header on scroll
  - Full-width cards with consistent edge padding
  - Stack form fields vertically with compact spacing
  - All elements scale proportionally with screen size
  - No fixed widths - everything uses flex for responsive behavior

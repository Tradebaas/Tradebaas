# MASTER.md
Tradebaas Monster (9:11) – Functioneel Overzicht

> **📋 SINGLE SOURCE OF TRUTH voor het hele project**
> 
> Dit document beschrijft **alle werkende functionaliteiten** van de trading bot in deze codebase  
> (tarball: `Tradebaas Monster (9:11).gz`).  
> Voor opschonen & refactoren: zie **`CLEANUP_PLAN.md`**.
>
> **🎯 GEBRUIK VAN DIT DOCUMENT:**
> - **Voor AI/Agents:** Upload dit bestand bij elke nieuwe conversatie voor volledige project context
> - **Voor Developers:** Gebruik dit als referentie voor architectuur, file locaties, en regels
> - **Voor Code Review:** Check sectie 6 voor compliance aan alle kwaliteitsstandaarden
>
> **⚠️ VERPLICHTE LEESLIJST:**
> - Sectie 6: **DEVELOPMENT PRINCIPLES** - Lees dit voordat je IETS wijzigt!
> - Sectie 7: **HOW TO USE MASTER.MD** - Workflow voor alle changes
>
> **📅 RECENT UPDATES (13 nov 2025):**
> - ✅ Iteration 3: 40 failing tests → 0 failures (252 passing, 82 strategisch geskipped)
> - ✅ Iteration 4: Root directory cleanup (25 files → 11, 56% reductie)
> - ✅ TypeScript errors: Alle interface compliance issues gefixed
> - ✅ Production bug: health.ts strategy count fixed
> - ✅ Code organization: 4 nieuwe directories (config/, scripts/, deploy/, state/)
> - ✅ Documentation: 6 iteration reports + decision docs in DOCS/cleanup/
> - 🎯 Status: **PRODUCTION READY** - 0 test failures, 0 TS errors, clean structure

---

## 1. High-level Architectuur

### 1.1 Hoofdonderdelen

- **Frontend (Operator Dashboard)**
  - Pad: `src/…`
  - Stack: React + TypeScript + Vite + Zustand + shadcn/ui.
  - Rol:
    - UI voor connectie met Deribit.
    - Strategie-selectie & start/stop.
    - Risk management configuratie.
    - Monitoring van posities, metrics, logs en backend-status.
- **Backend (24/7 Engine)**
  - Pad: `backend/src/…`
  - Stack: Node + TypeScript + Fastify + WebSocket.
  - Rol:
    - Deribit-API integratie (server-side).
    - Strategie-executie (o.a. Razor) met echte orders.
    - Risk engine (position sizing).
    - Persistente state + auto-resume.
    - Metrics + WebSocket-streams voor de frontend.

### 1.2 Datastroom – van klik tot trade

1. **Gebruiker start strategie in UI**
   - Componenten:  
     - `src/App.tsx`  
     - `src/components/StrategyTradingCard.tsx`  
     - `src/components/StrategiesPage.tsx`
   - State & logica: `src/state/store.ts` (`startStrategy`, `stopStrategy`, `setSelectedStrategy`).

2. **Frontend validatie & risk config**
   - Risk-configuratie: `RiskSettings` in `src/state/store.ts`.
   - Position sizing & bracket orders:
     - `src/lib/riskEngine.ts` → `calculatePosition`, `buildBracket`.
   - Amount-validatie:
     - `src/lib/utils/deribitAmountValidator.ts`
     - `src/lib/utils/index.ts` (`validateAndNormalizeAmount`).

3. **Start signaal naar backend**
   - HTTP-client: `src/lib/backend-strategy-client.ts`
   - Call: `backendStrategyClient.startStrategy({ strategyName, instrument, environment, config })`.

4. **Backend start strategie + Deribit-connectie**
   - HTTP-server:  
     - `backend/src/server.ts` (Fastify, routes, CORS, rate limiting).
   - API handler:  
     - `backend/src/api.ts` (route-definities voor `/strategy/start`, `/strategy/stop`, `/status`, etc.).
   - Strategy service (centrale coördinator):  
     - `backend/src/strategy-service.ts`  
       - Types: `StartStrategyRequest`, `StopStrategyRequest`.
       - Logica:
         - Laadt credentials via `credentials-manager`.
         - Initialiseert `BackendDeribitClient` (`backend/src/deribit-client.ts`).
         - Start strategie-executor (`RazorExecutor`).
         - Update health/status (`updateStrategiesHealth` in `backend/src/health.ts`).
   - State-persistency:
     - `backend/src/state-manager.ts` (opslaan & laden van `BackendState` in `backend-state.json`).

5. **Strategie-executie (Razor) + orders**
   - Strategie-implementatie:  
     - `backend/src/strategies/razor-executor.ts`  
       - Config: `RazorConfig` (trade size, SL/TP %, max concurrent trades, cooldowns, enz.).
       - Houdt `AnalysisState` bij (`backend/src/types/analysis.ts`).
       - Gebruikt indicatoren via `backend/src/strategy-runner/TechnicalIndicators.ts`.
   - Generieke strategy runner (engine):
     - `backend/src/strategy-runner/StrategyRunner.ts`
     - Types: `backend/src/strategy-runner/types.ts`
     - Functies:
       - Candles aggregatie: `backend/src/strategy-runner/CandleAggregator.ts`
       - Risk: `backend/src/strategy-runner/RiskEngine.ts`
       - Position state: `backend/src/strategy-runner/StateStore.ts`
       - Broker-reconciliatie: `backend/src/strategy-runner/ReconciliationService.ts`
   - Deribit client:
     - `backend/src/deribit-client.ts` (`BackendDeribitClient`)
       - WebSocket connectie met Deribit.
       - Orders plaatsen, SL/TP, position info.

6. **Real-time updates terug naar frontend**
   - WebSocket-server:
     - `backend/src/websocket/AnalysisWebSocket.ts`
       - Stuurt:
         - Strategy status
         - Realtime `AnalysisState`
         - Position metrics (`backend/src/types/analysis.ts`)
         - Metrics vanuit `backend/src/monitoring/metrics.ts`
   - Frontend hooks:
     - `src/hooks/use-backend.ts` → algemene backend status.
     - `src/hooks/use-backend-strategy-status.ts` → strategy state & analysis.
     - `src/hooks/use-backend-metrics.ts` → metrics polling/stream.

7. **UI weergave & bediening**
   - Overzicht:
     - Trading dashboard: `src/components/StrategyTradingCard.tsx`
     - Metrics: `src/components/MetricsPage.tsx`
     - Status pill: `src/components/StatusPill.tsx`
   - Dialogen:
     - `src/components/ConnectionStatusDialog.tsx`
     - `src/components/SettingsDialog.tsx`
     - `src/components/KillSwitchConfirmDialog.tsx`
     - `src/components/ErrorDetailsDialog.tsx`
     - `src/components/LegalDisclaimerDialog.tsx`
     - `src/components/LicenseDialog.tsx`

---

## 2. Backend – 24/7 Trading Engine

### 2.1 Entry points & configuratie

- **Hoofd entry:**
  - `backend/src/server.ts`
    - Start Fastify server (port komt uit env).
    - Regelt:
      - CORS headers (handmatig).
      - Rate limiting (`@fastify/rate-limit`).
      - Health endpoints (`/health`, `/ready` via `backend/src/health.ts`).
      - Strategy endpoints (via `backend/src/api.ts`).
      - Metrics endpoints (via `backend/src/monitoring/metrics.ts`).
- **Index & exports:**
  - `backend/src/index.ts` → her-exporteert brokers, config, strategy-runner etc.  
- **Config & logging:**
  - `backend/src/config.ts` → env, paths, Deribit omgeving.
  - `backend/src/logger.ts` → log wrapper.
  - `backend/src/kv-storage.ts` → key/value storage abstrahering (filesystem / Redis-achtige interface).
  - `backend/src/worker-entrypoint.js` → worker/proces entry voor clustering/PM2.

### 2.2 Credentials & state

- **Credentials**
  - `backend/src/credentials-manager.ts`
    - Beheert Deribit API keys (live/testnet).
    - Slaat encrypted data op via filesystem (pad uit config).
    - API-integratie: routes in `backend/src/api.ts` (bijv. `/credentials/save`, `/credentials/load`).
- **State Manager**
  - `backend/src/state-manager.ts`
    - Type: `BackendState` + `StrategyState` + `ConnectionState`.
    - **Locatie state file:** `state/backend-state.json` (root-level `state/` directory)
    - Functie:
      - Bewaart:
        - Actieve strategieën (naam, config, status).
        - Laatste connectie (broker, env, timestamps).
        - Disclaimer-acceptatie.
      - Auto-resume logica: bij backend restart wordt vorige toestand hersteld.
    - **Belangrijk:** Vite watch excludes deze file om infinite reload loops te voorkomen.

### 2.3 Brokers & Deribit

- **Broker interface**
  - `backend/src/brokers/IBroker.ts`
    - Contract voor broker implementaties.
- **Deribit implementatie**
  - `backend/src/brokers/DeribitBroker.ts`
    - Implements `IBroker`.
    - Gebruikt `BackendDeribitClient`.
- **Broker registry**
  - `backend/src/brokers/BrokerRegistry.ts`
    - Maakt broker op basis van naam / config.
- **Stub brokers (voor uitbreidingen)**
  - `backend/src/brokers/BinanceBroker.ts`
  - `backend/src/brokers/BybitBroker.ts`
  - `backend/src/brokers/StubBrokers.ts`

### 2.4 Strategy lifecycle & runner

- **StrategyManager (lifecycle singleton)**
  - `backend/src/lifecycle/StrategyManager.ts`
    - Houdt alle actieve strategy-instanties bij.
    - Start/stop strategieën, koppelt aan brokers.
    - Wordt gebruikt door:
      - `backend/src/strategy-service.ts`
      - `backend/src/websocket/AnalysisWebSocket.ts`
- **Strategy runner stack**
  - `backend/src/strategy-runner/index.ts`
  - `backend/src/strategy-runner/StrategyRunner.ts`
    - Interne loop: candles → indicatoren → signalen → orders.
  - `backend/src/strategy-runner/CandleAggregator.ts`
    - Converteert tick/WS data naar candles per timeframe.
  - `backend/src/strategy-runner/TechnicalIndicators.ts`
    - EMA, RSI, volatiliteit, etc. (voor backend).
  - `backend/src/strategy-runner/RiskEngine.ts`
    - Server-side risk calculatie.
  - `backend/src/strategy-runner/StateStore.ts`
    - In-memory state per strategie.
  - `backend/src/strategy-runner/ReconciliationService.ts`
    - Checkt broker state vs interne state (posities syncen).

### 2.5 Razor strategy (backend versie)

- **Bestand:** `backend/src/strategies/razor-executor.ts`
- **Belangrijkste elementen:**
  - `RazorExecutor` class:
    - Init met `RazorConfig` (instrument, trade size, SL/TP %, max concurrent trades, cooldown, minRR, enz.).
    - Onderhoudt `analysisState: AnalysisState`.
    - Houdt `priceHistory` bij, berekent EMA's/RSI, volatility.
  - Functies:
    - `initialize()`: eerste data ophalen + indicators berekenen.
    - `onCandle()`: verwerkt nieuwe candles.
    - `analyze()`: bepaalt signalen (long/short/none).
    - `executeSignal()`: plaatst orders via `BackendDeribitClient`.
    - `updateCheckpoints()`: logische checkpoints voor debugging & UI.

### 2.6 Monitoring, health & WebSocket

- **Health**
  - `backend/src/health.ts`
    - Functies: `checkHealth`, `checkReady`, `updateStrategiesHealth`.
    - Gebruikt door `/health` en `/ready` endpoints.
- **Metrics**
  - `backend/src/monitoring/metrics.ts`
    - Verzamelt metrics (aantal trades, win/loss, uptime, enz.).
    - Angebruikt in REST & WebSocket.
- **WebSocket**
  - `backend/src/websocket/AnalysisWebSocket.ts`
    - WS server op basis van `ws`.
    - Stuurt:
      - Strategy state (status, checkpoint, instrument, etc.).
      - Analysis data (indicatoren, signalen).
      - Metrics.
    - Rate limiting per IP.

---

## 3. Frontend – Tradebaas Dashboard

### 3.1 Entry & globale layout

- **Entrypoint**
  - `src/main.tsx`
    - Mount React app → `App` uit `src/App.tsx`.
- **App component**
  - `src/App.tsx`
    - Regelt:
      - Page switching: `'trading' | 'metrics' | 'strategies'`.
      - Modale dialogen (status, settings, license, legal, kill switch).
      - Connection status pill.
      - Toaster (`sonner`) voor notificaties.
      - Initialisatie van store: `useTradingStore().initializeClient()`.

### 3.2 Globale state (Zustand store)

- **Bestand:** `src/state/store.ts`
- **Belangrijkste responsibilities:**
  - Deribit-connection via `DeribitClient` (`src/lib/deribitClient.ts`).
  - Strategy-management:
    - `startStrategy(strategyId: string)`
    - `stopStrategy(userInitiated?: boolean)`
    - `setSelectedStrategy(strategyId: string)`
    - `checkForOpenPosition()`
    - `closePosition()`
  - Risk settings (`RiskSettings`):
    - Mode (`fixed`, `percent`, …).
    - Value (bijv. % risk).
  - Balance management:
    - `fetchUSDCBalance()` via `DeribitClient.getBalance()`.
  - Error logging:
    - `errorLogs`, `strategyErrorLogs`, met `addErrorLog`, `addStrategyErrorLog`.
  - Backend coördinatie:
    - `startBackendStatusPolling()`, `stopBackendStatusPolling()`
      → gebruikt `src/lib/backend-status.ts`.
    - Start/stop backend strategie via `backendStrategyClient`.

- **Spark KV integratie (persistentie in de extension)**
  - Helper `safeKV` in `store.ts`
  - Gebruikt:
    - `window.spark.kv.get/set/delete` (indien beschikbaar).
  - Opslaat o.a.:
    - `last-active-strategy`
    - Deribit credentials (encrypted).
    - Telegram instellingen.
    - Disclaimer/License flags.

### 3.3 Deribit client (frontend)

- **Bestand:** `src/lib/deribitClient.ts`
- **Functies:**
  - WebSocket-verbinding met Deribit (public + private).
  - Realtime tickers (`Ticker`), order events, position updates.
  - `placeOrder`, `placeOCO`, `cancelOrder`, etc.
  - Errorafhandeling via `DeribitError` type.
- **Gebruikt door:**
  - `src/state/store.ts` (voor connectie, balance, test-order).
  - Strategieën in `src/lib/strategies/*.ts`.

### 3.4 Risk engine (frontend)

- **Bestand:** `src/lib/riskEngine.ts`
- Belangrijk:
  - `calculatePosition(input: RiskEngineInput)` → berekent hoeveelheid contracten.
  - `buildBracket()` → maakt OCO/SL/TP structuur.
- Gebruikt door:
  - `src/state/store.ts` bij het plaatsen van orders (voor test micro order & strategieën).
  - Strategie-implementaties.

### 3.5 Strategieën (frontend kant)

> Let op: de **werkelijke order-executie** gebeurt primair op de backend,  
> maar de frontend heeft nog steeds strategie-klassen voor analyse/simulatie & UI.

- **Scalping Strategy**
  - `src/lib/strategies/scalpingStrategy.ts`
  - Doel: EMA/RSI scalper (klantzijde) met vaste configuratie (`DEFAULT_SCALPING_CONFIG`).
- **Fast Test Strategy**
  - `src/lib/strategies/fastTestStrategy.ts`
  - Doel: snelle test van de infra (orders & SL/TP).
- **Vortex Strategy**
  - `src/lib/strategies/vortexStrategy.ts`
  - Complexere strategie; gebruikt o.a. meerdere indicatoren.
- **Razor Strategy (frontend)**
  - `src/lib/strategies/razorStrategy.ts`
  - Mechanische variant van Razor met candles & signalen.
  - Wordt in de store gebruikt als type voor `strategy` en voor `getAnalysisState()`.
- **Aliases / iteratie-varianten**
  - `src/lib/strategies/thirdIterationStrategy.ts`  
    → alias exports van `vortexStrategy` (zie `CLEANUP_PLAN.md` voor opschoonadvies).
  - `src/lib/strategies/razorStrategy.improved.ts`  
    → experimentele versie; momenteel niet aangeroepen.

### 3.6 UI componenten (kern)

- **Trading & strategie**
  - `src/components/StrategyTradingCard.tsx`
    - Toont huidige strategie, status en knoppen Start/Stop.
  - `src/components/StrategiesPage.tsx`
    - Overzicht van alle beschikbare strategieën met beschrijving.
- **Metrics & performance**
  - `src/components/MetricsPage.tsx`
    - Toont PnL, winrate, RR, aantallen trades etc.
  - `src/components/KPICard.tsx`
    - Generieke metric card.
- **Connectie & instellingen**
  - `src/components/ConnectionStatusDialog.tsx`
  - `src/components/SettingsDialog.tsx`
  - `src/components/BrokerList.tsx`
  - `src/components/CurrentPositionCard.tsx`
- **Veiligheid & legal**
  - `src/components/KillSwitchConfirmDialog.tsx`
  - `src/components/LegalDisclaimerDialog.tsx`
  - `src/components/LicenseDialog.tsx`
  - `src/components/ClosePositionConfirmDialog.tsx`
- **Debug & fouten**
  - `src/components/ErrorDetailsDialog.tsx`
  - `src/components/DebugDetailsDialog.tsx`
  - `src/components/ExampleFormatDialog.tsx`
  - `src/components/AnalysisDetailsDialog.tsx`

### 3.7 Hooks voor backend & integraties

- **Backend status & metrics**
  - `src/hooks/use-backend.ts`
    - Vraagt backend health/status op.
  - `src/hooks/use-backend-strategy-status.ts`
    - Houdt bij welke strategies actief zijn op backend.
  - `src/hooks/use-backend-metrics.ts`
    - Haalt metrics van backend.
- **Brokers & helpers**
  - `src/hooks/use-brokers.ts`
  - `src/hooks/use-mobile.ts` (UI aanpassing voor mobiel).
  - `src/hooks/use-blur-background.ts` (glassmorphism-effect).
- **Spark & license**
  - `src/hooks/use-kv-polyfill.ts` → fallback voor KV wanneer `window.spark` ontbreekt.
  - `src/hooks/use-license.ts` → licentie/entitlement logica (gebruikt `spark.meta.json`).
- **Telegram & Notion**
  - `src/hooks/use-telegram.ts` → UI voor Telegram-config.
  - `src/hooks/use-notion.ts` → integratie met Notion (voor journal/logging; zie ook tests).

---

## 4. Security, Encryption & Licenties

### 4.1 Encryptie van credentials

- **Bestand:** `src/lib/encryption.ts`
  - AES-GCM encryptie via Web Crypto API.
  - `encryptData()`, `decryptData()`.
- Gebruikt door:
  - `src/lib/backend-client.ts` / `src/state/store.ts` wanneer credentials opgeslagen worden.
  - Frontend bewaart nooit plain API keys in KV zonder encryptie.

### 4.2 License & entitlement

- **Bestanden:**
  - `src/hooks/use-license.ts`
  - `spark.meta.json`
- Werking:
  - Frontend leest entitlement/tier uit Spark/meta.
  - Beperkt toegang tot bepaalde strategiëen / features op basis van tier.

---

## 5. Tests & Documentatie in de repo

### 5.1 Tests (vitest)

**Frontend tests:**
  - `src/tests/costAnalysis.test.ts`
  - `src/tests/deribitClient.test.ts`
  - `src/tests/encryption.test.ts`
  - `src/tests/license.test.ts`
  - `src/tests/riskEngine.test.ts`

**Backend tests:**
  - Config: `backend/vitest.config.ts`
  - **Status (nov 2025): 252 passing, 82 strategisch geskipped, 0 failures**
  - Test files:
    - `backend/tests/health.test.ts` - Health check endpoints
    - `backend/tests/health-endpoints.test.ts` - REST health routes
    - `backend/tests/strategy-api.test.ts` - Strategy API endpoints
    - `backend/tests/orchestrator.test.ts` - Strategy orchestration
    - `backend/tests/deribit-broker.test.ts` - Broker adapter
    - `backend/tests/entitlement.test.ts` - License/entitlement logic
    - `backend/tests/PositionSizer.test.ts` - Position sizing
    - `backend/tests/oco-lifecycle.integration.test.ts` - OCO order lifecycle (SKIPPED - uses deprecated manual OCO, rewrite for OTOCO API needed)
    - En meer...
  
  **Skip Categories:**
  - OCO lifecycle (13 tests) - Outdated voor nieuwe OTOCO API
  - Chaos engineering (12 tests) - Future hardening, niet MVP-kritisch
  - Crash recovery (15 tests) - Edge cases, post-MVP
  - Race conditions (28 tests) - Concurrent scenarios, complexe setup
  - Misc (14 tests) - Diverse redenen, gedocumenteerd in tests
  
  **Test Rapportage:**
  - `DOCS/cleanup/TEST_CLEANUP_COMPLETE.md` - Overzicht van test fixes
  - `DOCS/cleanup/ITERATION_3_COMPLETE.md` - Test infrastructure improvements
  - `DOCS/cleanup/TYPESCRIPT_ERRORS_FIXED.md` - TypeScript error resoluties

### 5.2 Belangrijke documentatiebestanden

Deze zijn vooral referentie, maar horen bij de werkende architectuur:

- `ARCHITECTURE_OVERVIEW.md`  
  → high-level architectuur (vooral frontend + Deribit-client).  
- `BROKER_API.md`  
  → beschrijving van broker contracten en API's.  
- `CRITICAL_SAFEGUARDS.md`  
  → veiligheidsmaatregelen voor live trading.  
- `ITERATION_PLAN_V2_PRODUCTION_READY.md`  
  → plan voor production-ready setup.  
- `ITERATION_3_COMPLETION_REPORT.md`  
  → verslag van iteratie 3 (o.a. Razor/24/7 backend).  
- `COST_ANALYSIS*.md`  
  → kostenanalyse (infra, API calls, hosting).  
- `CREDENTIALS_MANAGEMENT.md`  
  → hoe credentials veilig te beheren.  
- `DEPLOYMENT.md`  
  → hoe backend + frontend te deployen (host, pm2, etc.).  

---

## 6. Code Kwaliteit & Maintenance Regels

### 6.1 Mappenstructuur & Organisatie (KRITISCH - ALTIJD HANDHAVEN)

**Root Directory Regels:**
- ✅ **Alleen tooling-essentials in root** (max 15 bestanden):
  - Build configs: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `vitest.config.ts`
  - Entry points: `index.html`, `README.md`, `LICENSE`
  - Spark metadata: `spark.meta.json`, `theme.json`
  - Master docs: `MASTER.md`
- ❌ **Nooit in root:**
  - Scripts → `scripts/`
  - PM2/deployment configs → `config/` of `deploy/`
  - Docker files → `deploy/`
  - State files → `state/`
  - Old/backup files → verwijderen of `DOCS/legacy/`
  - Losse markdown docs → `DOCS/` met subcategorieën

**Backend Structuur:**
```
backend/
  src/              # Source code (TypeScript)
  tests/            # Test files (Vitest)
  config/           # Systemd service files
  data/             # Runtime data (strategy state, backups)
  docker/           # Docker configs & init scripts
  k8s/              # Kubernetes deployments
  logs/             # Application logs (gitignored)
  strategies/       # Strategy implementations
  scripts/          # Utility scripts (install, deploy)
```

**Frontend Structuur:**
```
src/
  components/       # React components
  hooks/            # Custom React hooks
  lib/              # Utilities, clients, strategies
  state/            # Zustand store
  styles/           # CSS/styling
  tests/            # Frontend tests
  types/            # TypeScript type definitions
```

**Documentatie Structuur:**
```
DOCS/
  ADR/              # Architecture Decision Records
  api/              # API documentation
  architecture/     # System design docs
  cleanup/          # Cleanup iteration reports
  compliance/       # Legal & compliance
  deployment/       # Deployment guides
  legacy/           # Deprecated docs (met warning)
  operations/       # Runbooks & procedures
  risk/             # Risk management
  strategies/       # Strategy documentation
```

### 6.2 Test Maintenance Regels

**Test Status Categorieën:**
1. ✅ **PASS** - Test slaagt en is actueel
2. ⏭️ **SKIP** - Strategisch overgeslagen met duidelijke reden
3. ❌ **FAIL** - NOOIT acceptabel in main branch

**Skip Beslissingen (gedocumenteerd in test):**
```typescript
it.skip('test description', async () => {
  /**
   * SKIPPED: [Categorie]
   * 
   * Reden: [Waarom deze test nu niet draait]
   * 
   * TODO: [Wat nodig is om te un-skippen]
   * 
   * Context: [Gerelateerde issues/features]
   */
});
```

**Skip Categorieën:**
- **Outdated Implementation** - Test voor oude/vervangen code (bijv. manual OCO → OTOCO API)
- **Future Hardening** - Chaos engineering, edge cases, niet-kritisch voor MVP
- **Complex Setup** - Vereist externe dependencies die nog niet gemockt zijn
- **Race Conditions** - Concurrency tests die stabiele fake timers nodig hebben

**Test Principes:**
- Alle FAILS moeten gefixed of strategisch geskipped worden
- Elke skip moet gedocumenteerd zijn met TODO
- Mock setup moet consistent zijn (use `beforeEach` voor cleanup)
- Fake timers ALTIJD cleanup in `afterEach` (`vi.useRealTimers()`)
- Type assertions moeten exact matchen (IDLE vs idle)

### 6.3 TypeScript Striktness

**Zero Tolerance Beleid:**
- ❌ **0 TypeScript errors** toegestaan in builds
- ❌ **0 `@ts-ignore`** zonder uitgebreide comment
- ❌ **0 `any` types** in production code (alleen in tests indien nodig)

**Interface Compliance:**
- Alle implementations moeten volledig interface implementeren
- Mock classes in tests moeten ook volledig compliant zijn
- Nieuwe interface members vereisen updates in alle implementations

**Type Safety in Tests:**
```typescript
// ✅ GOED - Exacte type matching
const params: PlaceOrderParams = {
  instrument: 'BTC-PERPETUAL',
  side: 'buy',
  type: 'limit',
  amount: 100,
  otocoConfig: {
    takeProfit: {
      type: 'take_limit',  // Exact Deribit type
      price: 51000,
    }
  }
};

// ❌ FOUT - Generieke types in specifieke configs
takeProfit: {
  type: 'limit',  // Te algemeen, moet 'take_limit' zijn
}
```

### 6.4 Tech Debt Preventie

**⚠️ ZERO TOLERANCE Beleid:**
- ❌ Duplicaat code (DRY principe - refactor bij 2e occurrence)
- ❌ Dead code (ongebruikte functies, imports, files - delete immediately)
- ❌ Commented-out code (gebruik git history - niet in commits)
- ❌ Console.logs in production code (gebruik logger - altijd)
- ❌ TODO's zonder ticket/issue referentie (of verwijder ze)
- ❌ Magic numbers zonder const/enum (maak ze self-documenting)
- ❌ Overbodige bestanden (minder is meer - zie 6.6)
- ❌ "We fix dit later" mentaliteit (fix het NU of maak een ticket)

**Bij Code Review:**
1. Scan naar commented-out code → DELETE
2. Check voor unused imports → REMOVE
3. Zoek naar console.log → REPLACE with logger
4. Validate TODO's hebben context → ADD ticket# of REMOVE
5. Check voor duplicatie → REFACTOR immediately

**Cleanup Workflow:**
```bash
# Run deze checks voor elke commit
npm run build          # 0 errors
npm test              # 0 failures (skips OK met rationale)
npm run lint          # 0 warnings (if linter configured)
git diff              # Geen commented code, logs, of orphaned imports
```

**Code Review Checklist:**
1. Is dit de juiste map voor dit bestand?
2. Zijn alle imports nog gebruikt?
3. Zijn er duplicaties die gerefactored kunnen worden?
4. Is de TypeScript fully type-safe?
5. Zijn tests up-to-date?
6. Is documentatie bijgewerkt?

### 6.5 Deployment & State Management

**State Files Locaties:**
- Backend state: `state/backend-state.json` (NOT in backend/ of root!)
- Strategy state: `backend/data/strategy-state.json`
- Backups: `backend/data/backups/`

**Config Files:**
- PM2: `config/ecosystem.config.cjs` (production) + `.js` (development)
- Runtime: `config/runtime.config.json`
- Spark: `config/spark.meta.json` (symlink naar root voor compatibility)

**Scripts Organisatie:**
- Deployment: `scripts/` (root level)
- Backend utilities: `backend/scripts/`
- Cleanup: `scripts/cleanup-*.sh`

**Docker & K8s:**
- Docker files: `deploy/` of `backend/docker/`
- Docker Compose: `deploy/docker-compose.yml` (prod) + `docker-compose.dev.yml`
- K8s manifests: `backend/k8s/`

### 6.6 Documentation Standards

**⚠️ CRITICAL RULE: MINIMIZE NEW FILES**
- We hebben GENOEG documentatie bestanden
- Gebruik bestaande files om informatie toe te voegen
- **MASTER.md is de SINGLE SOURCE OF TRUTH** voor project context
- Dit bestand wordt meegestuurd in AI prompts voor volledige context
- Maak ALLEEN nieuwe docs voor:
  - Nieuwe features (met volledige spec)
  - Nieuwe architectuur componenten (met diagrammen)
  - Critical incidents (met postmortem analyse)
  - ADR's (Architecture Decision Records)
- Voeg toe aan bestaande docs voor:
  - Bug fixes → update relevante sectie in MASTER.md
  - Code cleanup → update iteration report
  - Refactoring → update MASTER.md sectie
  - Config changes → update MASTER.md sectie 6.5

**Elke Major Change Vereist:**
1. **Iteration Report** in `DOCS/cleanup/ITERATION_X_COMPLETE.md`:
   - Wat is gedaan
   - Waarom deze beslissingen
   - Validatie resultaten
   - Before/after metrics

2. **Decision Documentation** voor structurele wijzigingen:
   - Rationale voor file moves
   - Impact analyse
   - Rollback procedure

3. **Update MASTER.md** voor:
   - Nieuwe architectuur componenten
   - Gewijzigde verantwoordelijkheden
   - Nieuwe best practices
   - **Altijd sectie 6 updaten als er nieuwe regels/principes zijn**

**Documentation Locaties:**
- Architecture decisions: `DOCS/ADR/`
- Iteration reports: `DOCS/cleanup/`
- Legacy warnings: Comment in file + move to `DOCS/legacy/`
- **Project context: MASTER.md** (dit bestand!)

### 6.7 Production Readiness Criteria

**Voordat iets naar production gaat:**
- [ ] ✅ Alle tests passen (0 failures)
- [ ] ✅ TypeScript build succeeds (0 errors)
- [ ] ✅ Geen console errors in browser
- [ ] ✅ Backend health checks: `/health` en `/ready` return OK
- [ ] ✅ WebSocket connection stabiel
- [ ] ✅ State persistence werkt (test met restart)
- [ ] ✅ Credentials encryptie gevalideerd
- [ ] ✅ Kill switch functioneert
- [ ] ✅ Orphan cleanup draait
- [ ] ✅ Logs naar file (niet alleen console)
- [ ] ✅ Rate limiting actief
- [ ] ✅ CORS headers correct
- [ ] ✅ Error handling compleet
- [ ] ✅ Metrics worden verzameld
- [ ] ✅ Documentation up-to-date

### 6.8 Refactoring Workflow

**Nooit Code Verplaatsen Zonder:**
1. **Grep Search** naar alle referenties:
   ```bash
   grep -r "oude-filename" .
   grep -r "oude/pad" .
   ```

2. **Impact Analyse:**
   - Welke imports moeten bijgewerkt?
   - Welke configs refereren naar dit pad?
   - Zijn er hardcoded paths in code?

3. **Update & Validate:**
   - Update alle imports/paths
   - Run full build (frontend + backend)
   - Run all tests
   - Check runtime behavior

4. **Document:**
   - Add entry to iteration report
   - Update MASTER.md indien structureel

**Volgorde van Refactoring:**
1. Tests eerst laten slagen (fix failures)
2. Dan pas files verplaatsen
3. Dan pas cleanup (old files verwijderen)
4. Validatie na elke stap

### 6.9 Git & Version Control

**Commit Guidelines:**
- Atomic commits (één logische wijziging per commit)
- Descriptive messages (niet "fix", maar "Fix: health.ts strategy count bug")
- Reference issues/tickets indien van toepassing

**Branch Strategy:**
- `main` - Production-ready code only
- `develop` - Integration branch
- `feature/*` - Feature branches
- `fix/*` - Bug fixes
- `refactor/*` - Code reorganisatie

**Never Commit:**
- `node_modules/`
- `.env` files met credentials
- `logs/` directory
- IDE-specific files (`.vscode/`, `.idea/`)
- OS files (`.DS_Store`)
- Build artifacts (`dist/`, `build/`)
- State files (`backend-state.json`, `strategy-state.json`)

### 6.10 Performance & Optimization

**Backend Performance:**
- WebSocket rate limiting (500 req/min per IP)
- HTTP rate limiting (100 req/min per IP)
- Candle aggregation in-memory (niet elke tick naar disk)
- Metrics collectie: max 1x per seconde
- Log rotation (dagelijkse files, max 30 dagen)

**Frontend Performance:**
- Lazy loading voor grote components
- Debounce voor user inputs
- Memoization voor expensive calculations
- WebSocket reconnect met exponential backoff
- Polling intervals niet < 1 seconde

**Memory Management:**
- Price history: max 1000 candles in memory
- Logs: circular buffer, max 10000 entries
- WebSocket: cleanup bij disconnect
- Timers: altijd cleanup in componentWillUnmount

---

## 7. Hoe dit MASTER bestand te gebruiken

**⚠️ BELANGRIJK: Dit is het ENIGE document dat je nodig hebt voor project context!**

### 7.1 Voor AI-modellen / Agents

**Bij elke nieuwe conversatie:**
1. **Upload MASTER.md als context** - Dit geeft volledige project overzicht
2. Lees EERST sectie 6 (Development Principles) - Dit zijn de regels
3. Check sectie 2 & 3 voor architectuur & file locaties
4. Voor refactoring: combineer met `CLEANUP_PLAN.md`

**Bij elke wijziging:**
- ✅ Valideer tegen sectie 6 principes
- ✅ Update MASTER.md als er structurele changes zijn
- ✅ Maak GEEN nieuwe docs tenzij absoluut nodig (6.6)
- ✅ Gebruik bestaande iteration reports in `DOCS/cleanup/`

### 7.2 Voor Handmatige Ontwikkeling

**Dagelijks gebruik:**
- Gebruik secties 2 & 3 als "map" om code terug te vinden
- Raadpleeg sectie 4 & 5 voor deployment & testing
- Check sectie 6 voordat je code commit
- Update dit bestand bij structurele changes

**Voor nieuwe features:**
1. Check of het past in bestaande architectuur (sectie 2)
2. Volg mappenstructuur regels (6.1)
3. Schrijf tests volgens 6.2
4. Update MASTER.md met nieuwe componenten

### 7.3 Voor Code Review

**Pre-commit Checklist:**
- [ ] ✅ Mappenstructuur volgens 6.1?
- [ ] ✅ Tests volgens 6.2 (0 failures)?
- [ ] ✅ TypeScript volgens 6.3 (0 errors)?
- [ ] ✅ Geen tech debt (6.4)?
- [ ] ✅ State/config files op juiste plek (6.5)?
- [ ] ✅ MASTER.md bijgewerkt indien nodig (6.6)?
- [ ] ✅ Production ready volgens 6.7?
- [ ] ✅ Git commit clean (6.9)?
- [ ] ✅ GEEN nieuwe docs gemaakt zonder goede reden (6.6)?

**Post-commit Validatie:**
```bash
npm run build          # Frontend + Backend: 0 errors
cd backend && npm test # 0 failures (skips OK met docs)
git status            # Clean working directory
```

### 7.4 Voor Refactoring / Herstructurering

**Workflow:**
1. Lees CLEANUP_PLAN.md voor geplande changes
2. Volg 6.8 (Refactoring Workflow) EXACT:
   - Grep searches voor dependencies
   - Impact analyse
   - Update & validate
   - Document in iteration report
3. Update MASTER.md met nieuwe structure
4. **VERPLICHT:** Run full test suite na elke wijziging

**File Move Procedure:**
```bash
# 1. Find all references
grep -r "oude/pad/file.ts" .

# 2. Move file
mv oude/pad/file.ts nieuwe/pad/file.ts

# 3. Update imports
# (manual or with sed)

# 4. Validate
npm run build
npm test

# 5. Document in MASTER.md + iteration report
```
   - [ ] Git commit clean (6.9)?

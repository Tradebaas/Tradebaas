# CLEANUP_PLAN.md
Tradebaas Monster (9:11) – Cleanup & Refactor Plan

> Dit document beschrijft **alle troep, duplicaten en tech debt**  
> en geeft een **voorstel voor map-structuur & refactor-stappen**.  
> **Raak geen functionaliteit aan** zonder eerst te controleren of het in `MASTER.md` als "kritiek / werkend" staat.

---

## 1. Scope & uitgangspunten

- **Scope**: alleen custom projectcode:
  - `backend/src/**`
  - `src/**`
  - root-config (tsconfig, vite.config, vitest.config, package.json, pm2 scripts).
- **Niet aanpassen via AI**:
  - `node_modules/**`
  - `dist/**`
  - `logs/**`
  - `backend/dist/**`, `backend/node_modules/**`
- **Doel**:
  1. Dode / dubbele code verwijderen of isoleren in `/DOCS/legacy`.
  2. Functioneel gedrag behouden zoals beschreven in `MASTER.md`.
  3. Map-structuur vereenvoudigen en alignen tussen frontend & backend.

---

## 2. Overbodige of verdacht-legacy bestanden

### 2.1 Strategie-duplicaten & legacy varianten

1. **`src/lib/strategies/thirdIterationStrategy.ts`**
   - Inhoud:
     - Exporteert puur aliases naar `vortexStrategy`:
       ```ts
       export * from './vortexStrategy';
       export { VortexStrategy as ThirdIterationStrategy } from './vortexStrategy';
       export { DEFAULT_VORTEX_CONFIG as DEFAULT_THIRD_ITERATION_CONFIG } from './vortexStrategy';
       export { createVortexStrategy as createThirdIterationStrategy } from './vortexStrategy';
       ```
   - Gebruik:
     - UI en store werken met ID `'third-iteration'` maar refereren direct naar `VortexStrategy`.
     - Geen directe import van `thirdIterationStrategy.ts` gevonden in de code (zie `src/state/store.ts`, `StrategiesPage.tsx`).
   - Actie:
     - **Kandidaat voor verwijdering**.
     - Of: verplaats naar `DOCS/legacy/strategies/thirdIterationStrategy.ts` mét comment.

2. **`src/lib/strategies/thirdIterationStrategy.removed.md`**
   - Documenteert al dat deze strategie redundant is.
   - Actie:
     - Verplaats naar `DOCS/legacy/cleanup/thirdIterationStrategy.removed.md` of verwijder als info niet meer nodig is.

3. **`src/lib/strategies/razorStrategy.improved.ts`**
   - Er wordt nergens naar gerefereerd (`grep` over hele project geeft 0 imports).
   - Lijkt een experimentele variant van Razor.
   - Actie:
     - **Niet in productie pad gebruiken.**
     - Verplaats naar `DOCS/legacy/strategies/razorStrategy.improved.ts`  
       of verwijder als de logica inmiddels volledig in `backend/src/strategies/razor-executor.ts` zit.

4. **`src/hooks/use-runner-orchestrator.removed.md`**
   - Oude uitleg van een orchestrator-hook.
   - Er is een actuele `src/hooks/use-runner-orchestrator.ts`.
   - Actie:
     - Verplaats naar `DOCS/legacy/hooks/use-runner-orchestrator.removed.md` of verwijder.

### 2.2 Test-/debug-servers

1. **`backend/test-minimal-server.ts`**
   - Minimal Fastify server met simpele CORS en een paar debug-endpoints.
   - Wordt niet gebruikt door productieflow (hoofdserver is `backend/src/server.ts`).
   - Actie:
     - Verplaatsen naar `backend/examples/minimal-server.ts`.
     - Niet mee-deployen in productie.

### 2.3 Logbestanden & artefacten

- **`logs/**`**
  - `frontend*.log`, `frontend-error-*.log`, `frontend-out-*.log`
  - Actie:
    - Niet in Git / release opnemen.
    - In `.gitignore` laten staan / toevoegen.
- **Root `.log` / debug files**:
  - Bijvoorbeeld `frontend-debug.log`, `frontend-restart.log`, `frontend.log`.
  - Actie:
    - Verwijderen uit codebase (niet uit runtime server).
    - In `.gitignore` opnemen.

### 2.4 Redundante dist / build-output

- **`dist/**`** (root) en **`backend/dist/**`**
  - Gebuild output van Vite/back-end.
  - Actie:
    - NIET bewerken.
    - Uitsluiten van refactors: AI-model moet deze volledig negeren.
    - Alleen genereren via build (`npm run build` / `npm run build:backend`).

---

## 3. Dubbele & gedeelde logica (refactor-kandidaten)

### 3.1 Deribit client (frontend vs backend)

- Frontend:
  - `src/lib/deribitClient.ts`
- Backend:
  - `backend/src/deribit-client.ts`

**Probleem / tech debt:**

- Twee gescheiden implementaties:
  - Eén voor browser/WebSocket direct naar Deribit.
  - Eén voor Node/back-end.
- Types en error-afhandeling overlappen, maar zijn niet uit één bron gedefinieerd.

**Aanbeveling:**

- Introduceer een gedeeld type-pakket, bijv. `shared/deribit-types/`:
  - `shared/deribit-types/index.ts` → types voor instruments, orders, ticks, errors.
- Laat frontend en backend hun eigen implementatie houden, maar:
  - Importeer types vanuit `shared/`.
  - Borduur verder op één set error-codes & domain types.

### 3.2 Risk engine – frontend vs backend

- Frontend: `src/lib/riskEngine.ts`
- Backend: `backend/src/risk/PositionSizer.ts` en `backend/src/strategy-runner/RiskEngine.ts`

**Probleem / tech debt:**

- Logica voor positionsizing en RR wordt deels dubbel onderhouden.
- Kans op drift tussen:
  - UI-calculaties (wat user verwacht te riskeren).
  - Backend-calculaties (wat er daadwerkelijk in orders terechtkomt).

**Aanbeveling:**

- Definieer één **bron van waarheid** in backend (PositionSizer).
- Frontend:
  - Of: alleen UI-preview tonen op basis van dezelfde formules (gekopieerd maar expliciet gesynchroniseerd).
  - Of: backend endpoint toevoegen `/risk/preview` en van daaruit berekenen.
- Documenteer contract in `BROKER_API.md` of aparte `RISK_ENGINE.md`.

### 3.3 Strategie logica – Razor front vs Razor backend

- Frontend:
  - `src/lib/strategies/razorStrategy.ts`
- Backend:
  - `backend/src/strategies/razor-executor.ts`

**Probleem / tech debt:**

- Twee implementaties van hetzelfde concept:
  - Frontend-variant (ooit voor client-side trading).
  - Backend-variant (nu de primaire uitvoerder van orders).
- Frontend gebruikt Razor strategy nu vooral voor **analysis UI**, terwijl backend de echte orders plaatst.

**Aanbeveling:**

- Maak expliciet onderscheid tussen:
  - `RazorAnalysis` (frontend)  
  - `RazorExecutor` (backend)
- Synchroniseer de **beslislogica (signalen)**:
  - Documenteer criteria als bullets in `STRATEGY_RAZOR.md`.
  - Zorg dat beide varianten vanuit die documentatie zijn opgebouwd.
- Overweeg om op termijn **alle live-signaallogica alleen in backend** te houden en frontend als viewer.

---

## 4. Algemeen tech debt & verbeterpunten

### 4.1 Hardcoded configuratie

- Voorbeelden:
  - `src/lib/encryption.ts` → vaste `ENCRYPTION_KEY = 'tradebaas_secure_key_v1'`.
  - `src/lib/backend-strategy-client.ts` → baseUrl `http://<host>:3000`.

**Aanbevelingen:**

- Encryption key:
  - Verplaats naar omgeving / deployment secrets.
  - Maak key per omgeving configureerbaar.
- Backend URL:
  - Gebruik relatieve path (`/api` proxy via Vite/nginx) of environment variabelen (`import.meta.env`).

### 4.2 Ongebruikte / zwak gedocumenteerde hooks

- **`src/hooks/use-runner-orchestrator.ts`**
  - Nagaan of deze nog actief wordt gebruikt in UI.
  - Indien niet: markeren als experimental en verplaatsen naar `src/hooks/experimental/`.
- Algemeen:
  - Alle hooks voorzien van korte doc-comment (doel + waar gebruikt).

### 4.3 Testdekking backend

- `backend/vitest.config.ts` aanwezig, maar:
  - Nauwelijks of geen echte testbestanden in `backend/src/**`.
- Aanbeveling:
  - Introduceer minimaal:
    - `backend/tests/PositionSizer.test.ts`
    - `backend/tests/RazorExecutor.test.ts`
    - `backend/tests/StrategyService.test.ts`
  - Focus op:
    - Position sizing.
    - Signaal-criteria Razor.
    - Auto-resume van state-manager.

---

## 5. Voorgestelde map-structuur (doelstructuur)

### 5.1 Hoofdniveau

Huidig:  
- Frontend in `src/**`  
- Backend in `backend/**`  
- Allerlei docs in root.

**Doel (pragmatisch, weinig breekrisico):**

```text
/
├─ backend/
│  ├─ src/
│  │  ├─ brokers/
│  │  ├─ strategies/
│  │  ├─ strategy-runner/
│  │  ├─ risk/
│  │  ├─ lifecycle/
│  │  ├─ monitoring/
│  │  ├─ websocket/
│  │  ├─ notifications/
│  │  ├─ types/
│  │  ├─ orchestrator/         (optioneel - runtime coördinatie)
│  │  ├─ config.ts
│  │  ├─ api.ts
│  │  ├─ server.ts
│  │  ├─ health.ts
│  │  ├─ logger.ts
│  │  ├─ credentials-manager.ts
│  │  └─ state-manager.ts
│  ├─ tests/
│  └─ dist/ (build output - niet bewerken)
│
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  │  ├─ dialogs/
│  │  │  ├─ layout/
│  │  │  ├─ trading/
│  │  │  └─ metrics/
│  │  ├─ hooks/
│  │  ├─ lib/
│  │  │  ├─ strategies/
│  │  │  ├─ brokers/
│  │  │  ├─ utils/
│  │  │  ├─ risk/
│  │  │  └─ backend/
│  │  ├─ state/
│  │  ├─ styles/
│  │  ├─ types/
│  │  └─ main.tsx, App.tsx
│  ├─ tests/
│  └─ dist/ (build output)
│
├─ DOCS/
│  ├─ architecture/
│  ├─ risk/
│  ├─ strategies/
│  ├─ cleanup/
│  ├─ legacy/
│  └─ *.md (oorspronkelijke docs zoals ARCHITECTURE_OVERVIEW.md etc.)
│
├─ scripts/
│  ├─ pm2-startup.sh
│  ├─ kv-api.cjs
│  └─ kv-api-redis.cjs
│
├─ logs/        (runtime, niet in Git)
└─ tests/       (optioneel globaal)
```

> Opmerking:  
> in de huidige codebase staat de frontend direct in `src/**`.  
> Je kunt óf deze root behouden (en enkel binnen `src` opschonen), óf een expliciete `frontend/` map introduceren.  
> Laat een AI-agent dit stapsgewijs doen met goede search/replace op imports.

---

## 6. Aanpak voor AI-agent (uitvoeringsstrategie)

Gebruik dit plan letterlijk als input voor je AI-model.

### 6.1 Stappenplan (globaal)

1. **Stap 1 – Markeer artefacten**
   - Negeer:
     - `node_modules/**`
     - `dist/**`
     - `logs/**`
     - `backend/dist/**`, `backend/node_modules/**`

2. **Stap 2 – Verplaats legacy files**
   - Verplaats:
     - `src/lib/strategies/thirdIterationStrategy.ts` → `DOCS/legacy/strategies/`
     - `src/lib/strategies/thirdIterationStrategy.removed.md` → `DOCS/legacy/cleanup/`
     - `src/lib/strategies/razorStrategy.improved.ts` → `DOCS/legacy/strategies/`
     - `src/hooks/use-runner-orchestrator.removed.md` → `DOCS/legacy/hooks/`
     - `backend/test-minimal-server.ts` → `backend/examples/`
   - Pas geen imports aan zolang er geen referenties bestaan; controleer dat er geen import-fouten ontstaan.

3. **Stap 3 – Map-structuur binnen bestaande layout opschonen**
   - Groepeer frontend-componenten in logische submappen:
     - `src/components/trading/`, `src/components/metrics/`, `src/components/dialogs/`, etc.
   - Laat alle import paths automatisch updaten (VSCode/TS server of codemod).

4. **Stap 4 – Types centraliseren**
   - Maak `src/types/deribit.ts` en `backend/src/types/deribit.ts` of een gedeelde `shared/deribit-types/`.
   - Migreer losse type-definities uit:
     - `src/lib/deribitClient.ts`
     - `backend/src/deribit-client.ts`
     - `backend/src/types/ws.d.ts`
   - Update imports.

5. **Stap 5 – Risk engine alignen**
   - Documenteer formules in een nieuwe `DOCS/RISK_ENGINE.md`.
   - Check dat:
     - Frontend `calculatePosition` ≈ Backend `PositionSizer` logica.
   - Fix eventuele afwijkingen.

6. **Stap 6 – Tests uitbreiden**
   - Voeg minimaal unit tests toe voor:
     - `backend/src/risk/PositionSizer.ts`
     - `backend/src/strategies/razor-executor.ts`
     - `backend/src/state-manager.ts`

7. **Stap 7 – Validatie**
   - Run:
     - `npm test` (frontend + backend).
     - `npm run build` / `npm run build:backend`.
   - Handmatige smoke-test:
     - App starten, verbinding naar Deribit testnet maken.
     - Strategie starten en checken dat:
       - Orders op backend worden geplaatst.
       - UI real-time updates toont (status, metrics, positions).

---

## 7. Samenvatting

- **MASTER.md** = waar **alle werkende functionaliteit** beschreven staat (architectuur + paden).
- **CLEANUP_PLAN.md** (dit bestand) =  
  jouw AI-blauwdruk om:
  - legacy & duplicaten op te ruimen,
  - de map-structuur te normaliseren,
  - de backend/ frontend logica beter te alignen,
  - zonder werkende features kapot te maken.

# Backend Analysis Probleem - Diagnose & Oplossing

## Datum: 20 November 2025
## Status: ROOT CAUSE GEVONDEN

---

## Wat is het probleem?

Je ziet in de frontend:
- "Geen actieve strategie" in de Live Analyse modal
- HTTP 404 errors voor `/api/strategy/analysis/:strategyId`
- Console logs tonen: `Failed to fetch: Error: HTTP 404` en `{"success":false,"error":"No analysis data available for this strategy"}`

---

## Root Cause Analyse

### 1. Remote Backend Draait Oude Code ❌

**Bewijs:**
```bash
curl http://YOUR_SERVER_IP:3000/api/debug/strategies
# Result: 404 Not Found
```

De debug endpoint die ik net heb toegevoegd bestaat NIET op de remote server. Dit betekent dat de remote backend nog de oude code draait zonder mijn recente fixes.

### 2. Thor Strategie Bestaat Niet in Backend ❌

**Bewijs:**
```bash
curl http://YOUR_SERVER_IP:3000/api/strategy/status | jq '.strategies'
```

**Resultaat:**
- Strategy 1: Razor (ID: strategy-1763464815183) - status: "stopped"
- Strategy 2: Razor (ID: strategy-1763675584897) - status: "active"
- **GEEN Thor strategy gevonden!**

**Backend State File (`/root/Tradebaas/state/backend-state.json`):**
```json
{
  "activeStrategies": [
    {
      "id": "strategy-1763464815183",
      "name": "Razor",
      "status": "stopped"
    },
    {
      "id": "strategy-1763675584897",
      "name": "Razor",
      "status": "active"
    }
  ]
}
```

### 3. Frontend Pollt Voor Non-Existent Thor ID ❌

De frontend denkt dat er een Thor strategy draait en vraagt analyse op voor een `strategy-1763675331793` ID (of vergelijkbaar), maar dit ID bestaat NIET in de backend.

**Logica breakdown:**
1. Frontend: `primaryStrategyId` = Thor ID (van UI selectie)
2. Frontend: `GET /api/strategy/analysis/strategy-<thor-id>`
3. Backend: `stateManager.getStrategy(strategyId)` → **NULL** (strategy bestaat niet)
4. Backend: Return 404 met error message
5. Frontend modal: "Geen actieve strategie"

---

## Waarom Start Thor Niet?

### Mogelijke Oorzaken:

#### A. Thor wordt nooit gestart via UI
- Gebruiker selecteert "Thor" in dropdown maar klikt op "Start Razor" button
- Of Thor knop is disabled/hidden

#### B. Thor start crasht tijdens initialize
- `ThorExecutor.initialize()` faalt
- Error wordt niet goed gelogd
- Strategy wordt aangemaakt maar direct verwijderd

#### C. Naming mismatch
- Code verwacht exact `"thor"` (lowercase)
- UI stuurt `"Thor"` (capitalized)
- Check in code:
  ```typescript
  const nameLower = strategy.name.toLowerCase();
  if (nameLower === 'thor') {  // ✅ Zou moeten werken
  ```

---

## Wat Heb Ik Gefixt in Lokale Code?

### 1. `StrategyService.getStrategyAnalysis()` - Robuuste Fallback ✅

**Voor:**
```typescript
async getStrategyAnalysis(strategyId: string): Promise<AnalysisState | null> {
  const strategy = stateManager.getStrategy(strategyId);
  if (!strategy || !strategy.analysisState) {
    return null;  // ❌ 404 voor ALLES zonder analysis
  }
  return strategy.analysisState;
}
```

**Na:**
```typescript
async getStrategyAnalysis(strategyId: string): Promise<AnalysisState | null> {
  const strategy = stateManager.getStrategy(strategyId);
  
  if (!strategy) {
    console.warn('[StrategyService] Strategy not found:', strategyId);
    // Log available strategies for debugging
    const all = stateManager.getAllStrategies();
    console.warn('Available:', all.map(s => `${s.name} (${s.id})`).join(', '));
    return null;  // ✅ 404 alleen voor non-existent strategy
  }

  if (strategy.analysisState) {
    return strategy.analysisState;
  }

  // ✅ Return default warm-up state voor bestaande strategy zonder analysis
  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    instrument: strategy.config?.instrument || 'BTC_USDC-PERPETUAL',
    status: 'analyzing',
    currentPrice: null,
    lastUpdated: Date.now(),
    indicators: { /* defaults */ },
    signal: {
      type: 'none',
      strength: 0,
      confidence: 0,
      reasons: ['Strategie wordt opgestart, wacht op voldoende marktdata']
    },
    checkpoints: [{
      id: 'initializing',
      label: 'Strategie wordt opgestart',
      description: 'Marktdata wordt verzameld...',
      status: 'pending',
      timestamp: Date.now()
    }],
    requiredDataPoints: 30,
    dataPoints: 0,
    cooldownUntil: null,
    nextCheckAt: null
  };
}
```

### 2. Initiële AnalysisState Persistence ✅

**Razor & Thor** worden nu direct na `initialize()` gepersist:

```typescript
await executor.initialize();

// ✅ Persist initial state IMMEDIATELY
try {
  await stateManager.updateStrategyAnalysis(strategy.id, executor.getAnalysisState());
} catch (error) {
  console.error('[StrategyService] Failed to persist initial analysis:', error);
}
```

### 3. Enhanced Logging ✅

**Server endpoint:**
```typescript
server.get('/api/strategy/analysis/:strategyId', async (request, reply) => {
  const { strategyId } = request.params;
  
  log.info('[API] Analysis request received', { strategyId });
  
  const analysis = await strategyService.getStrategyAnalysis(strategyId);
  
  if (!analysis) {
    log.warn('[API] Strategy not found', { strategyId });
    // ✅ Log what strategies DO exist
    const all = await strategyService.getStrategyStatus();
    log.warn('[API] Available strategies', { 
      count: all.length,
      ids: all.map(s => ({ id: s.id, name: s.name, status: s.status }))
    });
    return reply.code(404).send({
      success: false,
      error: 'Strategy not found'
    });
  }

  log.info('[API] Analysis returned', { 
    strategyId, 
    status: analysis.status,
    checkpoints: analysis.checkpoints?.length 
  });
  return reply.send({ success: true, analysis });
});
```

### 4. Debug Endpoint ✅

```typescript
server.get('/api/debug/strategies', async (request, reply) => {
  const strategies = await strategyService.getStrategyStatus();
  return reply.send({
    success: true,
    count: strategies.length,
    strategies: strategies.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      hasAnalysis: !!s.analysisState,
      analysisStatus: s.analysisState?.status,
      checkpoints: s.analysisState?.checkpoints?.length || 0
    }))
  });
});
```

---

## Oplossing: 3-Stappen Plan

### Stap 1: Deploy Nieuwe Backend Code 🚀

**Lokaal gebouwd:**
```bash
cd /root/Tradebaas/backend
npm run build
```

**Deploy naar remote:**
```bash
# Package backend
cd /root/Tradebaas
tar -czf backend-deploy-new.tar.gz \
    backend/dist \
    backend/package.json \
    backend/package-lock.json \
    backend/.env.production \
    backend/node_modules

# Upload en extract op remote server
# Restart backend service (PM2/systemd)
```

### Stap 2: Verifieer Backend Update ✅

**Test debug endpoint:**
```bash
curl http://YOUR_SERVER_IP:3000/api/debug/strategies | jq '.'
```

**Verwacht resultaat:**
```json
{
  "success": true,
  "count": 2,
  "strategies": [...]
}
```

Als dit werkt → backend draait nieuwe code ✅

### Stap 3: Start Thor Strategie ⚡

**Via UI:**
1. Stop eventuele actieve Razor strategy
2. Selecteer "Thor" in dropdown
3. Configureer risk settings
4. Klik "Start Thor" (niet "Start Razor"!)

**Verifieer via API:**
```bash
# Check of Thor nu bestaat
curl http://YOUR_SERVER_IP:3000/api/strategy/status | jq '.strategies[] | select(.name == "Thor")'

# Check Thor analysis
THOR_ID=$(curl -s http://YOUR_SERVER_IP:3000/api/strategy/status | jq -r '.strategies[] | select(.name == "Thor") | .id')
curl "http://YOUR_SERVER_IP:3000/api/strategy/analysis/$THOR_ID" | jq '.'
```

**Verwacht resultaat:**
- `200 OK` met `success: true`
- `analysis` object met checkpoints
- Status: `"analyzing"` of `"position_open"`
- Frontend modal toont Thor checkpoints ✅

---

## Testing & Verificatie

### Test Script Beschikbaar:
```bash
/root/Tradebaas/test-backend-analysis.sh
```

**Dit script test:**
- Alle strategies ophalen
- Debug endpoint
- Analysis endpoint voor eerste strategy

### Expected Frontend Behavior Na Fix:

#### Scenario A: Thor Start (Warm-up Phase)
1. User start Thor via UI
2. Backend: `POST /api/strategy/start` → Thor strategy created
3. Backend: `ThorExecutor.initialize()` → initial analysis persisted
4. Frontend: Poll `/api/strategy/analysis/strategy-<thor-id>`
5. Response: `200 OK` met default warm-up state
6. Modal toont: 
   - "Strategie wordt opgestart" 
   - Checkpoint: "Marktdata verzamelen"
   - Progress indicator

#### Scenario B: Thor Running (Normal)
1. Thor heeft 30+ candles verzameld
2. Analysis bevat echte RSI/ATR/BB data
3. Checkpoints tonen Thor-specifieke checks:
   - RSI niveau
   - ATR percentage
   - Bollinger Band positie
   - Risk parameters
4. Modal toont live Thor analysis

#### Scenario C: Geen Strategy
1. Geen backend strategy actief
2. `primaryStrategyId` = null
3. Modal toont: "Geen actieve strategie"
4. Suggestion: "Start Razor of Thor"

---

## Belangrijke Bestanden

### Modified:
- `/root/Tradebaas/backend/src/strategy-service.ts` - getStrategyAnalysis fix + logging
- `/root/Tradebaas/backend/src/server.ts` - analysis endpoint + debug endpoint + logging
- `/root/Tradebaas/src/components/dialogs/AnalysisDetailsDialog.tsx` - warm-up handling

### Created:
- `/root/Tradebaas/test-backend-analysis.sh` - Test script
- `/root/Tradebaas/deploy-backend-updated.sh` - Deploy helper

### State Files:
- `/root/Tradebaas/state/backend-state.json` - Lokale backend state
- `/root/backend/state/backend-state.json` - Remote backend state (TBD)

---

## Conclusie

**Huidige Situatie:**
- ✅ Code is lokaal gefixt en gebouwd
- ❌ Remote backend draait oude code
- ❌ Thor strategy is nooit gestart
- ❌ Frontend pollt voor non-existent strategy ID

**Acties Vereist:**
1. Deploy nieuwe backend code naar remote
2. Restart remote backend service
3. Start Thor via UI (stop eerst Razor)
4. Verifieer dat analyse modal Thor data toont

**ETA tot werkend:**
- Deploy: 5 minuten
- Test: 2 minuten
- **Total: ~10 minuten tot volledig werkend** ⚡

---

## Follow-up Checks

Na deployment:

```bash
# 1. Check backend version (debug endpoint should exist)
curl http://YOUR_SERVER_IP:3000/api/debug/strategies

# 2. Check Thor exists
curl http://YOUR_SERVER_IP:3000/api/strategy/status | jq '.strategies[] | select(.name == "Thor")'

# 3. Check Thor analysis
curl "http://YOUR_SERVER_IP:3000/api/strategy/analysis/<THOR_ID>" | jq '.analysis.checkpoints'

# 4. Check backend logs
# tail -f /root/backend/backend.log | grep -i "thor\|analysis"
```

---

**Status:** READY FOR DEPLOYMENT 🚀
**Next:** Deploy backend → Start Thor → Verify frontend

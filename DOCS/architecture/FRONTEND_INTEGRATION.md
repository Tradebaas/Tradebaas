# Frontend Backend Integration

Deze integratie verbindt de bestaande iOS-achtige frontend met de nieuwe backend services zonder visuele wijzigingen.

## Overzicht

De frontend communiceert nu met de backend voor:
- Broker connecties (`/api/connect`)
- Strategy management (`/api/strategy/load`, `/api/strategy/start`, `/api/strategy/stop`)
- Risk configuratie (`/api/config`)
- IAP receipt verificatie (`/api/iap/verify-receipt`)
- Entitlement status (`/api/me/entitlement`)

## Architectuur

### Backend Client (`src/lib/backend-client.ts`)

Centrale API client die alle backend communicatie afhandelt:

```typescript
import { backendClient } from '@/lib/backend-client';

// Broker verbinding
await backendClient.connect('deribit', {
  apiKey: 'xxx',
  apiSecret: 'xxx',
  environment: 'live'
});

// Strategy laden en starten
await backendClient.loadStrategy('ema-rsi-scalper');
await backendClient.startStrategy('ema-rsi-scalper', config);

// Risk settings updaten
await backendClient.updateConfig({
  riskMode: 'percentage',
  riskValue: 2.0
});

// Receipt verificatie
const result = await backendClient.verifyReceipt(receipt, productId);
if (result.valid && result.jwt) {
  // JWT wordt automatisch opgeslagen en bij elke request meegestuurd
}

// Entitlement ophalen
const entitlement = await backendClient.getEntitlement();
```

### React Hook (`src/hooks/use-backend.ts`)

React hook voor eenvoudige toegang tot backend state:

```typescript
import { useBackend } from '@/hooks/use-backend';

function MyComponent() {
  const { brokerName, entitlementTier, refreshEntitlement } = useBackend();
  
  return (
    <div>
      <p>Broker: {brokerName}</p>
      <p>Tier: {entitlementTier}</p>
    </div>
  );
}
```

## Integratiepunten

### 1. Settings → Broker Connectie

**Locatie:** `src/components/SettingsDialog.tsx` → `src/state/store.ts`

Bij verbinding maken wordt nu ook de backend geïnformeerd:

```typescript
// In useTradingStore.connect()
const backendResponse = await backendClient.connect('deribit', {
  apiKey: credentials.apiKey,
  apiSecret: credentials.apiSecret,
  environment,
});
```

De frontend blijft direct verbinden met Deribit voor real-time trading, maar de backend krijgt ook de credentials om parallel te werken.

### 2. Strategy Card → Load/Start/Stop

**Locatie:** `src/components/StrategyTradingCard.tsx` → `src/state/store.ts`

Bij strategy start:

```typescript
// In useTradingStore.startStrategy()
await backendClient.loadStrategy(strategyId);
await backendClient.startStrategy(strategyId, config);
```

De strategy draait zowel frontend (voor directe UI feedback) als backend (voor 24/7 orchestration).

### 3. Risk Settings → Config

**Locatie:** `src/components/StrategyTradingCard.tsx` → `src/state/store.ts`

Bij risk settings wijziging:

```typescript
// In useTradingStore.setRiskSettings()
await backendClient.updateConfig({
  riskMode: settings.mode === 'percent' ? 'percentage' : 'fixed',
  riskValue: settings.value,
});
```

### 4. Purchase Flow → Receipt Verificatie

**Locatie:** `src/components/PurchaseDialog.tsx` → `src/components/LicenseDialog.tsx`

Nieuwe purchase flow component voor StoreKit 2 integratie:

```typescript
<PurchaseDialog
  open={purchaseDialogOpen}
  onOpenChange={setPurchaseDialogOpen}
  productId="basic_monthly"
  productName="Basic Monthly"
  onSuccess={refreshEntitlement}
/>
```

De component stuurt het receipt naar `/api/iap/verify-receipt` en slaat het ontvangen JWT op.

### 5. Header → Broker Name + License Badge

**Locatie:** `src/App.tsx`

Nieuwe UI elementen in de header (enige visuele wijziging):

```tsx
{brokerName && (
  <Badge variant="outline">{brokerName}</Badge>
)}
{entitlementTier !== 'free' && (
  <Badge variant="outline" onClick={openLicenseDialog}>
    <ShieldCheck /> {entitlementTier.toUpperCase()}
  </Badge>
)}
```

## JWT Authentication

Het entitlement JWT wordt automatisch beheerd:

1. **Ophalen:** Na receipt verificatie via `/api/iap/verify-receipt`
2. **Opslaan:** In Spark KV storage onder `entitlement_jwt`
3. **Meesturen:** Bij elke backend request in de `Authorization` header

```typescript
Authorization: Bearer eyJhbGc...
```

## Environment Variabelen

Maak een `.env` bestand in de root:

```bash
VITE_BACKEND_URL=http://localhost:3000
```

Voor productie:

```bash
VITE_BACKEND_URL=https://api.tradebaas.com
```

## Data Persistence

De frontend slaat lokaal op in Spark KV:

- `entitlement_jwt` - JWT voor backend authenticatie
- `connected_broker` - Laatst verbonden broker naam
- `risk-settings` - Risk configuratie
- Plus alle bestaande Deribit credentials (encrypted)

## Error Handling

Alle backend calls zijn non-blocking en falen gracefully:

```typescript
const backendResponse = await backendClient.connect(...);
if (!backendResponse.success) {
  console.warn('Backend connection failed:', backendResponse.error);
  // Frontend gaat gewoon door met lokale verbinding
}
```

De app blijft volledig functioneel als de backend niet bereikbaar is.

## Testing

### Backend Connection Test

```typescript
import { backendClient } from '@/lib/backend-client';

const result = await backendClient.connect('deribit', {
  apiKey: 'test_key',
  apiSecret: 'test_secret',
  environment: 'testnet'
});

console.log(result.success); // true/false
```

### Receipt Verification Test

```typescript
const result = await backendClient.verifyReceipt(
  'receipt_test_basic_20240101',
  'basic_monthly'
);

console.log(result.valid); // true
console.log(result.jwt); // "eyJhbGc..."
```

## Acceptance Criteria

✅ Settings → `/api/connect` (broker + API keys)  
✅ Strategy card → `/api/strategy/load`, `/api/strategy/start`, `/api/strategy/stop`  
✅ Risk settings → `/api/config`  
✅ Header toont broker naam en license tier badge (enige nieuwe UI)  
✅ Purchase flow via PurchaseDialog → `/api/iap/verify-receipt`  
✅ JWT wordt lokaal opgeslagen en meegestuurd bij elke request  
✅ App functioneert zoals nu (UI ongewijzigd behalve badge)  
✅ Alle acties gaan via backend (naast bestaande frontend functionaliteit)  

## Migratie Pad

De huidige implementatie draait parallel:

1. **Frontend:** Directe Deribit verbinding voor real-time trading
2. **Backend:** Ontvangt zelfde credentials voor 24/7 orchestration

In de toekomst kan de frontend volledig backend-only worden door:
- WebSocket verbinding met backend in plaats van directe Deribit
- Backend stuurt real-time updates naar frontend
- Frontend wordt pure UI layer

De huidige setup is backwards compatible en maakt incrementele migratie mogelijk.

## Troubleshooting

### Backend URL niet bereikbaar

Check `.env` bestand en zorg dat backend draait:

```bash
cd backend
npm install
npm run dev
```

### JWT niet meegestuurd

Check of JWT correct is opgeslagen:

```typescript
const jwt = await spark.kv.get('entitlement_jwt');
console.log(jwt); // Should be string
```

### Broker naam niet zichtbaar

De broker naam wordt pas getoond na succesvol verbinden:

```typescript
const brokerName = await backendClient.getBrokerName();
console.log(brokerName); // "deribit" of null
```

## Volgende Stappen

Mogelijke uitbreidingen:

1. **Real-time sync:** WebSocket voor live backend updates
2. **Multi-device:** Zelfde strategy op meerdere devices
3. **Cloud strategies:** Strategies volledig op backend draaien
4. **Advanced analytics:** Backend aggregeert data van alle users
5. **Social trading:** Strategies delen tussen users

## Links

- Backend API docs: `backend/README.md`
- Orchestrator docs: `backend/src/orchestrator/README.md`
- License service: `LICENSE_SERVICE.md`
- Broker API: `BROKER_API.md`

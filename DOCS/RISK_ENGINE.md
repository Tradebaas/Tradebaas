# Risk Engine Documentatie

## Overzicht
De Tradebaas risk engine bepaalt position sizing en risk management voor alle trading strategieën. Er zijn twee implementaties:

1. **Frontend Risk Engine** (`src/lib/riskEngine.ts`) - Voor frontend analyse en calculaties
2. **Backend Risk Engine** (`backend/src/risk/PositionSizer.ts`) - Voor daadwerkelijke order execution

## Position Sizing Formule

### Basis Formule
```typescript
position_size_usd = account_balance * risk_percentage / 100
```

### Met Leverage
```typescript
position_size_btc = position_size_usd / (btc_price * leverage)
```

### Afrondingsregels
- Deribit vereist "amount" in hele BTC contracten
- **Frontend**: `Math.floor(position_size_btc * 10) / 10` (afgerond op 0.1 BTC)
- **Backend**: `Math.floor(position_size_btc)` (afgerond naar beneden op hele BTC)
- Minimum: **10 USD** contract size (Deribit limiet)

## Risk Modi

### 1. Fixed Risk (`fixed`)
- Gebruikt vaste USD amount uit settings
- Onafhankelijk van account balance
- Voor consistente testing

### 2. Percentage Risk (`percentage`)
- Gebruikt percentage van account balance
- Dynamisch schaalt met account grootte
- Recommended voor productie

### 3. Kelly Criterion (`kelly`)
- Mathematisch optimale position size
- Formule: `f* = (bp - q) / b`
  - `b` = odds (reward/risk ratio)
  - `p` = win probability
  - `q` = loss probability (1 - p)
- Vereist historische win rate data

## Broker-Specific Limits

### Deribit
- **Max Leverage**: 50x (hardcoded in PositionSizer)
- **Min Contract**: 10 USD
- **Tick Size**: 0.0001 BTC voor BTC-PERPETUAL
- **Max Position**: Afhankelijk van maintenance margin

## Frontend vs Backend Verschillen

| Aspect | Frontend | Backend |
|--------|----------|---------|
| **Afrondingslogic** | 0.1 BTC (meer conservatief) | Hele BTC (veiligere executie) |
| **Leverage Cap** | User-defined max | Hardcoded 50x max |
| **Validation** | Pre-trade warnings | Runtime errors + auto-reduce |
| **Source** | `calculatePosition()` | `PositionSizer.calculateSize()` |

## OTOCO Bracket Orders

Voor elke positie worden automatisch Stop Loss en Take Profit orders aangemaakt:

### Take Profit (TP)
```typescript
tp_price = entry_price * (1 + target_percentage / 100)  // voor long
tp_price = entry_price * (1 - target_percentage / 100)  // voor short
```

### Stop Loss (SL)
```typescript
sl_price = entry_price * (1 - stop_percentage / 100)    // voor long
sl_price = entry_price * (1 + stop_percentage / 100)    // voor short
```

### Default Settings (Razor Strategy)
- **Take Profit**: 1.5% (150 basis points)
- **Stop Loss**: 0.7% (70 basis points)
- **Risk/Reward Ratio**: ~2.14:1

## Usage Examples

### Frontend Calculation
```typescript
import { calculatePosition } from '@/lib/riskEngine';

const result = calculatePosition({
  accountBalance: 10000,
  riskPercentage: 2,
  leverage: 10,
  entryPrice: 50000,
  mode: 'percentage'
});
// result.amount = 0.4 BTC
// result.notionalValue = 20000 USD
```

### Backend Execution
```typescript
const sizer = new PositionSizer({
  accountBalance: 10000,
  riskPercentage: 2,
  maxLeverage: 50
});

const size = await sizer.calculateSize(
  50000,  // current BTC price
  'buy'   // trade direction
);
// Automatically capped at 50x leverage
```

## Safety Guardrails

1. **Minimum Position**: 10 USD (Deribit exchange limit)
2. **Maximum Leverage**: 50x (regulatory + exchange limit)
3. **Auto-Reduce**: Backend automatically reduces size if leverage exceeded
4. **Balance Checks**: Prevent trades if insufficient margin
5. **Price Validation**: Reject orders with impossible TP/SL levels

## Sync Requirements

⚠️ **CRITICAL**: Frontend en backend formules moeten **gesynchroniseerd** blijven:

- Afrondingslogic mag verschillen (frontend conservatiever)
- Leverage caps moeten consistent zijn
- Minimum position sizes moeten gelijk zijn
- TP/SL percentages moeten matchen tussen UI en executor

## Roadmap / Tech Debt

- [ ] **Centraliseer types**: `PositionSizeInput`, `RiskMode` duplicated across frontend/backend
- [ ] **Shared validators**: Leverage/amount validation logic duplicated
- [ ] **Kelly criterion**: Implementeer win rate tracking voor adaptive sizing
- [ ] **Dynamic TP/SL**: Per-strategy configureerbare risk/reward ratios
- [ ] **Portfolio risk**: Multi-strategy correlation-aware position sizing

## Referenties

- **Frontend implementatie**: `src/lib/riskEngine.ts`
- **Backend implementatie**: `backend/src/risk/PositionSizer.ts`
- **Deribit API docs**: https://docs.deribit.com/
- **OTOCO orders**: `backend/src/brokers/DeribitBroker.ts` → `placeOTOCO()`

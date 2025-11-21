# Development Documentation

## Vortex Strategy & AdvancedBracketManager

### Overview

De **Vortex Strategy** is een geavanceerde trading strategie die:
- Automatische TP1 (Take Profit 1) van 50% op 1R (Risk-to-Reward ratio)
- Automatische Stop Loss verplaatsing naar Break-Even na TP1
- Configureerbare trailing methodes voor de resterende 50% runner positie
- Volledige risk management integratie
- State recovery na restarts

### Architectuur

#### 1. Strategy Components

**ThirdIterationStrategy** (`src/lib/strategies/thirdIterationStrategy.ts`)
- Main strategy class met lifecycle management (ook bekend als "Vortex")
- Candle monitoring op 1m timeframe
- Indicator berekeningen (EMA100, BB(20,2σ), RSI(4))
- Signal detection (placeholder voor mechanische rules)
- Risk-sizing via RiskEngine
- Bracket management via AdvancedBracketManager

**AdvancedBracketManager** (`src/lib/orders/AdvancedBracketManager.ts`)
- Initial bracket placement (SL + TP1)
- TP1 detection + SL->BE movement
- Trailing runner met 4 methodes:
  - `swing`: Trail onder/boven swing high/low
  - `ema20`: Trail onder/boven EMA20 ± ticks
  - `oppBB`: Sluit bij opposite Bollinger Band
  - `rsiFlip`: Sluit bij RSI flip (oversold/overbought)
- Idempotente order modificaties
- State recovery

**Indicators** (`src/lib/indicators/`)
- Pure functions voor EMA, Bollinger Bands, RSI
- Windowed calculations
- Zero dependencies

**Circuit Breakers** (`src/lib/guards/circuitBreakers.ts`)
- Daily max trades
- Daily max loss (% en fixed)
- Automatic killswitch triggering

### Configuratie

```typescript
export interface ThirdIterationConfig {
  instrument: string;                // Trading instrument
  riskMode: 'percent' | 'fixed';     // Risk mode
  riskValue: number;                 // Risk value (1-3% of equity)
  maxLeverage: number;               // Max leverage (default 50x)
  trailMethod: TrailMethod;          // Trailing method
  monitorIntervalMs: number;         // Monitor interval (default 2000ms)
  minSpreadTicks?: number;           // Min spread filter
  cancelOnNews?: boolean;            // News filter (placeholder)
  maxDailyTrades?: number;           // Daily trade limit
  maxDailyLoss?: number;             // Daily loss limit (USDC)
}
```

### Gebruik

#### Start Strategy

```typescript
import { createThirdIterationStrategy } from '@/lib/strategies/thirdIterationStrategy';

const strategy = createThirdIterationStrategy(
  deribitClient,
  {
    instrument: 'BTC_USDC-PERPETUAL',
    riskValue: 1.5,
    trailMethod: 'ema20',
  },
  riskSettings,
  equity,
  {
    onPositionOpen: (pos) => console.log('Position opened', pos),
    onPositionClose: (pos, pnl) => console.log('Position closed', pnl),
    onError: (error) => console.error('Strategy error', error),
    onEvent: (event) => console.log('Event', event),
  }
);

await strategy.start();
```

#### Stop Strategy

```typescript
await strategy.stop();
```

#### Check Active Position

```typescript
const hasPosition = strategy.hasActivePosition();
```

#### Get Analysis State

```typescript
const state = strategy.getAnalysisState();
// Returns: { ema100, bb20, rsi4, candleCount, signal }
```

### State Recovery

Bij restart detecteert de strategy automatisch open positions en orders:

1. `recoverStateIfNeeded()` wordt aangeroepen bij `start()`
2. Haalt open orders + positions op via Deribit API
3. Reconstructeert bracket state indien nodig
4. Logt recovery status

### Risk Flow

Voor elke entry:
1. **Fresh balance ophalen** via `private/get_account_summary`
2. **Risk calculation** via `RiskEngine.calculatePosition()`
3. **Leverage cap** check (max 50x default)
4. **Amount validation** + rounding via `validateAndNormalizeAmount()`
5. **MinTradeAmount guard** - skip trade indien te klein
6. **Post-rounding verification** - expected loss ≤ target risk

### Events

De strategy emit de volgende events via `onEvent` callback:

- `STRATEGY_STARTED` - Strategy gestart
- `STRATEGY_STOPPED` - Strategy gestopt
- `SIGNAL` - Trading signal gedetecteerd
- `ENTRY_PLACED` - Entry order geplaatst
- `TP1_FILLED` - TP1 order filled
- `SL_MOVED_BE` - Stop loss moved to break-even
- `TRAIL_UPDATE` - Trailing stop updated
- `ALL_EXITED` - All positions exited
- `CANCELLED` - Orders cancelled
- `ERROR` - Error occurred

### Tests

#### Run Tests

```bash
npm test
```

#### Test Structure

```
src/tests/
├── risk/
│   └── percentSizing.spec.ts       # Risk engine sizing tests
├── bracket/
│   └── advancedBracket.spec.ts     # Bracket manager tests
├── recovery/
│   └── stateRecovery.spec.ts       # State recovery tests
└── guards/
    └── killswitch.spec.ts          # Circuit breaker tests
```

#### Test Coverage

1. **Risk Engine Integration**
   - Percent sizing met leverage cap
   - MinTradeAmount guard
   - Post-rounding validation

2. **AdvancedBracketManager**
   - Initial bracket placement (SL 100%, TP1 50%)
   - TP1 fill → SL amount 50% + SL price → BE
   - Trailing per method (swing/ema20/oppBB/rsiFlip)
   - Idempotente updates

3. **State Recovery**
   - Open positions detectie
   - Open orders reconstructie
   - Bracket state herstel

4. **Killswitch**
   - Daily max trades trigger
   - Daily max loss trigger
   - Automatic `cancelAll()` call

### Mechanical Ruleset

De strategy implementeert de volgende mechanische entry criteria:

#### Long Setup (Buy)

**Voorwaarden:**
1. **Trend Filter:** Prijs moet BOVEN EMA100 zijn (uptrend)
2. **Oversold Signal:** Prijs raakt of zakt onder onderste Bollinger Band
3. **Momentum:** RSI(4) < 20 (oversold)

**Entry Trigger (één van beiden):**
- RSI stijgt weer door 20 van onderen (RSI cross), OF
- Duidelijke bullish candle verschijnt (close > open)

**Exit Setup:**
- Stop Loss: Net onder swing low / BB lower (0.3% buffer)
- TP1 (50%): 1R distance (|entry - stop|)
- Runner (50%): Trailing volgens gekozen methode

#### Short Setup (Sell)

**Voorwaarden:**
1. **Trend Filter:** Prijs moet ONDER EMA100 zijn (downtrend)
2. **Overbought Signal:** Prijs raakt of stijgt boven bovenste Bollinger Band
3. **Momentum:** RSI(4) > 80 (overbought)

**Entry Trigger (één van beiden):**
- RSI zakt weer onder 80 (RSI cross), OF
- Duidelijke bearish candle verschijnt (close < open)

**Exit Setup:**
- Stop Loss: Net boven swing high / BB upper (0.3% buffer)
- TP1 (50%): 1R distance (|entry - stop|)
- Runner (50%): Trailing volgens gekozen methode

#### Exit Management

**TP1 @ 1R (50% positie):**
- Zodra prijs beweegt gelijk aan de afstand van de stop loss
- 50% van positie wordt gesloten
- Stop loss voor resterende 50% wordt naar break-even (entry prijs) verplaatst

**Trailing Runner (50% positie):**
- `swing`: Trail onder higher-lows (long) / boven lower-highs (short)
- `ema20`: Trail onder/boven EMA20 ± 1-2 ticks
- `oppBB`: Sluit bij opposite Bollinger Band (long sluit bij BB upper, short bij BB lower)
- `rsiFlip`: Sluit bij RSI flip naar tegengesteld oversold/overbought

**Implementatie:**
```typescript
private buildSignal(candles: Candle[]): Signal | null {
  // Valideer data beschikbaarheid
  if (!this.ema100 || !this.bb20.upper || !this.bb20.lower || this.rsi4 === undefined) {
    return null;
  }

  const lastCandle = candles[candles.length - 1];
  const lastPrice = lastCandle.c;

  // Long setup check
  if (lastPrice > this.ema100) {
    if (lastCandle.l <= this.bb20.lower && this.rsi4 < 20) {
      // Check voor RSI cross of bullish reversal candle
      // Return long signal met calculated entry/stop/tp prices
    }
  }

  // Short setup check
  if (lastPrice < this.ema100) {
    if (lastCandle.h >= this.bb20.upper && this.rsi4 > 80) {
      // Check voor RSI cross of bearish reversal candle
      // Return short signal met calculated entry/stop/tp prices
    }
  }

  return null;
}
```

### Store Integration

Registratie in `src/state/store.ts`:

```typescript
import { ThirdIterationStrategy, DEFAULT_THIRD_ITERATION_CONFIG } from '@/lib/strategies/thirdIterationStrategy';

// In startStrategy:
if (strategyId === 'third-iteration') {
  const newStrategy = new ThirdIterationStrategy(
    client,
    DEFAULT_THIRD_ITERATION_CONFIG,
    riskSettings,
    usdcBalance,
    callbacks
  );
  await newStrategy.start();
  set({ strategy: newStrategy, strategyStatus: 'analyzing', selectedStrategy: strategyId });
}
```

### UI Integration

De strategy kan geselecteerd worden via de strategy dropdown:
- ID: `"third-iteration"`
- Label: `"Third Iteration (50%@1R + BE + Trail)"`

Geen UI wijzigingen vereist - de bestaande UI ondersteunt de nieuwe strategy automatisch.

### Production Checklist

- [ ] Mechanical ruleset implemented in `buildSignal()`
- [ ] Tests groen (`npm test`)
- [ ] Strategy getest op testnet
- [ ] Risk settings gevalideerd
- [ ] Max daily trades/loss geconfigureerd
- [ ] Trailing method gekozen
- [ ] State recovery getest (restart tijdens trade)
- [ ] Error logging werkt
- [ ] Circuit breakers testen

### Troubleshooting

**Strategy start niet:**
- Check connection state (moet 'Active' zijn)
- Check balance beschikbaar
- Check logs voor errors

**Trades worden niet geplaatst:**
- Check `buildSignal()` implementatie
- Check risk calculation (minTradeAmount, leverage)
- Check daily limits niet bereikt

**Bracket orders falen:**
- Check Deribit API permissions
- Check order sizes (tick/lot rounding)
- Check reduce-only supported

**State recovery faalt:**
- Check open orders label/oco_ref
- Check position size matches orders
- Logs tonen recovery attempts

### Architectuur Diagrammen

```
┌─────────────────────────────────────────────────────────────┐
│                    ThirdIterationStrategy                    │
│                                                              │
│  ┌──────────────┐    ┌───────────────┐   ┌──────────────┐ │
│  │ Candle       │───▶│   Indicators  │──▶│   Signal     │ │
│  │ Monitoring   │    │   (EMA/BB/RSI)│   │   Builder    │ │
│  └──────────────┘    └───────────────┘   └──────┬───────┘ │
│                                                   │          │
│                                                   ▼          │
│  ┌──────────────┐    ┌───────────────┐   ┌──────────────┐ │
│  │   Entry      │◀───│  Risk Engine  │◀──│  Trade       │ │
│  │   Order      │    │               │   │  Decision    │ │
│  └──────┬───────┘    └───────────────┘   └──────────────┘ │
│         │                                                   │
│         ▼                                                   │
│  ┌───────────────────────────────────────────────────────┐ │
│  │          AdvancedBracketManager                        │ │
│  │                                                        │ │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌────────┐ │ │
│  │  │ Initial │─▶│   TP1   │─▶│  SL→BE   │─▶│ Trail  │ │ │
│  │  │ Bracket │  │   Fill  │  │  Move    │  │ Runner │ │ │
│  │  └─────────┘  └─────────┘  └──────────┘  └────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### API Reference

Zie inline JSDoc in source files voor gedetailleerde API documentatie.

### Support

Voor vragen of issues, raadpleeg de source code comments of open een issue in de repository.

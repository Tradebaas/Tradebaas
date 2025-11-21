# Risk Engine - Broker-Agnostic Position Sizing

## Overview

The Risk Engine is a generalized position sizing calculator that works with any broker's trading rules. It computes position quantities based on risk parameters while respecting broker-specific constraints like maximum leverage, tick size, lot size, and minimum trade amounts.

**Key Principle**: The risk engine ensures that the actual dollar amount at risk (when stop loss is hit) matches the configured risk percentage or fixed amount, regardless of leverage used.

## Core Concepts

### Position Sizing Formula

```
quantity = riskAmount / distance
```

Where:
- `riskAmount` = equity × (riskPercent / 100) for percent mode, or fixed USDC amount for fixed mode
- `distance` = |entryPrice - stopPrice|

**Example**:
- Balance: 100 USDC
- Risk Setting: 5% 
- Entry: 100,000 USDC
- Stop Loss: 96,000 USDC (determined by strategy analysis, not arbitrary)
- Distance: 4,000 USDC
- Risk Amount: 5 USDC (5% of 100)
- **Quantity: 5 / 4,000 = 0.00125 BTC = 125 USD notional**
- **Leverage: 125 / 100 = 1.25x**
- **If stop is hit: Loss = 0.00125 × 4,000 = 5 USDC ✓**

### Stop Loss Based on Strategy Logic

**IMPORTANT**: The stop loss level must be determined by the strategy's technical analysis, NOT by a fixed percentage. Each strategy calculates:

1. **Entry Price**: Based on signal conditions (e.g., RSI oversold, BB touch)
2. **Stop Loss**: Based on technical levels (e.g., recent swing low, BB lower band, support level)
3. **Take Profit**: Based on risk/reward ratio or technical targets

The risk engine then uses these strategy-determined levels to calculate the position size that matches your risk tolerance.

### Broker Rules

Every broker has unique trading constraints:

```typescript
interface BrokerRules {
  maxLeverage: number;      // Maximum leverage allowed (e.g., 50x, 100x, 125x)
  tickSize: number;         // Minimum price increment (e.g., 0.5, 0.01)
  lotSize: number;          // Quantity rounding increment (e.g., 10, 1, 0.001)
  minTradeAmount: number;   // Minimum position size (e.g., 10 USD, 0.001 BTC)
  contractSize: number;     // Contract size for rounding
}
```

### Leverage as a Tool, Not a Risk Multiplier

The risk engine uses leverage to achieve the desired position size while maintaining the exact risk amount. Higher leverage allows for larger positions with the same capital, but the actual risk (loss at stop) remains constant based on your risk settings.

**Example with 50x max leverage**:
- Balance: 100 USDC
- Risk: 5% = 5 USDC
- Entry: 100,000
- Stop: 99,500 (0.5% away, determined by strategy)
- Distance: 500
- Risk Amount: 5 USDC
- Quantity: 5 / 500 = 0.01 BTC = 1,000 USD notional
- **Leverage: 1,000 / 100 = 10x**
- **Loss at stop: 0.01 × 500 = 5 USDC ✓**

Without leverage, this trade would be impossible with only 100 USDC capital.

## API

### calculatePosition

Calculates optimal position size while respecting all broker rules.

```typescript
interface RiskEngineInput {
  equity: number;           // Account equity in USDC
  riskMode: 'percent' | 'fixed';
  riskValue: number;        // Percentage (0-50) or fixed USDC amount
  entryPrice: number;       // Intended entry price
  stopPrice: number;        // Stop loss price
  brokerRules: BrokerRules; // Broker-specific constraints
}

interface RiskEngineOutput {
  success: true;
  quantity: number;         // Rounded position size
  notional: number;         // Position value (quantity × entryPrice)
  effectiveLeverage: number; // Actual leverage (notional / equity)
  warnings: string[];       // Risk warnings (e.g., high leverage)
}

interface RiskEngineError {
  success: false;
  reason: string;           // Human-readable error message
  details?: Record<string, unknown>; // Debug information
}
```

### Example Usage

```typescript
import { calculatePosition, createBrokerRules } from '@/lib/riskEngine';

// Define broker rules (e.g., Binance)
const binanceRules = createBrokerRules(
  125,  // maxLeverage
  0.1,  // tickSize
  0.001, // lotSize
  10    // minTradeAmount
);

// Calculate position
const result = calculatePosition({
  equity: 10000,
  riskMode: 'percent',
  riskValue: 2,           // Risk 2% of equity
  entryPrice: 50000,
  stopPrice: 49500,       // $500 stop distance
  brokerRules: binanceRules,
});

if (result.success) {
  console.log(`Position size: ${result.quantity} BTC`);
  console.log(`Notional value: $${result.notional}`);
  console.log(`Leverage: ${result.effectiveLeverage.toFixed(2)}x`);
  console.log(`Warnings: ${result.warnings.join(', ')}`);
} else {
  console.error(`Error: ${result.reason}`);
}
```

## Broker-Specific Examples

### Deribit (BTC-PERPETUAL)

```typescript
const deribitRules = createBrokerRules(
  50,    // maxLeverage
  0.5,   // tickSize
  10,    // lotSize (USD)
  10     // minTradeAmount (USD)
);

const result = calculatePosition({
  equity: 5000,
  riskMode: 'percent',
  riskValue: 1,
  entryPrice: 50000,
  stopPrice: 49000,
  brokerRules: deribitRules,
});
// Result: quantity = 50 USD (rounded to lot size)
// Leverage: 0.5x (conservative)
```

### Binance (High Leverage)

```typescript
const binanceRules = createBrokerRules(
  125,   // maxLeverage (higher than Deribit)
  0.1,   // tickSize (finer granularity)
  0.001, // lotSize
  10     // minTradeAmount
);

const result = calculatePosition({
  equity: 1000,
  riskMode: 'percent',
  riskValue: 5,
  entryPrice: 100000,
  stopPrice: 99000,
  brokerRules: binanceRules,
});
// Result: leverageCapped at 125x if needed
// Warning: "Leverage begrensd tot 125x (broker limiet)"
```

### Kraken (Conservative)

```typescript
const krakenRules = createBrokerRules(
  5,     // maxLeverage (very conservative)
  0.5,   // tickSize
  0.001, // lotSize
  10     // minTradeAmount
);

const result = calculatePosition({
  equity: 10000,
  riskMode: 'percent',
  riskValue: 10,
  entryPrice: 50000,
  stopPrice: 48000,
  brokerRules: krakenRules,
});
// Result: leverage capped at 5x
// Warning: "Leverage begrensd tot 5x (broker limiet)"
```

## Risk Engine Logic Flow

1. **Validate Inputs**
   - Equity > 0
   - Entry price > 0
   - Stop price > 0
   - Risk value > 0
   - Min trade amount > 0
   - Stop price ≠ entry price

2. **Calculate Risk Amount**
   - Percent mode: `riskAmount = equity × (riskValue / 100)`
   - Fixed mode: `riskAmount = riskValue` (must be ≤ 50% of equity)

3. **Compute Raw Quantity**
   - `distance = |entryPrice - stopPrice|`
   - `quantity = riskAmount / distance`

4. **Apply Leverage Cap**
   - `notional = quantity × entryPrice`
   - `leverage = notional / equity`
   - If `leverage > maxLeverage`:
     - `quantity = (equity × maxLeverage) / entryPrice`
     - Add warning: "Leverage begrensd tot {maxLeverage}x (broker limiet)"

5. **Round to Lot Size**
   - `roundedQuantity = round(quantity / lotSize) × lotSize`

6. **Validate Minimum Trade Amount**
   - If `roundedQuantity < minTradeAmount`:
     - Return error: "Positiegrootte onder minimale trade hoeveelheid na afronding"

7. **Final Leverage Check**
   - `finalNotional = roundedQuantity × entryPrice`
   - `finalLeverage = finalNotional / equity`
   - If `finalLeverage > maxLeverage`:
     - Return error: "Positie overschrijdt maximale leverage na afronding"

8. **Generate Warnings**
   - Low leverage: `finalLeverage < 1` with `riskPercent > 5%`
   - High leverage: `finalLeverage > 10x`

9. **Return Success**
   - quantity (rounded)
   - notional
   - effectiveLeverage
   - warnings[]

## Helper Functions

### instrumentMetaToBrokerRules

Converts legacy InstrumentMeta format to BrokerRules:

```typescript
const instrument = await client.getInstrument('BTC-PERPETUAL');

const brokerRules = instrumentMetaToBrokerRules({
  tick_size: instrument.tick_size,
  min_trade_amount: instrument.min_trade_amount,
  max_leverage: instrument.max_leverage,
});
```

### createBrokerRules

Factory function for explicit broker rule creation:

```typescript
const rules = createBrokerRules(
  maxLeverage,
  tickSize,
  lotSize,
  minTradeAmount
);
```

### buildBracket

Calculates stop loss and take profit prices with proper tick rounding:

```typescript
const bracket = buildBracket(
  'buy',           // orderSide
  50000,          // entryPrice
  49000,          // stopPrice
  2,              // riskRewardRatio (2:1)
  0.5             // tickSize
);

console.log(bracket.stopLoss);    // 49000 (rounded)
console.log(bracket.takeProfit);  // 52000 (rounded, 2× distance)
```

## Error Handling

All errors return a descriptive reason with debug details:

```typescript
{
  success: false,
  reason: "Positiegrootte onder minimale trade hoeveelheid na afronding",
  details: {
    calculatedQuantity: 8.5,
    roundedQuantity: 0,
    minTradeAmount: 10,
    brokerRules: { ... }
  }
}
```

Common errors:
- ❌ "Equity moet groter zijn dan nul"
- ❌ "Entry prijs moet groter zijn dan nul"
- ❌ "Stop prijs moet groter zijn dan nul"
- ❌ "Risico waarde moet groter zijn dan nul"
- ❌ "Minimale trade hoeveelheid moet groter zijn dan nul"
- ❌ "Stop prijs kan niet gelijk zijn aan entry prijs"
- ❌ "Risico percentage moet tussen 0 en 50 liggen"
- ❌ "Vast risico bedrag mag niet meer zijn dan 50% van equity"
- ❌ "Positiegrootte onder minimale trade hoeveelheid na afronding"
- ❌ "Positie overschrijdt maximale leverage na afronding"

## Warnings

Non-fatal warnings that indicate potential issues:

```typescript
{
  success: true,
  quantity: 1250,
  notional: 62500,
  effectiveLeverage: 12.5,
  warnings: [
    "Leverage begrensd tot 50x (broker limiet)",
    "Hoge leverage gedetecteerd: 12.5x"
  ]
}
```

## Integration Examples

### With Deribit Client

```typescript
import { useTradingStore } from '@/state/store';
import { calculatePosition, instrumentMetaToBrokerRules } from '@/lib/riskEngine';

const { client, usdcBalance, riskSettings } = useTradingStore();

const instrument = await client.getInstrument('BTC_USDC-PERPETUAL');
const ticker = await client.getTicker('BTC_USDC-PERPETUAL');

const brokerRules = instrumentMetaToBrokerRules({
  tick_size: instrument.tick_size,
  min_trade_amount: instrument.min_trade_amount,
  max_leverage: instrument.max_leverage,
});

const result = calculatePosition({
  equity: usdcBalance,
  riskMode: riskSettings.mode,
  riskValue: riskSettings.value,
  entryPrice: ticker.mark_price,
  stopPrice: ticker.mark_price * 0.99,
  brokerRules,
});
```

### With Strategy

```typescript
import { ScalpingStrategy } from '@/lib/strategies/scalpingStrategy';
import { calculatePosition } from '@/lib/riskEngine';

const strategy = new ScalpingStrategy(client, config, equity, riskSettings);

// Inside strategy signal handler
const instrument = await this.client.getInstrument(signal.instrument);

const riskCalc = calculatePosition({
  equity: this.equity,
  riskMode: this.riskSettings.mode,
  riskValue: this.riskSettings.value,
  entryPrice: signal.entryPrice,
  stopPrice: signal.stopLoss,
  brokerRules: {
    tickSize: instrument.tick_size,
    lotSize: instrument.min_trade_amount,
    minTradeAmount: instrument.min_trade_amount,
    maxLeverage: instrument.max_leverage,
  },
});

if (riskCalc.success) {
  await client.placeBuyOrder(
    signal.instrument,
    riskCalc.quantity,
    signal.entryPrice,
    'limit'
  );
}
```

## Testing

The Risk Engine includes comprehensive unit tests covering:

- ✅ Percent risk mode calculations
- ✅ Fixed risk mode calculations
- ✅ Broker leverage cap enforcement
- ✅ Tick size rounding
- ✅ Lot size rounding
- ✅ Minimum trade amount validation
- ✅ Extreme distance scenarios
- ✅ Input validation
- ✅ Warning generation
- ✅ Multi-broker compatibility

Run tests:
```bash
npm test -- riskEngine.test.ts
```

## Acceptance Criteria

✅ **Broker-Agnostic**: Works with any broker by passing different BrokerRules
✅ **Leverage Capping**: Respects broker maxLeverage limits
✅ **Tick/Lot Rounding**: Properly rounds prices and quantities per broker rules
✅ **Minimum Trade Size**: Rejects positions below broker minimums
✅ **Warning System**: Returns non-fatal warnings for risk awareness
✅ **Identical Results**: Same risk parameters + broker rules = same position size
✅ **Backward Compatible**: InstrumentMeta can be converted to BrokerRules

## Broker Comparison Table

| Broker      | Max Leverage | Typical Tick | Typical Lot | Min Trade  |
|-------------|--------------|--------------|-------------|------------|
| Deribit     | 50x          | 0.5          | 10 USD      | 10 USD     |
| Binance     | 125x         | 0.1          | 0.001 BTC   | 10 USDT    |
| Bybit       | 100x         | 0.5          | 0.001 BTC   | 10 USDT    |
| OKX         | 125x         | 0.1          | 0.001 BTC   | 10 USDT    |
| Kraken      | 5x           | 0.5          | 0.001 BTC   | 10 USD     |
| BitMEX      | 100x         | 0.5          | 1 USD       | 1 USD      |
| MEXC        | 200x         | 0.01         | 0.001 BTC   | 10 USDT    |
| Coinbase    | 5x           | 0.01         | 0.001 BTC   | 10 USD     |

## Future Enhancements

- [ ] Multi-asset position sizing (BTC, ETH, SOL simultaneously)
- [ ] Portfolio-level risk aggregation
- [ ] Dynamic leverage adjustment based on market conditions
- [ ] Risk limit presets (conservative, moderate, aggressive)
- [ ] Historical risk analysis and reporting
- [ ] Cross-margin vs isolated margin calculations
- [ ] Funding rate considerations
- [ ] Liquidation price calculator integration

---

## Recent Fixes (December 2024)

### Issue: Razor Strategy Position Sizing Bug

**Problem**: The Razor strategy was calculating position sizes using a simplified formula that didn't account for leverage limits, resulting in oversized positions.

**Root Cause**: The strategy used `riskAmount / stopDistance` directly without calling the `calculatePosition` risk engine function, which meant:
- No leverage cap enforcement
- No contract size rounding validation
- No broker rule compliance checks

**Fix Applied**: Updated `razorStrategy.ts` to use `calculatePosition()` function properly:

```typescript
// ❌ OLD (Incorrect)
const riskAmount = equity * (riskPercent / 100);
const stopDistance = Math.abs(entryPrice - stopPrice);
const rawQuantity = riskAmount / stopDistance;
const normalizedQty = roundToMultiple(rawQuantity, contractSize);

// ✅ NEW (Correct)
const positionResult = calculatePosition({
  equity: freshEquity,
  riskMode: riskSettings.mode,
  riskValue: riskSettings.value,
  entryPrice: signal.entryPrice,
  stopPrice: signal.stopPrice,  // From strategy analysis
  brokerRules: {
    tickSize: instrument.tick_size,
    lotSize: instrument.contract_size,
    minTradeAmount: instrument.min_trade_amount,
    maxLeverage: instrument.max_leverage || 50,
    contractSize: instrument.contract_size,
  },
});
```

**Verification**: All other strategies (Scalping, Vortex, FastTest) were already using the risk engine correctly.

**Result**: 
- Position sizes now correctly match risk percentage settings
- Leverage is properly capped at broker limits (50x for Deribit)
- Stop loss levels are based on strategy technical analysis
- Actual loss at stop equals configured risk amount

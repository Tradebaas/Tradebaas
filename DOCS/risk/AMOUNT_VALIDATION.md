# Amount Validation & Contract Size Compliance

## Problem Statement

Deribit's API requires that all order amounts be exact multiples of the instrument's contract size. The error encountered was:

```json
{
  "errorCode": "-32602",
  "data": {
    "reason": "must be a multiple of contract size",
    "param": "amount"
  }
}
```

This occurred because floating-point arithmetic can introduce tiny rounding errors that violate Deribit's strict validation rules.

## Solution Architecture

We implemented a **multi-layered validation system** that ensures amounts are always valid multiples of contract sizes before reaching the Deribit API.

### Layer 1: Utility Functions (`src/lib/utils.ts`)

**Core Functions:**

1. **`roundToMultiple(value: number, multiple: number): number`**
   - Uses integer-based scaling to avoid floating-point errors
   - Converts both values to integers by multiplying by appropriate power of 10
   - Performs floor division to get exact number of contracts
   - Returns properly formatted result

2. **`isValidMultiple(value: number, multiple: number): boolean`**
   - Validates if a value is an exact multiple of another
   - Uses same integer-scaling approach for accuracy
   - Tolerates minimal floating-point precision errors

3. **`validateAndNormalizeAmount(...): { valid: boolean; amount: number; error?: string }`**
   - **One-stop validation function** for all strategies
   - Checks: amount > 0, contract size > 0, amount >= min trade amount
   - Automatically rounds to valid multiple
   - Returns detailed error messages and context
   - **This is the primary function strategies should use**

### Layer 2: Strategy Validation (`src/lib/strategies/`)

Both `fastTestStrategy.ts` and `scalpingStrategy.ts` now follow the same pattern:

```typescript
// After risk calculation
const validation = validateAndNormalizeAmount(
  riskCalc.quantity,
  instrument.contract_size,
  instrument.min_trade_amount
);

if (!validation.valid) {
  // Log comprehensive error with context
  this.onError?.({
    errorType: 'INVALID_AMOUNT',
    message: validation.error,
    context: {
      calculatedAmount: riskCalc.quantity,
      normalizedAmount: validation.amount,
      validationDetails: validation.details,
    },
  });
  return; // Abort trade
}

const amount = validation.amount; // Use validated amount
```

**Benefits:**
- Consistent validation across all strategies
- Early detection of invalid amounts
- Detailed error logging for debugging
- Prevents API calls with invalid data

### Layer 3: API Client Validation (`src/lib/deribitClient.ts`)

Added pre-flight validation in both `placeBuyOrder` and `placeSellOrder`:

```typescript
const instrument = await this.getInstrument(instrumentName);
if (instrument) {
  const contractSize = instrument.contract_size;
  const minAmount = instrument.min_trade_amount;
  
  // Validate amount > 0
  // Validate amount >= minAmount
  // Validate amount is exact multiple using integer scaling
  
  if (validation fails) {
    throw this.normalizeError(
      new Error('Detailed validation error'),
      -32602 // Same error code as Deribit
    );
  }
}
```

**Benefits:**
- Last line of defense before API call
- Catches any validation bugs in upstream code
- Provides consistent error format (matches Deribit errors)
- Skip validation for `reduceOnly` orders (they close existing positions)

## How It Works: Integer Scaling

The core technique eliminates floating-point errors:

```typescript
// Example: amount = 10.5, contractSize = 0.1
const decimalPlaces = Math.max(1, 1) // = 1
const scaleFactor = Math.pow(10, 1) // = 10

const scaledAmount = Math.round(10.5 * 10) // = 105
const scaledContractSize = Math.round(0.1 * 10) // = 1

// Check if multiple using integer arithmetic (no floating point!)
const remainder = 105 % 1 // = 0 ✓ Valid

// Calculate contracts
const contracts = Math.floor(105 / 1) // = 105

// Convert back
const result = 105 / 10 // = 10.5
```

This approach:
- ✅ Eliminates floating-point precision issues
- ✅ Works with any decimal precision
- ✅ Produces exact results Deribit accepts
- ✅ Fast and efficient

## Usage in New Strategies

When creating a new strategy, follow this pattern:

```typescript
import { validateAndNormalizeAmount } from '@/lib/utils';

// 1. Get instrument data
const instrument = await this.client.getInstrument(instrumentName);

// 2. Calculate position size with risk engine
const riskCalc = calculatePosition({ /* ... */ });

if (!riskCalc.success) {
  // Handle risk calculation error
  return;
}

// 3. Validate and normalize amount
const validation = validateAndNormalizeAmount(
  riskCalc.quantity,
  instrument.contract_size,
  instrument.min_trade_amount
);

if (!validation.valid) {
  // Log error with validation.error and validation.details
  this.onError?.({
    errorType: 'INVALID_AMOUNT',
    message: validation.error,
    context: {
      calculatedAmount: riskCalc.quantity,
      normalizedAmount: validation.amount,
      contractSize: instrument.contract_size,
      minTradeAmount: instrument.min_trade_amount,
      validationDetails: validation.details,
    },
  });
  return;
}

// 4. Use validated amount
const amount = validation.amount;

// 5. Place order - will pass final API client validation
await this.client.placeBuyOrder(instrumentName, amount, /* ... */);
```

## Testing & Verification

To verify the fix works:

1. **Unit Tests**: The validation functions handle edge cases:
   - Very small contract sizes (0.0001)
   - Large amounts with small contract sizes
   - Amounts that round down below minimum
   - Zero and negative values

2. **Integration Test**: Run the Fast Test Strategy with 0.5% risk
   - Should calculate amount based on equity and risk
   - Should validate and normalize the amount
   - Should successfully place orders without -32602 errors

3. **Error Logging**: If validation fails:
   - Check `strategyErrorLogs` in the app
   - Review `calculatedAmount` vs `normalizedAmount`
   - Verify `validationDetails` for specific failure reason

## Troubleshooting

If you still encounter amount validation errors:

1. **Check the error log context**:
   - `calculatedAmount`: What the risk engine calculated
   - `normalizedAmount`: What we tried to normalize to
   - `contractSize`: The instrument's contract size
   - `minTradeAmount`: The minimum allowed amount

2. **Common issues**:
   - Risk too small → normalized amount < minTradeAmount
   - Contract size too large → can't afford even 1 contract
   - Instrument data stale → refresh instrument cache

3. **Debug logging**: All strategies log:
   ```
   [Strategy] Risk engine calculated quantity: X
   [Strategy] Amount validation passed: { calculatedAmount, normalizedAmount, ... }
   [Strategy] Placing order: { amount, contractSize, ... }
   ```

## Benefits of This Approach

1. **Robust**: Multiple validation layers catch errors early
2. **Scalable**: Same validation logic works for all strategies
3. **Debuggable**: Comprehensive error logging with context
4. **Fast**: Integer arithmetic is faster than floating-point
5. **Accurate**: Eliminates floating-point precision issues
6. **Maintainable**: Single source of truth in `utils.ts`
7. **Safe**: API client does final validation as safety net

## Summary

This implementation provides a production-ready, scalable solution for amount validation that:
- ✅ Fixes the immediate -32602 error
- ✅ Works for all current strategies (Fast Test, Scalping)
- ✅ Provides clear pattern for future strategies
- ✅ Includes comprehensive error reporting
- ✅ Has multiple safety layers
- ✅ Uses precise integer-based mathematics

The solution is **robust**, **scalable**, and **maintainable** for the long term.

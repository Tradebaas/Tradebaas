# OTOCO Order Fix - Deribit API

## Problem
The application was throwing error `-32602 "Invalid params"` with the message: **"different orders directions are required"** when placing test orders with stop loss and take profit brackets.

## Root Cause
The OTOCO (One-Triggers-One-Cancels-Other) configuration was incorrectly including `amount` and `direction` fields for each bracket order. According to Deribit's API:

1. **OTOCO orders automatically inherit the parent order's amount and opposite direction**
2. When `reduce_only: true` is set, the API automatically determines the correct closing direction
3. Including explicit `direction` fields caused both orders to have the same direction, violating OTOCO requirements

## The Fix

### 1. Updated OTOCOOrder Interface (`deribitClient.ts`)
**Before:**
```typescript
export interface OTOCOOrder {
  type: string;
  amount?: number;        // ❌ Not needed - inherited from parent
  direction?: string;     // ❌ Not needed - auto-determined
  trigger?: string;
  trigger_price?: number;
  price?: number;
  reduce_only?: boolean;
}
```

**After:**
```typescript
export interface OTOCOOrder {
  type: string;           // ✅ Required: 'stop_market' or 'stop_limit'
  trigger?: string;       // ✅ Required: 'mark_price' or 'last_price'
  trigger_price?: number; // ✅ Required: price that triggers the order
  price?: number;         // ✅ Optional: limit price for stop_limit orders
  reduce_only?: boolean;  // ✅ Required: true for exit orders
}
```

### 2. Updated Order Placement Logic (`deribitClient.ts`)
Removed the code that was adding `amount` and `direction` to the OTOCO config mapping in both `placeBuyOrder` and `placeSellOrder` methods.

**Before:**
```typescript
params.otoco_config = otocoConfig.map(order => {
  const config: Record<string, unknown> = {
    type: order.type,
  };
  
  if (order.amount !== undefined) {      // ❌ Removed
    config.amount = order.amount;
  }
  
  if (order.direction !== undefined) {   // ❌ Removed
    config.direction = order.direction;
  }
  
  // ... other fields
});
```

**After:**
```typescript
params.otoco_config = otocoConfig.map(order => {
  const config: Record<string, unknown> = {
    type: order.type,                    // ✅ Order type
  };
  
  if (order.price !== undefined) {       // ✅ Limit price
    config.price = order.price;
  }
  
  if (order.trigger_price !== undefined) { // ✅ Trigger price
    config.trigger_price = order.trigger_price;
  }
  
  if (order.trigger) {                   // ✅ Trigger type
    config.trigger = order.trigger;
  }

  if (order.reduce_only !== undefined) { // ✅ Reduce only flag
    config.reduce_only = order.reduce_only;
  }
  
  return config;
});
```

### 3. Updated Broker Implementation (`DeribitBroker.ts`)
Simplified the OTOCO config type definitions to match the corrected interface, removing `amount` and `direction` fields.

## How OTOCO Works (Deribit)

When you place a buy order with OTOCO brackets:
1. **Parent Order**: `private/buy` with `amount: X`, `type: 'market'`
2. **OTOCO Config**: Array of 2 bracket orders
   - **Take Profit**: `{ type: 'stop_limit', trigger_price: TP, price: TP, trigger: 'mark_price', reduce_only: true }`
   - **Stop Loss**: `{ type: 'stop_market', trigger_price: SL, trigger: 'mark_price', reduce_only: true }`

The API automatically:
- Inherits `amount: X` from the parent order for both brackets
- Determines direction as 'sell' (opposite of 'buy') because `reduce_only: true`
- Creates two opposing orders that cancel each other when one triggers

## Testing
To verify the fix:
1. Connect to Deribit (testnet or live)
2. Click "Test trade" button
3. The order should now place successfully with both stop loss and take profit
4. No `-32602` error should occur

## Key Takeaways
- ✅ **Always set `reduce_only: true`** for exit orders
- ✅ **Never specify `direction`** in OTOCO config - it's auto-determined
- ✅ **Never specify `amount`** in OTOCO config - it's inherited from parent
- ✅ **Always specify `trigger`** ('mark_price' is recommended)
- ✅ **Always specify `trigger_price`** for the activation level
- ✅ **Use `stop_market`** for guaranteed exits (stop loss)
- ✅ **Use `stop_limit`** for specific exit prices (take profit)

## References
- Deribit API: `private/buy` - https://docs.deribit.com/#private-buy
- Deribit API: `private/sell` - https://docs.deribit.com/#private-sell
- Advanced Orders: https://docs.deribit.com/#advanced-orders

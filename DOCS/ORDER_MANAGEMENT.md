# Order Management - Complete Technical Reference

**Last Updated**: 2024-11-08  
**Status**: Production Ready  
**Primary Broker**: Deribit (Live & Testnet)

---

## Table of Contents

1. [Overview](#overview)
2. [OTOCO Orders (Recommended)](#otoco-orders-recommended)
3. [Order Types](#order-types)
4. [Bracket Order Management](#bracket-order-management)
5. [Position Monitoring](#position-monitoring)
6. [Risk Engine Integration](#risk-engine-integration)
7. [API Reference](#api-reference)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Tradebaas implements sophisticated order management with the following features:

- ✅ **OTOCO Brackets**: One-Triggers-OCO for atomic SL/TP placement
- ✅ **Position-Based Cleanup**: Monitors positions for automatic order cleanup
- ✅ **Risk Engine**: Calculates position size based on risk parameters
- ✅ **Idempotent Updates**: Prevents duplicate order modifications
- ✅ **State Recovery**: Reconstructs orders after restart
- ✅ **Race Condition Protection**: Server-side order linking

---

## OTOCO Orders (Recommended)

### What is OTOCO?

**OTOCO** = **One-Triggers-One-Cancels-Other**

Official Deribit order type that atomically creates:
1. Entry order
2. Stop Loss order (triggered when entry fills)
3. Take Profit order (triggered when entry fills)
4. OCO relationship between SL and TP (automatic cleanup)

### Why OTOCO?

✅ **Atomic**: Entry + SL + TP in ONE API call  
✅ **Race-Proof**: No gap between entry and protection orders  
✅ **Server-Side**: Protection persists through disconnects  
✅ **Auto-Cleanup**: When SL fills, TP auto-cancels (and vice versa)  
✅ **No Manual Linking**: Deribit handles OCO relationship

### OTOCO Structure

```typescript
const order = await client.placeBuyOrder(
  instrumentName,           // e.g., 'BTC_USDC-PERPETUAL'
  amount,                   // Position size in USD
  undefined,                // Price (undefined = market)
  'market',                 // Order type
  'trade_label',            // Unique label for this trade
  false,                    // reduce_only (false for entry)
  {
    // OTOCO configuration
    linked_order_type: 'one_triggers_one_cancels_other',
    trigger_fill_condition: 'first_hit', // Any execution triggers secondary orders
    
    otoco_config: [
      // Stop Loss order
      {
        direction: 'sell',
        amount: amount,
        type: 'stop_market',
        trigger_price: stopLossPrice,
        trigger: 'mark_price',
        reduce_only: true,
        label: 'trade_label_sl'
      },
      
      // Take Profit order
      {
        direction: 'sell',
        amount: amount,
        type: 'limit',
        price: takeProfitPrice,
        reduce_only: true,
        label: 'trade_label_tp'
      }
    ]
  }
);
```

### OTOCO Response

```json
{
  "order": {
    "order_id": "entry_order_123",
    "instrument_name": "BTC_USDC-PERPETUAL",
    "direction": "buy",
    "amount": 100,
    "order_type": "market",
    "order_state": "filled",
    "average_price": 45000,
    "label": "trade_label"
  },
  "trades": [
    {
      "trade_id": "trade_456",
      "amount": 100,
      "price": 45000
    }
  ]
}
```

After entry fills, Deribit automatically creates:
- SL order with `order_id`: "sl_order_789"
- TP order with `order_id`: "tp_order_101"
- OCO link between SL and TP

### OTOCO Implementation

**Backend** (`backend/src/strategy-service.ts`):

```typescript
async placeTestOrder(params?: {
  instrument?: string;
  amount?: number;
  stopLoss?: number;
  takeProfit?: number;
  label?: string;
}): Promise<{
  success: boolean;
  orderId?: string;
  instrumentName?: string;
  entryPrice?: number;
  amount?: number;
  stopLoss?: number;
  takeProfit?: number;
  error?: string;
}> {
  if (!this.client || !this.client.isConnected()) {
    return { success: false, error: 'Not connected to broker' };
  }

  try {
    const instrumentName = params?.instrument || 'BTC_USDC-PERPETUAL';
    
    // Get instrument details
    const instrument = await this.client.getInstrument(instrumentName);
    if (!instrument) {
      return { success: false, error: `Instrument ${instrumentName} not found` };
    }

    // Get current market price
    const ticker = await this.client.getTicker(instrumentName);
    if (!ticker) {
      return { success: false, error: 'Failed to get market ticker' };
    }

    const markPrice = ticker.mark_price;
    const tickSize = instrument.tick_size;
    const minTradeAmount = params?.amount || instrument.min_trade_amount;
    
    // Calculate SL/TP prices
    const stopLossPrice = params?.stopLoss || 
      Math.round((markPrice * 0.90) / tickSize) * tickSize;
    const takeProfitPrice = params?.takeProfit || 
      Math.round((markPrice * 1.0005) / tickSize) * tickSize;
    
    const label = params?.label || `tb_micro_test_sl_tp`;
    
    console.log('[StrategyService] Placing OTOCO order:', {
      instrumentName,
      amountUSD: minTradeAmount,
      markPrice,
      stopLossPrice,
      takeProfitPrice,
      label,
    });

    // Place OTOCO order
    const entryOrder = await this.client.placeBuyOrder(
      instrumentName,
      minTradeAmount,
      undefined, // market price
      'market',
      label,
      false, // reduce_only = false for entry
      {
        linked_order_type: 'one_triggers_one_cancels_other',
        trigger_fill_condition: 'first_hit',
        otoco_config: [
          {
            direction: 'sell',
            amount: minTradeAmount,
            type: 'stop_market',
            trigger_price: stopLossPrice,
            trigger: 'mark_price',
            reduce_only: true,
            label: `${label}_sl`
          },
          {
            direction: 'sell',
            amount: minTradeAmount,
            type: 'limit',
            price: takeProfitPrice,
            reduce_only: true,
            label: `${label}_tp`
          }
        ]
      }
    );

    console.log('[StrategyService] OTOCO entry order placed:', 
      JSON.stringify(entryOrder, null, 2));

    const orderId = entryOrder?.order?.order_id || 
                    entryOrder?.order_id || 
                    entryOrder?.trades?.[0]?.order_id;
    
    if (!orderId) {
      return { success: false, error: 'Entry order failed - no order ID returned' };
    }

    console.log('[StrategyService] ✅ OTOCO order placed successfully!');

    return {
      success: true,
      orderId: orderId,
      instrumentName,
      entryPrice: markPrice,
      amount: minTradeAmount,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
    };
  } catch (error: any) {
    console.error('[StrategyService] Test order failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to place test order',
    };
  }
}
```

---

## Order Types

### Market Orders

Immediate execution at best available price.

```typescript
const order = await client.placeBuyOrder(
  'BTC_USDC-PERPETUAL',
  100,           // amount in USD
  undefined,     // no price (market)
  'market',
  'trade_label'
);
```

**Use Cases**:
- Entry orders when speed is critical
- Stop Loss orders (stop_market type)
- Closing positions immediately

---

### Limit Orders

Execute only at specified price or better.

```typescript
const order = await client.placeBuyOrder(
  'BTC_USDC-PERPETUAL',
  100,
  45000,         // limit price
  'limit',
  'trade_label'
);
```

**Use Cases**:
- Take Profit orders
- Entry orders when exact price matters
- Range trading

---

### Stop Market Orders

Trigger at stop price, execute as market order.

```typescript
const order = await client.placeSellOrder(
  'BTC_USDC-PERPETUAL',
  100,
  44500,         // stop price
  'stop_market',
  'trade_label_sl',
  true           // reduce_only
);
```

**Parameters**:
- `trigger`: 'mark_price' (recommended) or 'last_price'
- `trigger_price`: Price at which order triggers
- `reduce_only`: true (prevents flipping position)

**Use Cases**:
- Stop Loss orders
- Breakout entries

---

### Stop Limit Orders

Trigger at stop price, execute as limit order.

```typescript
const order = await client.placeSellOrder(
  'BTC_USDC-PERPETUAL',
  100,
  44500,         // trigger price
  'stop_limit',
  'trade_label',
  true,
  {
    price: 44450 // limit price after trigger
  }
);
```

**Use Cases**:
- Stop Loss with price protection
- Advanced entry strategies

---

## Bracket Order Management

### AdvancedBracketManager

Legacy implementation for complex bracket management (NOT needed with OTOCO).

**Features**:
- Initial bracket: Entry + SL (100%) + TP1 (50%)
- TP1 detection via partial fill
- SL adjustment: Amount → 50%, Price → BE
- Trailing methods: Swing, EMA20, oppBB, RSI flip
- Idempotent updates
- State recovery

**Use Cases**:
- Advanced trailing strategies
- Partial profit taking
- Complex exit logic

**NOT Recommended For**:
- Simple SL/TP (use OTOCO instead)
- Standard bracket orders (OTOCO is simpler)

---

## Position Monitoring

### Position-Based Cleanup

Monitors position size and automatically cancels remaining SL/TP orders when position closes.

**Why Needed?**:
- OTOCO handles OCO cleanup automatically
- Fallback for manual orders or edge cases
- Detects position closed by external actions

**Implementation** (`backend/src/strategy-service.ts`):

```typescript
private async monitorPositionBasedCleanup(
  instrumentName: string,
  stopLossOrderId: string,
  takeProfitOrderId: string,
  originalAmount: number
): Promise<void> {
  if (!this.client) return;

  console.log(`[StrategyService] 🔄 Starting POSITION-based monitoring for ${instrumentName}`);
  console.log(`[StrategyService] 📊 Monitoring SL: ${stopLossOrderId}, TP: ${takeProfitOrderId}`);
  console.log(`[StrategyService] 💰 Original position amount: ${originalAmount}`);

  let checkCount = 0;
  const maxChecks = 30; // 60 seconds max monitoring
  
  const monitoringInterval = setInterval(async () => {
    checkCount++;
    
    try {
      if (!this.client) {
        console.log('[StrategyService] ❌ Client disconnected, stopping monitoring');
        clearInterval(monitoringInterval);
        return;
      }

      // 1. Check current position
      const positions = await this.client.getPositions('USDC');
      const currentPosition = positions.find((p: any) => 
        p.instrument_name === instrumentName
      );
      const positionSize = currentPosition ? Math.abs(currentPosition.size) : 0;
      
      // 2. Check if orders still exist
      const openOrders = await this.client.getOpenOrders(instrumentName);
      const slOrder = openOrders.find(o => o.order_id === stopLossOrderId);
      const tpOrder = openOrders.find(o => o.order_id === takeProfitOrderId);
      
      console.log(`[StrategyService] 📈 Check ${checkCount}: Position=${positionSize}, SL=${!!slOrder}, TP=${!!tpOrder}`);
      
      // 3. If position is closed or significantly reduced, clean up
      if (positionSize === 0 || positionSize < originalAmount * 0.1) {
        console.log('[StrategyService] 🎯 Position closed/reduced - cleaning up remaining orders...');
        
        const cleanupPromises = [];
        
        if (slOrder) {
          console.log('[StrategyService] 🧹 Cancelling stop loss order...');
          cleanupPromises.push(
            this.client.cancelOrder(stopLossOrderId).catch(e => 
              console.log('[StrategyService] ⚠️ SL cancel failed (already closed):', e.message)
            )
          );
        }
        
        if (tpOrder) {
          console.log('[StrategyService] 🧹 Cancelling take profit order...');
          cleanupPromises.push(
            this.client.cancelOrder(takeProfitOrderId).catch(e => 
              console.log('[StrategyService] ⚠️ TP cancel failed (already closed):', e.message)
            )
          );
        }
        
        await Promise.all(cleanupPromises);
        console.log('[StrategyService] ✅ Cleanup completed successfully!');
        clearInterval(monitoringInterval);
        return;
      }
      
      // 4. Check if one order was hit and clean up the other
      if (!slOrder && tpOrder) {
        console.log('[StrategyService] 🎯 Stop loss was hit, cleaning up take profit...');
        await this.client.cancelOrder(takeProfitOrderId).catch(e => 
          console.log('[StrategyService] ⚠️ TP cleanup failed:', e.message)
        );
        console.log('[StrategyService] ✅ Take profit cleaned up!');
        clearInterval(monitoringInterval);
      } else if (slOrder && !tpOrder) {
        console.log('[StrategyService] 🎯 Take profit was hit, cleaning up stop loss...');
        await this.client.cancelOrder(stopLossOrderId).catch(e => 
          console.log('[StrategyService] ⚠️ SL cleanup failed:', e.message)
        );
        console.log('[StrategyService] ✅ Stop loss cleaned up!');
        clearInterval(monitoringInterval);
      }
      
      // 5. Timeout protection
      if (checkCount >= maxChecks) {
        console.log('[StrategyService] ⏱️ Max monitoring time reached, force cleanup...');
        await this.client.cancelAllByInstrument(instrumentName).catch(e => 
          console.log('[StrategyService] ⚠️ Force cleanup failed:', e.message)
        );
        clearInterval(monitoringInterval);
      }
      
    } catch (error) {
      console.error('[StrategyService] ❌ Error in position monitoring:', error);
      // Continue monitoring even on errors
    }
  }, 2000); // Check every 2 seconds
}
```

**Usage**:
```typescript
// After placing OTOCO order (as fallback)
await this.monitorPositionBasedCleanup(
  'BTC_USDC-PERPETUAL',
  stopLossOrderId,
  takeProfitOrderId,
  originalAmount
);
```

---

## Risk Engine Integration

### calculatePosition()

Calculates position size based on risk parameters and broker rules.

**Input**:
```typescript
interface RiskEngineInput {
  equity: number;              // Account equity in USD
  riskMode: 'percent' | 'fixed';
  riskValue: number;           // % of equity (1.0 = 1%) or fixed USD amount
  entryPrice: number;
  stopPrice: number;
  brokerRules: BrokerRules;
}

interface BrokerRules {
  maxLeverage: number;         // 50x (Deribit), 125x (others)
  tickSize: number;            // Price increment (0.5 for BTC_USDC)
  lotSize: number;             // Quantity increment (10 for BTC_USDC)
  minTradeAmount: number;      // Minimum position size (1 USD)
}
```

**Output**:
```typescript
interface RiskEngineOutput {
  success: boolean;
  quantity?: number;           // Position size in USD
  notional?: number;           // Position value
  effectiveLeverage?: number;  // Actual leverage used
  warnings?: string[];
  reason?: string;             // Error message if failed
}
```

**Example**:
```typescript
const result = calculatePosition({
  equity: 10000,               // $10,000 account
  riskMode: 'percent',
  riskValue: 1.0,              // Risk 1% = $100
  entryPrice: 45000,
  stopPrice: 44500,            // $500 away
  brokerRules: {
    maxLeverage: 50,
    tickSize: 0.5,
    lotSize: 10,
    minTradeAmount: 1
  }
});

// Result:
{
  success: true,
  quantity: 200,               // $200 position size
  notional: 200,
  effectiveLeverage: 0.02,     // Very low leverage
  warnings: []
}
```

**Integration with Orders**:
```typescript
// 1. Calculate position size
const riskResult = calculatePosition({
  equity: accountBalance,
  riskMode: 'percent',
  riskValue: 1.0,
  entryPrice: ticker.mark_price,
  stopPrice: stopLossPrice,
  brokerRules: deribitRules
});

if (!riskResult.success) {
  throw new Error(riskResult.reason);
}

// 2. Place OTOCO order with calculated size
const order = await client.placeBuyOrder(
  instrument,
  riskResult.quantity, // ← Risk engine output
  undefined,
  'market',
  label,
  false,
  {
    linked_order_type: 'one_triggers_one_cancels_other',
    trigger_fill_condition: 'first_hit',
    otoco_config: [/* ... */]
  }
);
```

---

## API Reference

### placeBuyOrder()

```typescript
async placeBuyOrder(
  instrumentName: string,
  amount: number,
  price?: number,
  type: 'market' | 'limit' | 'stop_market' | 'stop_limit' = 'market',
  label?: string,
  reduceOnly: boolean = false,
  advancedOptions?: {
    linked_order_type?: 'one_triggers_one_cancels_other';
    trigger_fill_condition?: 'first_hit';
    otoco_config?: Array<{
      direction: 'sell';
      amount: number;
      type: 'stop_market' | 'limit';
      trigger_price?: number;
      trigger?: 'mark_price' | 'last_price';
      price?: number;
      reduce_only: boolean;
      label: string;
    }>;
  }
): Promise<Order>
```

### placeSellOrder()

Same signature as `placeBuyOrder()` but for sell direction.

### cancelOrder()

```typescript
async cancelOrder(orderId: string): Promise<void>
```

### cancelAllByInstrument()

```typescript
async cancelAllByInstrument(instrumentName: string): Promise<void>
```

### getOpenOrders()

```typescript
async getOpenOrders(instrumentName: string): Promise<Order[]>
```

### getPositions()

```typescript
async getPositions(currency: string = 'USDC'): Promise<Position[]>
```

### closePosition()

```typescript
async closePosition(
  instrumentName: string,
  type: 'market' | 'limit' = 'market'
): Promise<void>
```

---

## Best Practices

### 1. Always Use OTOCO for SL/TP

✅ **DO**:
```typescript
// Single OTOCO order - atomic, race-proof
const order = await client.placeBuyOrder(
  instrument,
  amount,
  undefined,
  'market',
  label,
  false,
  {
    linked_order_type: 'one_triggers_one_cancels_other',
    trigger_fill_condition: 'first_hit',
    otoco_config: [/* SL and TP */]
  }
);
```

❌ **DON'T**:
```typescript
// Three separate orders - race conditions possible
await client.placeBuyOrder(instrument, amount); // Entry
await client.placeSellOrder(instrument, amount, slPrice, 'stop_market'); // SL
await client.placeSellOrder(instrument, amount, tpPrice, 'limit'); // TP
// Gap between entry and protection orders!
```

---

### 2. Round Prices to Tick Size

✅ **DO**:
```typescript
const tickSize = instrument.tick_size; // 0.5 for BTC_USDC
const roundedPrice = Math.round(price / tickSize) * tickSize;
```

❌ **DON'T**:
```typescript
const price = 45123.456; // Invalid for 0.5 tick size
```

---

### 3. Verify Order Amounts

✅ **DO**:
```typescript
const amount = Math.max(
  riskResult.quantity,
  instrument.min_trade_amount
);

const roundedAmount = Math.round(amount / instrument.contract_size) * 
                      instrument.contract_size;
```

❌ **DON'T**:
```typescript
const amount = 0.5; // Below min_trade_amount
```

---

### 4. Use reduce_only for Exit Orders

✅ **DO**:
```typescript
otoco_config: [
  {
    direction: 'sell',
    amount: amount,
    type: 'stop_market',
    reduce_only: true, // ← Prevents flipping position
    // ...
  }
]
```

❌ **DON'T**:
```typescript
reduce_only: false // Could open opposite position!
```

---

### 5. Label Your Orders

✅ **DO**:
```typescript
const label = `razor_${Date.now()}`;
const slLabel = `${label}_sl`;
const tpLabel = `${label}_tp`;

// Easy to track and debug
```

❌ **DON'T**:
```typescript
const label = 'trade'; // Not unique, hard to track
```

---

### 6. Handle Order Errors Gracefully

✅ **DO**:
```typescript
try {
  const order = await client.placeBuyOrder(/* ... */);
  console.log('Order placed:', order.order_id);
} catch (error) {
  if (error.code === 10004) {
    console.error('Insufficient balance');
  } else if (error.code === 10009) {
    console.error('Invalid params - check amount/price');
  } else {
    console.error('Order failed:', error.message);
  }
  
  // Don't retry immediately - could cascade errors
}
```

---

## Troubleshooting

### Issue: "Invalid params" error

**Symptoms**:
- Order placement fails with error code 10009
- Message: "Invalid params"

**Common Causes**:
1. Amount not multiple of `contract_size`
2. Price not multiple of `tick_size`
3. Amount below `min_trade_amount`
4. Invalid order type combination

**Diagnosis**:
```typescript
// Check instrument details
const instrument = await client.getInstrument('BTC_USDC-PERPETUAL');
console.log({
  tick_size: instrument.tick_size,
  contract_size: instrument.contract_size,
  min_trade_amount: instrument.min_trade_amount
});

// Verify your order params
console.log({
  price: price,
  price_valid: price % instrument.tick_size === 0,
  amount: amount,
  amount_valid: amount % instrument.contract_size === 0,
  amount_sufficient: amount >= instrument.min_trade_amount
});
```

**Solution**:
```typescript
// Round to valid values
const validPrice = Math.round(price / tickSize) * tickSize;
const validAmount = Math.max(
  Math.round(amount / contractSize) * contractSize,
  minTradeAmount
);
```

---

### Issue: OTOCO orders not linked

**Symptoms**:
- Entry fills but no SL/TP created
- SL and TP both fill (no OCO behavior)

**Diagnosis**:
```bash
# Check orders
curl http://localhost:3000/api/v2/orders/BTC_USDC-PERPETUAL | jq

# Look for oco_ref field - should be same for SL and TP
```

**Common Causes**:
1. `linked_order_type` not set correctly
2. `trigger_fill_condition` missing
3. `otoco_config` malformed

**Solution**:
```typescript
// Verify exact structure
{
  linked_order_type: 'one_triggers_one_cancels_other', // Exact string
  trigger_fill_condition: 'first_hit',
  otoco_config: [
    {
      direction: 'sell',        // NOT 'buy'
      amount: amount,           // Same as entry
      type: 'stop_market',      // Valid type
      trigger_price: slPrice,   // Required for stop_market
      trigger: 'mark_price',    // Required for stop orders
      reduce_only: true,        // Required
      label: `${label}_sl`      // Unique label
    },
    // ... TP config
  ]
}
```

---

### Issue: Orders not cleaning up

**Symptoms**:
- Position closed but SL/TP still open
- Multiple orphaned orders

**Diagnosis**:
```bash
# Check open orders
curl http://localhost:3000/api/v2/orders/BTC_USDC-PERPETUAL | jq

# Check positions
curl http://localhost:3000/api/v2/positions | jq
```

**Solutions**:
1. If using OTOCO: Check oco_ref linking
2. If manual orders: Implement position monitoring
3. Manual cleanup: `await client.cancelAllByInstrument(instrument)`

---

### Issue: Insufficient balance error

**Symptoms**:
- Error code 10004
- Message: "Not enough funds"

**Diagnosis**:
```bash
# Check balance
curl http://localhost:3000/api/v2/balance | jq

# Check required margin
# margin = (amount / entryPrice) * leverage
```

**Solutions**:
1. Reduce position size
2. Increase leverage (carefully!)
3. Close other positions
4. Deposit more funds

---

### Issue: Position size calculation wrong

**Symptoms**:
- Risk engine returns unexpected quantity
- Effective leverage too high/low

**Diagnosis**:
```typescript
// Log all inputs
console.log('Risk Engine Inputs:', {
  equity,
  riskMode,
  riskValue,
  entryPrice,
  stopPrice,
  distance: Math.abs(entryPrice - stopPrice),
  brokerRules
});

// Log output
console.log('Risk Engine Output:', riskResult);
```

**Common Issues**:
1. Stop price same as entry (distance = 0)
2. Risk value too low (< min_trade_amount)
3. Leverage cap hit (downsized)

---

**End of Order Management Documentation**

# Strategy Runner Service

24/7 automated trading strategy execution service for Tradebaas.

## Overview

The Strategy Runner Service enables automated trading by:

- Pulling 1-minute candles from broker APIs
- Aggregating candles into multiple timeframes (5m, 15m, 1h, 4h)
- Evaluating DSL-based trading strategies
- Executing OTOCO (One-Triggers-One-Cancels-Other) orders for both long and short positions
- Managing risk using configurable risk engine (percent/fixed, ≤50x leverage)
- Persisting bracket state in JSON storage
- Running continuously every minute when no open position exists

## Architecture

### Components

1. **CandleAggregator** - Manages 1-minute candles and aggregates to higher timeframes
2. **StrategyEngine** - Evaluates strategy rules and generates signals
3. **RiskEngine** - Calculates position sizing based on risk parameters
4. **TechnicalIndicators** - Computes EMA, RSI, SMA, ATR, Bollinger Bands
5. **StateStore** - Persists bracket state and trading statistics
6. **StrategyRunner** - Main orchestrator running the 24/7 loop

### REST API Endpoints

#### Load Strategy
```typescript
POST /strategy/load
{
  config: StrategyConfig,
  brokerId: string
}
```

#### Start Strategy Runner
```typescript
POST /strategy/start
```

#### Stop Strategy Runner
```typescript
POST /strategy/stop
```

#### Get Status
```typescript
GET /strategy/status
```

## Strategy Configuration (DSL)

Strategies are defined in JSON format:

```json
{
  "id": "ema-rsi-scalper",
  "name": "EMA-RSI Scalping Strategy",
  "instrument": "BTC_USDC-PERPETUAL",
  "timeframe": "5m",
  "rules": [
    {
      "type": "indicator",
      "indicator": "ema",
      "condition": "crossover"
    },
    {
      "type": "indicator",
      "indicator": "rsi",
      "condition": "oversold",
      "value": 30
    }
  ],
  "risk": {
    "mode": "percent",
    "value": 2,
    "maxLeverage": 10
  },
  "stopLoss": {
    "type": "percent",
    "value": 1.5
  },
  "takeProfit": {
    "type": "risk_reward",
    "value": 2
  }
}
```

### Supported Indicators

- **EMA** - Exponential Moving Average (crossover detection)
- **RSI** - Relative Strength Index (overbought/oversold)
- **SMA** - Simple Moving Average
- **ATR** - Average True Range
- **Bollinger Bands** - Price bands based on standard deviation

### Rule Types

- `indicator` - Technical indicator conditions
- `price` - Price-based conditions
- `volume` - Volume-based conditions
- `time` - Time-based conditions

### Risk Modes

- `percent` - Risk percentage of equity (e.g., 2% per trade)
- `fixed` - Fixed dollar amount per trade

### Stop Loss Types

- `percent` - Percentage from entry price
- `atr` - ATR-based stop (e.g., 2x ATR)
- `fixed` - Fixed price distance

### Take Profit Types

- `percent` - Percentage from entry price
- `risk_reward` - Risk/reward ratio (e.g., 2:1)
- `fixed` - Fixed price distance

## Usage Example

```typescript
import { 
  handleLoadStrategy, 
  handleStartStrategy, 
  handleStopStrategy,
  handleGetStatus 
} from '@/backend/strategy-runner';

// Load strategy configuration
const strategyConfig = {
  id: "ema-rsi-scalper",
  name: "EMA-RSI Scalping Strategy",
  instrument: "BTC_USDC-PERPETUAL",
  timeframe: "5m",
  rules: [...],
  risk: { mode: "percent", value: 2, maxLeverage: 10 },
  stopLoss: { type: "percent", value: 1.5 },
  takeProfit: { type: "risk_reward", value: 2 }
};

// Load the strategy
await handleLoadStrategy({
  config: strategyConfig,
  brokerId: "deribit"
});

// Start the runner
await handleStartStrategy();

// Check status
const status = await handleGetStatus();
console.log(status);

// Stop the runner
await handleStopStrategy();
```

## Execution Flow

1. **Every Minute (when no position)**:
   - Fetch latest 1-minute candles from broker
   - Update candle aggregator
   - Aggregate to target timeframe
   - Evaluate strategy rules
   - Generate signal (buy/sell/none)

2. **On Signal**:
   - Calculate position size using risk engine
   - Validate against max leverage (≤50x)
   - Calculate stop loss based on strategy config
   - Calculate take profit based on strategy config
   - Place market entry order
   - Place stop loss order (OTOCO bracket)
   - Place take profit order (OTOCO bracket)
   - Persist bracket state

3. **Position Monitoring**:
   - Monitor order status every 5 seconds
   - Detect fills, cancellations
   - Update statistics (PnL, win rate)
   - Clear position state when closed

## Bracket State

The service persists the following state:

```typescript
{
  position: {
    orderId: string,
    instrument: string,
    side: "buy" | "sell",
    entryPrice: number,
    amount: number,
    stopLoss: number,
    takeProfit: number,
    entryTime: number,
    slOrderId: string,
    tpOrderId: string
  },
  lastExecutionTime: number,
  totalTrades: number,
  winningTrades: number,
  losingTrades: number,
  totalPnL: number
}
```

## Frontend Integration

The frontend monitors the strategy runner status but does not control execution logic. All trading decisions are made autonomously by the backend service.

Frontend should:
- Display runner status (running/stopped)
- Show active position details
- Display strategy statistics
- Allow starting/stopping the runner
- Allow loading new strategies

## Pre-configured Strategies

See `/backend/strategies/` for example configurations:

- `ema-rsi-scalper.json` - EMA crossover with RSI confirmation
- `bb-mean-reversion.json` - Bollinger Bands mean reversion

## Safety Features

- Only executes when no open position
- Validates risk parameters before execution
- Enforces max leverage limits (≤50x)
- Requires minimum trade amounts
- Automatic position monitoring
- Persistent state across restarts

## Notes

- The service runs a 60-second evaluation loop
- Position monitoring runs every 5 seconds
- All prices are rounded to instrument tick size
- State is persisted to local storage
- Frontend only displays data, backend handles execution

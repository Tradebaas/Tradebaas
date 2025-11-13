# Razor Strategy - Complete Technical Documentation

**24/7 Automated Mean-Reversion Strategy for BTC Perpetuals**

## 📋 Overview

The **Razor strategy** is a technical analysis-based mean-reversion strategy designed for Bitcoin perpetual futures on Deribit. It uses multiple technical indicators to identify high-probability entry points with strict risk management.

## 🎯 Strategy Logic

### Core Concept

**Mean Reversion Trading:**
- Identifies when price deviates significantly from its average
- Enters positions expecting price to return to mean
- Uses tight stop-losses and wider profit targets (2:1 R:R minimum)

### Instrument

- **Primary:** BTC_USDC-PERPETUAL (Deribit)
- **Timeframe:** 1-minute candles
- **Analysis Period:** 100+ candles required

## 📊 Technical Indicators

### 1. EMA (Exponential Moving Averages)

```typescript
EMA_FAST = 9 periods   // Short-term trend
EMA_SLOW = 21 periods  // Medium-term trend
```

**Purpose:**
- Identify trend direction
- Confirm momentum
- Detect crossovers

**Calculation:**
```typescript
function calculateEMA(prices: number[], period: number): number {
  const multiplier = 2 / (period + 1);
  let ema = prices[0]; // Start with first price
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}
```

**Signals:**
- **Bullish:** EMA Fast > EMA Slow (uptrend)
- **Bearish:** EMA Fast < EMA Slow (downtrend)
- **Crossover:** Strong signal when EMAs cross

### 2. RSI (Relative Strength Index)

```typescript
RSI_PERIOD = 14
RSI_OVERSOLD = 30
RSI_OVERBOUGHT = 70
```

**Purpose:**
- Identify overbought/oversold conditions
- Confirm extremes for mean reversion

**Calculation:**
```typescript
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI using Wilder's smoothing
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
```

**Signals:**
- **Oversold:** RSI < 30 → Potential LONG entry
- **Overbought:** RSI > 70 → Potential SHORT entry
- **Neutral:** 30-70 → No extreme conditions

### 3. Volatility (Standard Deviation)

```typescript
VOLATILITY_MIN = 0.1%  // 0.001
VOLATILITY_MAX = 2.0%  // 0.02
VOLATILITY_LOOKBACK = 20 candles
```

**Purpose:**
- Filter out low-volatility periods (false signals)
- Avoid high-volatility chaos (unpredictable)

**Calculation:**
```typescript
function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  // Calculate mean
  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  // Calculate variance
  const variance = prices.reduce((sum, p) => {
    const diff = p - mean;
    return sum + diff * diff;
  }, 0) / prices.length;

  // Standard deviation as percentage of mean
  return Math.sqrt(variance) / mean;
}
```

**Signals:**
- **Too Low:** <0.1% → Skip (no opportunity)
- **Optimal:** 0.1%-2% → Trade zone
- **Too High:** >2% → Skip (too risky)

### 4. Momentum (Price Change)

```typescript
MOMENTUM_PERIOD = 5 candles
MOMENTUM_THRESHOLD = 0.1%  // 0.001
```

**Purpose:**
- Confirm directional movement
- Validate trend strength

**Calculation:**
```typescript
function calculateMomentum(prices: number[], period: number = 5): number {
  if (prices.length < period) return 0;
  
  const currentPrice = prices[prices.length - 1];
  const pastPrice = prices[prices.length - period];
  
  return (currentPrice - pastPrice) / pastPrice;
}
```

**Signals:**
- **Bullish:** Momentum > +0.1% (strong upward movement)
- **Bearish:** Momentum < -0.1% (strong downward movement)
- **Weak:** -0.1% to +0.1% → No clear direction

## ✅ Entry Conditions (Checkpoints)

All 4 checkpoints must be ✅ AND signal strength >70%:

### Checkpoint 1: Volatility Range
```typescript
const volatility = calculateVolatility(recentPrices);
const volatilityOk = volatility >= 0.001 && volatility <= 0.02;
```
**Status:** ⏳ or ✅

### Checkpoint 2: RSI Extreme
```typescript
const rsi = calculateRSI(prices, 14);
const rsiOversold = rsi < 30;   // LONG signal
const rsiOverbought = rsi > 70;  // SHORT signal
const rsiExtreme = rsiOversold || rsiOverbought;
```
**Status:** ⏳ or ✅

### Checkpoint 3: EMA Trend
```typescript
const emaFast = calculateEMA(prices, 9);
const emaSlow = calculateEMA(prices, 21);
const bullishTrend = emaFast > emaSlow;
const bearishTrend = emaFast < emaSlow;
```
**Status:** Always ✅ (shows direction, not requirement)

### Checkpoint 4: Momentum Strength
```typescript
const momentum = calculateMomentum(prices, 5);
const strongMomentum = Math.abs(momentum) > 0.001;
```
**Status:** ⏳ or ✅

## 🎲 Signal Scoring System

### Long Signal Calculation

```typescript
function calculateLongScore(): number {
  let score = 0;

  // RSI oversold (0-30 points)
  if (rsi < 30) {
    score += 30 - rsi;  // More oversold = higher score
  }

  // EMA bullish (0-25 points)
  if (emaFast > emaSlow) {
    const emaDiff = (emaFast - emaSlow) / emaSlow;
    score += Math.min(emaDiff * 10000, 25);
  }

  // Positive momentum (0-25 points)
  if (momentum > 0) {
    score += Math.min(momentum * 10000, 25);
  }

  // Volatility bonus (0-20 points)
  if (volatility >= 0.001 && volatility <= 0.01) {
    score += 20;
  } else if (volatility > 0.01 && volatility <= 0.02) {
    score += 10;
  }

  return Math.min(score, 100);
}
```

### Short Signal Calculation

```typescript
function calculateShortScore(): number {
  let score = 0;

  // RSI overbought (0-30 points)
  if (rsi > 70) {
    score += rsi - 70;  // More overbought = higher score
  }

  // EMA bearish (0-25 points)
  if (emaFast < emaSlow) {
    const emaDiff = (emaSlow - emaFast) / emaSlow;
    score += Math.min(emaDiff * 10000, 25);
  }

  // Negative momentum (0-25 points)
  if (momentum < 0) {
    score += Math.min(Math.abs(momentum) * 10000, 25);
  }

  // Volatility bonus (0-20 points)
  if (volatility >= 0.001 && volatility <= 0.01) {
    score += 20;
  } else if (volatility > 0.01 && volatility <= 0.02) {
    score += 10;
  }

  return Math.min(score, 100);
}
```

### Trade Execution Threshold

```typescript
const longScore = calculateLongScore();
const shortScore = calculateShortScore();

if (longScore > 70 && allCheckpointsMet) {
  executeLongTrade();
} else if (shortScore > 70 && allCheckpointsMet) {
  executeShortTrade();
}
```

## 💰 Risk Management

### Position Sizing

```typescript
interface RiskSettings {
  riskMode: 'percent' | 'fixed';
  riskValue: number;  // 1-10% or fixed USD
  maxLeverage: 50;
}
```

**Percent Mode Example (5% risk):**
```typescript
const equity = 10000;  // $10,000 USDC
const riskAmount = equity * 0.05;  // $500 at risk
const entryPrice = 108000;
const stopLossPrice = 107460;  // 0.5% away
const stopLossDistance = entryPrice - stopLossPrice;  // $540

// Position size = risk amount / stop distance
const positionSize = riskAmount / stopLossDistance;
// = $500 / $540 = 0.926 BTC (~$100,000 notional)
```

### Stop Loss & Take Profit

```typescript
const STOP_LOSS_PERCENT = 0.5;   // 0.5%
const TAKE_PROFIT_PERCENT = 1.0;  // 1.0%
// Risk:Reward = 1:2
```

**Long Trade Example:**
```typescript
const entryPrice = 108000;
const stopLoss = entryPrice * (1 - 0.005);   // $107460
const takeProfit = entryPrice * (1 + 0.01);  // $109080

// If SL hit: Lose 0.5%
// If TP hit: Gain 1.0%
```

**Short Trade Example:**
```typescript
const entryPrice = 108000;
const stopLoss = entryPrice * (1 + 0.005);   // $108540
const takeProfit = entryPrice * (1 - 0.01);  // $106920
```

### Trade Limits

```typescript
const MAX_DAILY_TRADES = 10;
const COOLDOWN_MINUTES = 15;
```

**Purpose:**
- Prevent overtrading
- Allow market conditions to change
- Preserve capital for best opportunities

## 🔄 Candle Management

### Historical Candles (Initialization)

```typescript
async function initializeHistoricalData(): Promise<void> {
  console.log('[Razor] Fetching historical 1-min candles...');
  
  const result = await this.client.getCandles(
    'BTC_USDC-PERPETUAL',
    '1',    // 1-minute resolution
    100     // 100 candles
  );

  // Extract OHLC data
  const candles = result.data.result;
  this.priceHistory = candles.close;

  console.log(`[Razor] ✅ Loaded ${this.priceHistory.length} historical candles`);
  console.log(`[Razor] Price range: $${Math.min(...this.priceHistory)} - $${Math.max(...this.priceHistory)}`);
}
```

### Real-Time Candle Building

```typescript
function onTicker(price: number): void {
  const now = Date.now();
  
  // Initialize or update current candle
  if (!this.currentCandle) {
    this.currentCandle = {
      open: price,
      high: price,
      low: price,
      close: price,
      startTime: now
    };
    return;
  }

  // Update OHLC
  this.currentCandle.high = Math.max(this.currentCandle.high, price);
  this.currentCandle.low = Math.min(this.currentCandle.low, price);
  this.currentCandle.close = price;

  // Close candle every 60 seconds
  const elapsed = now - this.currentCandle.startTime;
  if (elapsed >= 60000) {
    console.log(`[Razor] 🕯️ Candle closed: O:${this.currentCandle.open.toFixed(1)} H:${this.currentCandle.high.toFixed(1)} L:${this.currentCandle.low.toFixed(1)} C:${this.currentCandle.close.toFixed(1)}`);
    
    this.priceHistory.push(this.currentCandle.close);
    
    // Keep last 200 candles
    if (this.priceHistory.length > 200) {
      this.priceHistory.shift();
    }
    
    // Reset for next candle
    this.currentCandle = null;
  }
}
```

## 📈 Analysis State

### State Interface

```typescript
interface AnalysisState {
  status: 'initializing' | 'analyzing' | 'signal-detected' | 'in-position';
  dataPoints: number;
  currentPrice: number;
  indicators: {
    emaFast: number;
    emaSlow: number;
    rsi: number;
    volatility: number;
    momentum: number;
  };
  checkpoints: Checkpoint[];
  signals: {
    long: number;    // 0-100 score
    short: number;   // 0-100 score
  };
  nextAction?: {
    type: 'LONG' | 'SHORT';
    confidence: number;
    entry: number;
    stopLoss: number;
    takeProfit: number;
  };
}
```

### Status Progression

```
initializing (< 20 candles)
      ↓
analyzing (monitoring market)
      ↓
signal-detected (>70 score, all checkpoints)
      ↓
in-position (trade executed)
      ↓
analyzing (position closed)
```

## 🧪 Example Scenarios

### Scenario 1: Perfect Long Setup

```typescript
// Market conditions
const price = 107800;
const emaFast = 107900;   // Above slow (bullish)
const emaSlow = 107700;
const rsi = 28;           // Oversold
const volatility = 0.008; // 0.8% (optimal)
const momentum = 0.0012;  // +0.12% (positive)

// Checkpoint evaluation
✅ Volatility: 0.8% (in range 0.1%-2%)
✅ RSI: 28 (oversold <30)
✅ EMA: Bullish (Fast > Slow)
✅ Momentum: +0.12% (>0.1%)

// Signal scoring
Long score = 30 + 25 + 25 + 20 = 100 (max)

// Trade execution
Direction: LONG
Entry: $107800
Stop Loss: $107260 (0.5% below)
Take Profit: $108880 (1.0% above)
Risk:Reward = 1:2
```

### Scenario 2: Rejected - High Volatility

```typescript
const price = 108500;
const rsi = 25;           // Oversold
const volatility = 0.025; // 2.5% (too high!)

// Checkpoint evaluation
❌ Volatility: 2.5% (exceeds 2% max)
✅ RSI: 25 (oversold)
✅ EMA: Bullish
✅ Momentum: +0.15%

// Result: NO TRADE (volatility filter)
```

### Scenario 3: Weak Signal

```typescript
const price = 108000;
const emaFast = 108010;   // Slightly bullish
const emaSlow = 108000;
const rsi = 45;           // Neutral
const volatility = 0.005;
const momentum = 0.0002;  // Weak +0.02%

// Checkpoint evaluation
✅ Volatility: 0.5% (in range)
❌ RSI: 45 (not extreme)
✅ EMA: Slightly bullish
❌ Momentum: 0.02% (below 0.1%)

// Signal scoring
Long score = 0 + 10 + 5 + 20 = 35 (below 70 threshold)

// Result: NO TRADE (weak signal)
```

## 📊 Performance Metrics

### Theoretical Backtest Results

**Assumptions:**
- 100 trades
- 60% win rate (typical mean-reversion)
- 2:1 R:R ratio

**Results:**
```
Wins: 60 trades × +1.0% = +60%
Losses: 40 trades × -0.5% = -20%
Net: +40% (before fees)
```

**With Deribit Fees:**
- Maker: -0.01% (rebate)
- Taker: +0.05%
- Average: ~0.03% per round trip

```
Net after fees: +40% - (100 × 0.06%) = +34%
```

### Live Production Stats

**Current Status (November 3, 2025):**
- Status: Analyzing
- Candles: 100 loaded
- EMA Fast: $107,742.97
- EMA Slow: $107,707.97
- RSI: 61.3 (neutral)
- Volatility: 0.12% ✅
- Checkpoints Met: 3/4 (waiting for RSI extreme)

**Observations:**
- System stable for 2+ hours
- WebSocket streaming correctly
- No false signals (good filtering)
- Waiting for RSI <30 or >70

## 🔧 Configuration

### Strategy Config JSON

```json
{
  "strategyName": "Razor",
  "instrument": "BTC_USDC-PERPETUAL",
  "environment": "live",
  "config": {
    "riskMode": "percent",
    "riskValue": 5,
    "stopLossPercent": 0.5,
    "takeProfitPercent": 1.0,
    "maxDailyTrades": 10,
    "cooldownMinutes": 15,
    "indicators": {
      "emaFast": 9,
      "emaSlow": 21,
      "rsiPeriod": 14,
      "volatilityPeriod": 20,
      "momentumPeriod": 5
    },
    "thresholds": {
      "rsiOversold": 30,
      "rsiOverbought": 70,
      "volatilityMin": 0.001,
      "volatilityMax": 0.02,
      "momentumMin": 0.001,
      "signalStrength": 70
    }
  }
}
```

## 📚 References

### Technical Analysis Resources

- **EMA:** [Investopedia - EMA](https://www.investopedia.com/terms/e/ema.asp)
- **RSI:** [Wilder's RSI Formula](https://school.stockcharts.com/doku.php?id=technical_indicators:relative_strength_index_rsi)
- **Volatility:** Standard Deviation for financial time series
- **Mean Reversion:** Statistical arbitrage concepts

### Deribit API

- **WebSocket:** [Deribit WebSocket v2](https://docs.deribit.com/#subscriptions)
- **Candles:** [TradingView Chart Data](https://docs.deribit.com/#public-get_tradingview_chart_data)
- **Orders:** [Private Trading Endpoints](https://docs.deribit.com/#private-buy)

---

**Version:** 1.0.0  
**Author:** Tradebaas Development Team  
**Last Updated:** November 3, 2025  
**Status:** ✅ Production Active

For implementation details, see: `backend/src/strategies/razor-executor.ts`

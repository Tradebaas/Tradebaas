/**
 * SimpleMovingAverageCrossStrategy.ts
 * 
 * Purpose: Example strategy implementing IStrategy interface
 * Strategy: Buy when fast SMA crosses above slow SMA, sell when crosses below
 * 
 * Part of: Iteration 4 - Strategy Templates
 */

import {
  IStrategy,
  BaseStrategy,
  StrategyMetadata,
  StrategyConfig,
  MarketData,
  Candle,
  AnalysisResult,
  TradeSignal,
} from './IStrategy';

// ============================================================================
// Strategy Implementation
// ============================================================================

export class SimpleMovingAverageCrossStrategy extends BaseStrategy implements IStrategy {
  readonly metadata: StrategyMetadata = {
    name: 'SMA-Cross',
    version: '1.0.0',
    description: 'Simple Moving Average Crossover Strategy - Buy when fast crosses above slow, sell when crosses below',
    author: 'TradeBaas Team',
    tags: ['trend-following', 'moving-average', 'beginner-friendly'],
    defaultConfig: {
      instrument: 'BTC-PERPETUAL',
      timeframe: '5m',
      riskPercent: 5,
      parameters: {
        fastPeriod: 10,
        slowPeriod: 30,
        stopLossPercent: 2,
        takeProfitPercent: 6,
      },
    },
    requiredParameters: ['fastPeriod', 'slowPeriod', 'stopLossPercent', 'takeProfitPercent'],
    optionalParameters: [],
  };

  async analyze(marketData: MarketData, candles: Candle[]): Promise<AnalysisResult> {
    this.assertInitialized();

    const { fastPeriod, slowPeriod } = this.config.parameters;

    // Need enough candles for slow SMA
    if (candles.length < slowPeriod) {
      return {
        signal: 'NEUTRAL',
        confidence: 0,
        reason: `Insufficient candles: ${candles.length}/${slowPeriod} required`,
        indicators: {},
      };
    }

    // Calculate SMAs
    const fastSMA = this.calculateSMA(candles, fastPeriod);
    const slowSMA = this.calculateSMA(candles, slowPeriod);
    const prevFastSMA = this.calculateSMA(candles.slice(0, -1), fastPeriod);
    const prevSlowSMA = this.calculateSMA(candles.slice(0, -1), slowPeriod);

    // Detect crossover
    const bullishCross = prevFastSMA <= prevSlowSMA && fastSMA > slowSMA;
    const bearishCross = prevFastSMA >= prevSlowSMA && fastSMA < slowSMA;

    // Calculate distance between SMAs (strength indicator)
    const distance = Math.abs(fastSMA - slowSMA);
    const distancePercent = (distance / slowSMA) * 100;

    // Confidence based on distance (stronger signal = larger distance)
    const confidence = Math.min(distancePercent * 20, 100); // Scale to 0-100

    let signal: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let reason = 'No crossover detected';

    if (bullishCross) {
      signal = 'LONG';
      reason = `Bullish crossover: Fast SMA (${fastSMA.toFixed(2)}) crossed above Slow SMA (${slowSMA.toFixed(2)})`;
    } else if (bearishCross) {
      signal = 'SHORT';
      reason = `Bearish crossover: Fast SMA (${fastSMA.toFixed(2)}) crossed below Slow SMA (${slowSMA.toFixed(2)})`;
    }

    return {
      signal,
      confidence,
      reason,
      indicators: {
        fastSMA,
        slowSMA,
        prevFastSMA,
        prevSlowSMA,
        distancePercent,
        currentPrice: marketData.price,
      },
      metadata: {
        candlesUsed: candles.length,
        fastPeriod,
        slowPeriod,
      },
    };
  }

  async generateSignal(analysis: AnalysisResult, marketData: MarketData): Promise<TradeSignal> {
    this.assertInitialized();

    const side = analysis.signal === 'LONG' ? 'buy' : 'sell';
    const entryPrice = marketData.price;
    const stopLossPrice = this.calculateStopLoss(entryPrice, side, marketData);
    const takeProfitPrice = this.calculateTakeProfit(entryPrice, side, marketData);

    return {
      side,
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      confidence: analysis.confidence,
      reason: analysis.reason,
      metadata: {
        indicators: analysis.indicators,
        riskRewardRatio: this.calculateRiskRewardRatio(entryPrice, stopLossPrice, takeProfitPrice),
      },
    };
  }

  calculateStopLoss(entryPrice: number, side: 'buy' | 'sell', marketData: MarketData): number {
    const { stopLossPercent } = this.config.parameters;
    const slDistance = entryPrice * (stopLossPercent / 100);

    if (side === 'buy') {
      // Long position: SL below entry
      return entryPrice - slDistance;
    } else {
      // Short position: SL above entry
      return entryPrice + slDistance;
    }
  }

  calculateTakeProfit(entryPrice: number, side: 'buy' | 'sell', marketData: MarketData): number {
    const { takeProfitPercent } = this.config.parameters;
    const tpDistance = entryPrice * (takeProfitPercent / 100);

    if (side === 'buy') {
      // Long position: TP above entry
      return entryPrice + tpDistance;
    } else {
      // Short position: TP below entry
      return entryPrice - tpDistance;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Calculate Simple Moving Average
   */
  private calculateSMA(candles: Candle[], period: number): number {
    if (candles.length < period) {
      throw new Error(`Not enough candles for SMA(${period}): got ${candles.length}`);
    }

    const relevantCandles = candles.slice(-period);
    const sum = relevantCandles.reduce((acc, candle) => acc + candle.close, 0);
    return sum / period;
  }
}

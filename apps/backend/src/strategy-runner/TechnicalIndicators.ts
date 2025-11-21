import { Candle } from './types';

export class TechnicalIndicators {
  static calculateEMA(candles: Candle[], period: number): number[] {
    if (candles.length < period) return [];
    
    const prices = candles.map(c => c.close);
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    let sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    ema.push(sma);
    
    for (let i = period; i < prices.length; i++) {
      const value = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
      ema.push(value);
    }
    
    return ema;
  }
  
  static calculateRSI(candles: Candle[], period: number = 14): number[] {
    if (candles.length < period + 1) return [];
    
    const prices = candles.map(c => c.close);
    const rsi: number[] = [];
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    let avgGain = 0;
    let avgLoss = 0;
    
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) {
        avgGain += changes[i];
      } else {
        avgLoss += Math.abs(changes[i]);
      }
    }
    
    avgGain /= period;
    avgLoss /= period;
    
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
    
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      
      const newRs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + newRs)));
    }
    
    return rsi;
  }
  
  static calculateSMA(candles: Candle[], period: number): number[] {
    if (candles.length < period) return [];
    
    const prices = candles.map(c => c.close);
    const sma: number[] = [];
    
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    
    return sma;
  }
  
  static calculateATR(candles: Candle[], period: number = 14): number[] {
    if (candles.length < period + 1) return [];
    
    const trueRanges: number[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      
      trueRanges.push(tr);
    }
    
    const atr: number[] = [];
    let sum = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
    atr.push(sum / period);
    
    for (let i = period; i < trueRanges.length; i++) {
      const value = (atr[atr.length - 1] * (period - 1) + trueRanges[i]) / period;
      atr.push(value);
    }
    
    return atr;
  }
  
  static calculateBollingerBands(candles: Candle[], period: number = 20, stdDev: number = 2): { 
    upper: number[], 
    middle: number[], 
    lower: number[] 
  } {
    const sma = this.calculateSMA(candles, period);
    const prices = candles.map(c => c.close).slice(period - 1);
    
    const upper: number[] = [];
    const middle: number[] = sma;
    const lower: number[] = [];
    
    for (let i = 0; i < sma.length; i++) {
      const slice = prices.slice(i, i + period);
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma[i], 2), 0) / period;
      const std = Math.sqrt(variance);
      
      upper.push(sma[i] + stdDev * std);
      lower.push(sma[i] - stdDev * std);
    }
    
    return { upper, middle, lower };
  }
}

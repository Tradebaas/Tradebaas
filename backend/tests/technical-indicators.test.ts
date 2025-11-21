import { describe, it, expect } from 'vitest';
import { TechnicalIndicators } from '../src/strategy-runner/TechnicalIndicators';
import { Candle } from '../src/strategy-runner/types';

function generateCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2;
    price += change;
    
    const high = price + Math.random();
    const low = price - Math.random();
    
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price,
      high,
      low,
      close: price,
      volume: 100 + Math.random() * 50,
    });
  }
  
  return candles;
}

describe('TechnicalIndicators', () => {
  it('should calculate EMA', () => {
    const candles = generateCandles(50, 100);
    const ema = TechnicalIndicators.calculateEMA(candles, 20);
    
    expect(ema).toHaveLength(31);
    expect(ema[0]).toBeGreaterThan(0);
  });
  
  it('should calculate RSI', () => {
    const candles = generateCandles(50, 100);
    const rsi = TechnicalIndicators.calculateRSI(candles, 14);
    
    expect(rsi.length).toBeGreaterThan(0);
    expect(rsi[rsi.length - 1]).toBeGreaterThanOrEqual(0);
    expect(rsi[rsi.length - 1]).toBeLessThanOrEqual(100);
  });
  
  it('should calculate SMA', () => {
    const candles = generateCandles(50, 100);
    const sma = TechnicalIndicators.calculateSMA(candles, 20);
    
    expect(sma).toHaveLength(31);
    expect(sma[0]).toBeGreaterThan(0);
  });
  
  it('should calculate ATR', () => {
    const candles = generateCandles(50, 100);
    const atr = TechnicalIndicators.calculateATR(candles, 14);
    
    expect(atr.length).toBeGreaterThan(0);
    expect(atr[atr.length - 1]).toBeGreaterThan(0);
  });
  
  it('should calculate Bollinger Bands', () => {
    const candles = generateCandles(50, 100);
    const bb = TechnicalIndicators.calculateBollingerBands(candles, 20, 2);
    
    expect(bb.upper.length).toBeGreaterThan(0);
    expect(bb.middle.length).toBeGreaterThan(0);
    expect(bb.lower.length).toBeGreaterThan(0);
    
    const lastIdx = bb.upper.length - 1;
    expect(bb.upper[lastIdx]).toBeGreaterThan(bb.middle[lastIdx]);
    expect(bb.middle[lastIdx]).toBeGreaterThan(bb.lower[lastIdx]);
  });
  
  it('should return empty array for insufficient data', () => {
    const candles = generateCandles(5, 100);
    const ema = TechnicalIndicators.calculateEMA(candles, 20);
    
    expect(ema).toHaveLength(0);
  });
});

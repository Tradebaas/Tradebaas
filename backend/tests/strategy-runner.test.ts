import { describe, it, expect } from 'vitest';
import { CandleAggregator } from '../src/strategy-runner/CandleAggregator';
import { Candle } from '../src/strategy-runner/types';

describe('CandleAggregator', () => {
  it('should add and retrieve 1m candles', () => {
    const aggregator = new CandleAggregator();
    
    const candle: Candle = {
      timestamp: Date.now(),
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
    };
    
    aggregator.addCandle1m(candle);
    
    const candles = aggregator.getCandles('1m', 10);
    expect(candles).toHaveLength(1);
    expect(candles[0]).toEqual(candle);
  });
  
  it('should aggregate 5m candles from 1m candles', () => {
    const aggregator = new CandleAggregator();
    
    for (let i = 0; i < 10; i++) {
      aggregator.addCandle1m({
        timestamp: Date.now() + i * 60000,
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 102 + i,
        volume: 100,
      });
    }
    
    const candles5m = aggregator.getCandles('5m', 10);
    expect(candles5m).toHaveLength(2);
    expect(candles5m[0].volume).toBe(500);
  });
  
  it('should check for enough data', () => {
    const aggregator = new CandleAggregator();
    
    expect(aggregator.hasEnoughData('1m', 10)).toBe(false);
    
    for (let i = 0; i < 10; i++) {
      aggregator.addCandle1m({
        timestamp: Date.now() + i * 60000,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 100,
      });
    }
    
    expect(aggregator.hasEnoughData('1m', 10)).toBe(true);
    expect(aggregator.hasEnoughData('1m', 20)).toBe(false);
  });
});

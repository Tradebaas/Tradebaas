import { Candle, Timeframe } from './types';

export class CandleAggregator {
  private candles1m: Candle[] = [];
  
  addCandle1m(candle: Candle): void {
    this.candles1m.push(candle);
    
    const maxHistory = 250;
    if (this.candles1m.length > maxHistory) {
      this.candles1m = this.candles1m.slice(-maxHistory);
    }
  }
  
  getCandles(timeframe: Timeframe, limit: number = 100): Candle[] {
    if (timeframe === '1m') {
      return this.candles1m.slice(-limit);
    }
    
    const multiplier = this.getTimeframeMultiplier(timeframe);
    return this.aggregateCandles(this.candles1m, multiplier).slice(-limit);
  }
  
  private getTimeframeMultiplier(timeframe: Timeframe): number {
    switch (timeframe) {
      case '1m': return 1;
      case '5m': return 5;
      case '15m': return 15;
      case '1h': return 60;
      case '4h': return 240;
      default: return 1;
    }
  }
  
  private aggregateCandles(candles: Candle[], multiplier: number): Candle[] {
    if (multiplier === 1) return candles;
    
    const aggregated: Candle[] = [];
    
    for (let i = 0; i < candles.length; i += multiplier) {
      const chunk = candles.slice(i, i + multiplier);
      if (chunk.length === 0) continue;
      
      const aggregatedCandle: Candle = {
        timestamp: chunk[0].timestamp,
        open: chunk[0].open,
        high: Math.max(...chunk.map(c => c.high)),
        low: Math.min(...chunk.map(c => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      };
      
      aggregated.push(aggregatedCandle);
    }
    
    return aggregated;
  }
  
  hasEnoughData(timeframe: Timeframe, minCandles: number): boolean {
    const candles = this.getCandles(timeframe, minCandles);
    return candles.length >= minCandles;
  }
}

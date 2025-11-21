import { StrategyConfig, StrategySignal, Candle } from './types';
import { TechnicalIndicators } from './TechnicalIndicators';

export class StrategyEngine {
  private config: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.config = config;
  }
  
  evaluate(candles: Candle[]): StrategySignal {
    if (candles.length < 50) {
      return {
        action: 'none',
        confidence: 0,
        reason: 'Insufficient candle data',
      };
    }
    
    const currentPrice = candles[candles.length - 1].close;
    const indicators = this.calculateIndicators(candles);
    
    let buyScore = 0;
    let sellScore = 0;
    const reasons: string[] = [];
    
    for (const rule of this.config.rules) {
      const result = this.evaluateRule(rule, indicators, currentPrice, candles);
      
      if (result.signal === 'buy') {
        buyScore += result.weight;
        reasons.push(result.reason);
      } else if (result.signal === 'sell') {
        sellScore += result.weight;
        reasons.push(result.reason);
      }
    }
    
    const totalRules = this.config.rules.length;
    
    if (buyScore > sellScore && buyScore >= totalRules * 0.6) {
      return {
        action: 'buy',
        confidence: buyScore / totalRules,
        reason: reasons.join('; '),
      };
    } else if (sellScore > buyScore && sellScore >= totalRules * 0.6) {
      return {
        action: 'sell',
        confidence: sellScore / totalRules,
        reason: reasons.join('; '),
      };
    }
    
    return {
      action: 'none',
      confidence: Math.max(buyScore, sellScore) / totalRules,
      reason: 'No strong signal',
    };
  }
  
  private calculateIndicators(candles: Candle[]): Record<string, number | number[]> {
    const indicators: Record<string, number | number[]> = {};
    
    const rulesNeedingIndicators = new Set(
      this.config.rules
        .filter(r => r.type === 'indicator' && r.indicator)
        .map(r => r.indicator!)
    );
    
    if (rulesNeedingIndicators.has('ema')) {
      const emaFast = TechnicalIndicators.calculateEMA(candles, 9);
      const emaSlow = TechnicalIndicators.calculateEMA(candles, 21);
      indicators.ema_fast = emaFast.length > 0 ? emaFast[emaFast.length - 1] : 0;
      indicators.ema_slow = emaSlow.length > 0 ? emaSlow[emaSlow.length - 1] : 0;
    }
    
    if (rulesNeedingIndicators.has('rsi')) {
      const rsi = TechnicalIndicators.calculateRSI(candles, 14);
      indicators.rsi = rsi.length > 0 ? rsi[rsi.length - 1] : 50;
    }
    
    if (rulesNeedingIndicators.has('sma')) {
      const sma20 = TechnicalIndicators.calculateSMA(candles, 20);
      const sma50 = TechnicalIndicators.calculateSMA(candles, 50);
      indicators.sma_20 = sma20.length > 0 ? sma20[sma20.length - 1] : 0;
      indicators.sma_50 = sma50.length > 0 ? sma50[sma50.length - 1] : 0;
    }
    
    if (rulesNeedingIndicators.has('atr')) {
      const atr = TechnicalIndicators.calculateATR(candles, 14);
      indicators.atr = atr.length > 0 ? atr[atr.length - 1] : 0;
    }
    
    if (rulesNeedingIndicators.has('bb')) {
      const bb = TechnicalIndicators.calculateBollingerBands(candles, 20, 2);
      indicators.bb_upper = bb.upper.length > 0 ? bb.upper[bb.upper.length - 1] : 0;
      indicators.bb_middle = bb.middle.length > 0 ? bb.middle[bb.middle.length - 1] : 0;
      indicators.bb_lower = bb.lower.length > 0 ? bb.lower[bb.lower.length - 1] : 0;
    }
    
    return indicators;
  }
  
  private evaluateRule(
    rule: any,
    indicators: Record<string, number | number[]>,
    currentPrice: number,
    candles: Candle[]
  ): { signal: 'buy' | 'sell' | 'none'; weight: number; reason: string } {
    const weight = 1;
    
    if (rule.type === 'indicator') {
      if (rule.indicator === 'ema' && rule.condition === 'crossover') {
        const emaFast = indicators.ema_fast as number;
        const emaSlow = indicators.ema_slow as number;
        
        if (emaFast > emaSlow) {
          return { signal: 'buy', weight, reason: 'EMA fast > EMA slow' };
        } else if (emaFast < emaSlow) {
          return { signal: 'sell', weight, reason: 'EMA fast < EMA slow' };
        }
      }
      
      if (rule.indicator === 'rsi') {
        const rsi = indicators.rsi as number;
        
        if (rule.condition === 'oversold' && rsi < (rule.value as number)) {
          return { signal: 'buy', weight, reason: `RSI oversold (${rsi.toFixed(2)})` };
        } else if (rule.condition === 'overbought' && rsi > (rule.value as number)) {
          return { signal: 'sell', weight, reason: `RSI overbought (${rsi.toFixed(2)})` };
        }
      }
      
      if (rule.indicator === 'bb') {
        const bbUpper = indicators.bb_upper as number;
        const bbLower = indicators.bb_lower as number;
        
        if (rule.condition === 'touch_lower' && currentPrice <= bbLower * 1.001) {
          return { signal: 'buy', weight, reason: 'Price at lower BB' };
        } else if (rule.condition === 'touch_upper' && currentPrice >= bbUpper * 0.999) {
          return { signal: 'sell', weight, reason: 'Price at upper BB' };
        }
      }
    }
    
    if (rule.type === 'volume') {
      const currentVolume = candles[candles.length - 1].volume;
      const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
      
      if (rule.condition === 'above_average' && currentVolume > avgVolume * (rule.value as number)) {
        return { signal: 'buy', weight: 0.5, reason: 'High volume' };
      }
    }
    
    return { signal: 'none', weight: 0, reason: '' };
  }
  
  getConfig(): StrategyConfig {
    return this.config;
  }
  
  updateConfig(config: StrategyConfig): void {
    this.config = config;
  }
}

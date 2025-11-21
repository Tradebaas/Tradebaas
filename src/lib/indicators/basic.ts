export function ema(period: number, closes: number[]): number | undefined {
  if (closes.length < period) return undefined;
  
  const multiplier = 2 / (period + 1);
  let emaValue = closes.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  
  for (let i = period; i < closes.length; i++) {
    emaValue = (closes[i] - emaValue) * multiplier + emaValue;
  }
  
  return emaValue;
}

export interface BollingerBands {
  mid?: number;
  upper?: number;
  lower?: number;
}

export function bollinger(
  period: number,
  stdDev: number,
  closes: number[]
): BollingerBands {
  if (closes.length < period) {
    return { mid: undefined, upper: undefined, lower: undefined };
  }
  
  const slice = closes.slice(-period);
  const sma = slice.reduce((sum, val) => sum + val, 0) / period;
  
  const squaredDiffs = slice.map(val => Math.pow(val - sma, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / period;
  const stdDeviation = Math.sqrt(variance);
  
  return {
    mid: sma,
    upper: sma + stdDev * stdDeviation,
    lower: sma - stdDev * stdDeviation,
  };
}

export function rsi(period: number, closes: number[]): number | undefined {
  if (closes.length < period + 1) return undefined;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

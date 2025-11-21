/**
 * Strategy Runner Types
 * Uses common types from shared.ts and defines strategy-specific types
 */

// Import common types from centralized location
import type { Candle, Position, Timeframe } from '../types/shared';

// Re-export for convenience
export type { Candle, Position, Timeframe };

export interface TimeframeCandles {
  '1m': Candle[];
  '5m': Candle[];
  '15m': Candle[];
  '1h': Candle[];
  '4h': Candle[];
}

export interface StrategySignal {
  action: 'buy' | 'sell' | 'none';
  confidence: number;
  reason: string;
}

export interface StrategyConfig {
  id: string;
  name: string;
  instrument: string;
  timeframe: Timeframe;
  rules: StrategyRule[];
  risk: {
    mode: 'percent' | 'fixed';
    value: number;
    maxLeverage: number;
  };
  stopLoss: {
    type: 'percent' | 'atr' | 'fixed';
    value: number;
  };
  takeProfit: {
    type: 'percent' | 'risk_reward' | 'fixed';
    value: number;
  };
}

export interface StrategyRule {
  type: 'indicator' | 'price' | 'volume' | 'time';
  indicator?: string;
  params?: Record<string, any>;
  condition: string;
  value: number | string;
}

export interface BracketState {
  position: Position | null;
  lastExecutionTime: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
}

export interface StrategyStatus {
  isRunning: boolean;
  strategyId: string | null;
  position: Position | null;
  lastSignal: StrategySignal | null;
  lastExecutionTime: number;
  stats: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnL: number;
    winRate: number;
  };
}

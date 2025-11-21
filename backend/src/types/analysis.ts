/**
 * Analysis State Types
 * Defines structure for strategy analysis and monitoring data
 */

export interface Checkpoint {
  id: string;
  label: string;
  status: 'met' | 'pending' | 'failed';
  value?: string;
  description?: string;
  timestamp: number;
}

export interface IndicatorState {
  emaFast: number | null;
  emaSlow: number | null;
  rsi: number | null;
  volume: number | null;
  volatility: number | null;
  // Extended scalping indicators
  atr?: number | null;
  emaFast3m?: number | null;
  emaSlow3m?: number | null;
  emaFast5m?: number | null;
  emaSlow5m?: number | null;
  trendScore?: number | null; // -3..+3
  pullbackReady?: boolean | null;
}

export interface SignalState {
  type: 'long' | 'short' | 'none';
  strength: number; // 0-100
  confidence: number; // 0-100
  reasons: string[];
}

export interface AnalysisState {
  strategyId: string;
  strategyName: string;
  status: 'initializing' | 'analyzing' | 'signal_detected' | 'position_open' | 'stopped';
  
  // Market data
  instrument: string;
  currentPrice: number | null;
  lastUpdated: number;
  
  // Indicators
  indicators: IndicatorState;
  
  // Signal analysis
  signal: SignalState;
  
  // Checkpoints (for UI display)
  checkpoints: Checkpoint[];
  
  // Data collection
  dataPoints: number;
  requiredDataPoints: number;
  
  // Timing
  cooldownUntil: number | null;
  nextCheckAt: number | null;
}

export interface PositionMetrics {
  strategyId: string;
  instrument: string;
  
  // Position details
  direction: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  amount: number;
  
  // Risk management
  stopLoss: number;
  takeProfit: number;
  
  // P&L
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  
  // Orders
  entryOrderId: string;
  slOrderId?: string;
  tpOrderId?: string;
  
  // Timing
  enteredAt: number;
  duration: number; // milliseconds
  
  // Analysis
  marketAnalysis?: {
    successProbability: number;
    riskLevel: 'low' | 'medium' | 'high';
    recommendation: string;
  };
}

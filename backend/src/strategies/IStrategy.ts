/**
 * IStrategy.ts
 * 
 * Purpose: Define unified interface for all trading strategies
 * Enables: Multi-strategy support, strategy hot-reload, testability
 * 
 * Key Concepts:
 * - Strategy is stateless (state managed externally)
 * - Pure functions (deterministic, testable)
 * - Broker-agnostic (works with any broker adapter)
 * 
 * Part of: Iteration 4 - Risk Engine + Strategy Registry
 */

import { PositionSizeInput } from '../risk/PositionSizer';
import type { Candle } from '../types/shared';

// Re-export for convenience
export type { Candle };

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Market data snapshot
 */
export interface MarketData {
  instrument: string;        // e.g., "BTC-PERPETUAL"
  price: number;             // Current market price
  timestamp: number;         // Unix timestamp (ms)
  bid: number;               // Best bid price
  ask: number;               // Best ask price
  volume24h?: number;        // 24h volume (optional)
  highPrice24h?: number;     // 24h high (optional)
  lowPrice24h?: number;      // 24h low (optional)
}

// Candle is now imported from shared types (see top of file)

/**
 * Strategy analysis result
 */
export interface AnalysisResult {
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;        // 0-100 (percentage)
  reason: string;            // Human-readable explanation
  indicators: Record<string, number>; // Indicator values
  metadata?: Record<string, any>;     // Additional strategy-specific data
}

/**
 * Trade signal with entry/exit levels
 */
export interface TradeSignal {
  side: 'buy' | 'sell';
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  confidence: number;        // 0-100
  reason: string;
  metadata?: Record<string, any>;
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  instrument: string;
  timeframe: string;         // e.g., "1m", "5m", "1h"
  riskPercent: number;       // Risk per trade (e.g., 5 = 5%)
  parameters: Record<string, any>; // Strategy-specific parameters
}

/**
 * Strategy metadata
 */
export interface StrategyMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];            // e.g., ["momentum", "trend-following"]
  defaultConfig: Partial<StrategyConfig>;
  requiredParameters: string[];
  optionalParameters: string[];
}

// ============================================================================
// Strategy Interface
// ============================================================================

/**
 * IStrategy - Unified interface for all trading strategies
 * 
 * Implementations must be:
 * - Stateless (no internal state)
 * - Deterministic (same input = same output)
 * - Testable (pure functions)
 * - Documented (metadata + comments)
 */
export interface IStrategy {
  /**
   * Strategy metadata (name, version, description, etc.)
   */
  readonly metadata: StrategyMetadata;

  /**
   * Initialize strategy with configuration
   * Called once when strategy is loaded
   */
  initialize(config: StrategyConfig): Promise<void>;

  /**
   * Analyze market data and return signal
   * Called on every tick/candle close
   * 
   * @param marketData - Current market snapshot
   * @param candles - Historical candle data
   * @returns Analysis result with signal and confidence
   */
  analyze(marketData: MarketData, candles: Candle[]): Promise<AnalysisResult>;

  /**
   * Generate trade signal from analysis
   * Called when analysis indicates LONG or SHORT
   * 
   * @param analysis - Analysis result from analyze()
   * @param marketData - Current market snapshot
   * @returns Complete trade signal with entry/exit levels
   */
  generateSignal(analysis: AnalysisResult, marketData: MarketData): Promise<TradeSignal>;

  /**
   * Calculate stop-loss price
   * 
   * @param entryPrice - Entry price
   * @param side - Trade side (buy/sell)
   * @param marketData - Current market snapshot
   * @returns Stop-loss price
   */
  calculateStopLoss(entryPrice: number, side: 'buy' | 'sell', marketData: MarketData): number;

  /**
   * Calculate take-profit price
   * 
   * @param entryPrice - Entry price
   * @param side - Trade side (buy/sell)
   * @param marketData - Current market snapshot
   * @returns Take-profit price
   */
  calculateTakeProfit(entryPrice: number, side: 'buy' | 'sell', marketData: MarketData): number;

  /**
   * Validate strategy configuration
   * Called before initialize()
   * 
   * @param config - Strategy configuration
   * @throws Error if configuration is invalid
   */
  validateConfig(config: StrategyConfig): void;

  /**
   * Cleanup resources
   * Called when strategy is stopped/unloaded
   */
  cleanup(): Promise<void>;
}

// ============================================================================
// Base Strategy Class
// ============================================================================

/**
 * BaseStrategy - Abstract base class for strategies
 * Provides common utilities and validation
 */
export abstract class BaseStrategy implements IStrategy {
  protected config!: StrategyConfig;
  protected initialized: boolean = false;

  abstract readonly metadata: StrategyMetadata;

  async initialize(config: StrategyConfig): Promise<void> {
    this.validateConfig(config);
    this.config = config;
    this.initialized = true;
    console.log(`[${this.metadata.name}] Initialized with config:`, config);
  }

  abstract analyze(marketData: MarketData, candles: Candle[]): Promise<AnalysisResult>;

  abstract generateSignal(analysis: AnalysisResult, marketData: MarketData): Promise<TradeSignal>;

  abstract calculateStopLoss(entryPrice: number, side: 'buy' | 'sell', marketData: MarketData): number;

  abstract calculateTakeProfit(entryPrice: number, side: 'buy' | 'sell', marketData: MarketData): number;

  validateConfig(config: StrategyConfig): void {
    // Validate required fields
    if (!config.instrument) {
      throw new Error('Strategy config missing required field: instrument');
    }
    if (!config.timeframe) {
      throw new Error('Strategy config missing required field: timeframe');
    }
    if (config.riskPercent === undefined || config.riskPercent <= 0 || config.riskPercent > 100) {
      throw new Error('Strategy config riskPercent must be between 0 and 100');
    }

    // Validate strategy-specific parameters
    for (const param of this.metadata.requiredParameters) {
      if (config.parameters[param] === undefined) {
        throw new Error(`Strategy config missing required parameter: ${param}`);
      }
    }

    console.log(`[${this.metadata.name}] Config validated successfully`);
  }

  async cleanup(): Promise<void> {
    this.initialized = false;
    console.log(`[${this.metadata.name}] Cleaned up`);
  }

  /**
   * Utility: Calculate percentage change
   */
  protected percentChange(from: number, to: number): number {
    return ((to - from) / from) * 100;
  }

  /**
   * Utility: Check if strategy is initialized
   */
  protected assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${this.metadata.name} not initialized. Call initialize() first.`);
    }
  }

  /**
   * Utility: Calculate risk/reward ratio
   */
  protected calculateRiskRewardRatio(
    entryPrice: number,
    stopLossPrice: number,
    takeProfitPrice: number
  ): number {
    const risk = Math.abs(entryPrice - stopLossPrice);
    const reward = Math.abs(takeProfitPrice - entryPrice);
    return reward / risk;
  }

  /**
   * Utility: Convert timeframe string to milliseconds
   */
  protected timeframeToMs(timeframe: string): number {
    const unit = timeframe.slice(-1);
    const value = parseInt(timeframe.slice(0, -1));

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: throw new Error(`Invalid timeframe: ${timeframe}`);
    }
  }
}

// ============================================================================
// Strategy Errors
// ============================================================================

export class StrategyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyError';
  }
}

export class StrategyNotFoundError extends StrategyError {
  constructor(strategyName: string) {
    super(`Strategy not found: ${strategyName}`);
    this.name = 'StrategyNotFoundError';
  }
}

export class StrategyConfigError extends StrategyError {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyConfigError';
  }
}

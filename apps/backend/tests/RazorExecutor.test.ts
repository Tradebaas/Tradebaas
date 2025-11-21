/**
 * Razor Executor Tests
 * Tests for Razor strategy analysis and signal generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RazorExecutor } from '../src/strategies/razor-executor';
import type { BackendDeribitClient } from '../src/deribit-client';

// Mock Deribit client
const createMockClient = (): BackendDeribitClient => ({
  getCandles: vi.fn().mockResolvedValue({
    close: Array.from({ length: 100 }, (_, i) => 50000 + Math.random() * 100),
    high: Array.from({ length: 100 }, () => 50050),
    low: Array.from({ length: 100 }, () => 49950),
    open: Array.from({ length: 100 }, () => 50000),
    volume: Array.from({ length: 100 }, () => 1000),
  }),
  getTicker: vi.fn().mockResolvedValue({
    last_price: 50000,
    best_bid_price: 49995,
    best_ask_price: 50005,
  }),
  getInstrument: vi.fn().mockResolvedValue({
    instrument_name: 'BTC-PERPETUAL',
    min_trade_amount: 10,
    tick_size: 0.5,
  }),
  getPositions: vi.fn().mockResolvedValue([]),
  getOpenOrders: vi.fn().mockResolvedValue([]),
  placeBuyOrder: vi.fn().mockResolvedValue({ order_id: 'buy-123' }),
  placeSellOrder: vi.fn().mockResolvedValue({ order_id: 'sell-123' }),
} as any);

describe('RazorExecutor', () => {
  let executor: RazorExecutor;
  let mockClient: BackendDeribitClient;

  beforeEach(() => {
    mockClient = createMockClient();
    
    const config = {
      instrument: 'BTC-PERPETUAL',
      tradeSize: 100,
      stopLossPercent: 0.5,
      takeProfitPercent: 1.0,
      maxConcurrentTrades: 1,
      maxDailyTrades: 150,
      cooldownMinutes: 5,
      minVolatility: 0.01,
      maxVolatility: 5.0,
      rsiOversold: 40,
      rsiOverbought: 60,
    };

    executor = new RazorExecutor(mockClient, 'test-strategy-1', 'Razor Test', config);
  });

  it('should initialize with correct state', () => {
    const state = executor.getAnalysisState();
    
    expect(state.strategyId).toBe('test-strategy-1');
    expect(state.strategyName).toBe('Razor Test');
    expect(state.instrument).toBe('BTC-PERPETUAL');
    expect(state.status).toMatch(/initializing|analyzing/);
  });

  it('should load historical candle data on initialization', async () => {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const state = executor.getAnalysisState();
    
    // Should have loaded candles
    expect(state.dataPoints).toBeGreaterThan(0);
    expect(mockClient.getCandles).toHaveBeenCalledWith('BTC-PERPETUAL', '1', 100);
  });

  it('should update analysis state on ticker update', async () => {
    // Wait for init
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await executor.onTicker(50100);
    
    const state = executor.getAnalysisState();
    expect(state.currentPrice).toBe(50100);
    expect(state.lastUpdated).toBeGreaterThan(0);
  });

  it('should calculate indicators when enough data is available', async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const state = executor.getAnalysisState();
    
    if (state.dataPoints >= state.requiredDataPoints) {
      expect(state.indicators.rsi).not.toBeNull();
      expect(state.indicators.volatility).not.toBeNull();
      expect(state.indicators.emaSlow).not.toBeNull();
    }
  });

  it('should generate signal when conditions are met', async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await executor.onTicker(50000);
    
    const state = executor.getAnalysisState();
    expect(state.signal).toBeDefined();
    expect(state.signal.type).toMatch(/long|short|none/);
    expect(state.signal.strength).toBeGreaterThanOrEqual(0);
    expect(state.signal.strength).toBeLessThanOrEqual(100);
  });
});

import { describe, it, expect } from 'vitest';
import { RiskEngine } from '../src/strategy-runner/RiskEngine';

describe('RiskEngine', () => {
  it('should calculate position size with percent risk', () => {
    const result = RiskEngine.calculatePosition({
      equity: 10000,
      riskMode: 'percent',
      riskValue: 2,
      entryPrice: 50000,
      stopPrice: 49000,
      maxLeverage: 10,
      minTradeAmount: 10,
      tickSize: 0.5,
    });
    
    expect(result.success).toBe(true);
    expect(result.riskAmount).toBe(200);
    expect(result.quantity).toBeGreaterThan(0);
  });
  
  it('should calculate position size with fixed risk', () => {
    const result = RiskEngine.calculatePosition({
      equity: 10000,
      riskMode: 'fixed',
      riskValue: 100,
      entryPrice: 50000,
      stopPrice: 49500,
      maxLeverage: 10,
      minTradeAmount: 10,
      tickSize: 0.5,
    });
    
    expect(result.success).toBe(true);
    expect(result.riskAmount).toBe(100);
  });
  
  it('should fail when quantity below minimum', () => {
    const result = RiskEngine.calculatePosition({
      equity: 100,
      riskMode: 'percent',
      riskValue: 1,
      entryPrice: 50000,
      stopPrice: 49000,
      maxLeverage: 10,
      minTradeAmount: 1000,
      tickSize: 0.5,
    });
    
    expect(result.success).toBe(false);
    expect(result.reason).toContain('below minimum');
  });
  
  it('should cap leverage at max', () => {
    const result = RiskEngine.calculatePosition({
      equity: 1000,
      riskMode: 'percent',
      riskValue: 50,
      entryPrice: 50000,
      stopPrice: 49900,
      maxLeverage: 10,
      minTradeAmount: 10,
      tickSize: 0.5,
    });
    
    expect(result.success).toBe(true);
    expect(result.leverage).toBeLessThanOrEqual(10);
  });
  
  it('should calculate stop loss for buy', () => {
    const stopLoss = RiskEngine.calculateStopLoss(
      50000,
      'buy',
      'percent',
      2,
      undefined,
      0.5
    );
    
    expect(stopLoss).toBe(49000);
  });
  
  it('should calculate stop loss for sell', () => {
    const stopLoss = RiskEngine.calculateStopLoss(
      50000,
      'sell',
      'percent',
      2,
      undefined,
      0.5
    );
    
    expect(stopLoss).toBe(51000);
  });
  
  it('should calculate take profit with risk reward', () => {
    const takeProfit = RiskEngine.calculateTakeProfit(
      50000,
      49000,
      'buy',
      'risk_reward',
      2,
      0.5
    );
    
    expect(takeProfit).toBe(52000);
  });
});

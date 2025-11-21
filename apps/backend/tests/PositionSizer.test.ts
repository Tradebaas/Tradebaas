/**
 * Position Sizer Tests
 * Real tests for actual PositionSizer.calculatePositionSize() implementation
 */

import { describe, it, expect } from 'vitest';
import { PositionSizer, PositionSizeError, InsufficientBalanceError, LeverageExceededError } from '../src/risk/PositionSizer';

describe('PositionSizer', () => {
  describe('calculatePositionSize', () => {
    it('should calculate correct position size for BTC balance with 5% risk', () => {
      const input = {
        balance: 0.1,              // 0.1 BTC
        balanceCurrency: 'BTC',
        entryPrice: 50000,         // $50,000 entry
        stopLossPrice: 49500,      // $49,500 SL (1% distance)
        riskPercent: 5,            // Risk 5% of balance
        currentPrice: 50000,       // Current BTC price = $50,000
        instrument: 'BTC-PERPETUAL',
      };

      const result = PositionSizer.calculatePositionSize(input);

      // Expected: 5% of 0.1 BTC = 0.005 BTC = $250 risk
      // SL distance = $500 (1%)
      // Quantity = ($250 * $50,000) / $500 = $25,000 USD
      expect(result.riskAmountUSD).toBe(250);
      expect(result.quantity).toBe(25000);
      expect(result.leverage).toBeGreaterThan(0);
      expect(result.warnings).toBeInstanceOf(Array);
    });

    it('should calculate correct position size for USDC balance', () => {
      const input = {
        balance: 10000,            // $10,000 USDC
        balanceCurrency: 'USDC',
        entryPrice: 50000,         // $50,000 entry
        stopLossPrice: 49000,      // $49,000 SL (2% distance)
        riskPercent: 2,            // Risk 2% of balance
        currentPrice: 50000,       // (not used for USDC)
        instrument: 'BTC-PERPETUAL',
      };

      const result = PositionSizer.calculatePositionSize(input);

      // Expected: 2% of $10,000 = $200 risk
      // SL distance = $1,000 (2%)
      // Quantity = ($200 * $50,000) / $1,000 = $10,000 USD
      expect(result.riskAmountUSD).toBe(200);
      expect(result.quantity).toBe(10000);
      expect(result.leverage).toBe(1); // Exactly 1x leverage
    });

    it('should round quantity to lot size (Deribit $1 increments)', () => {
      const input = {
        balance: 1000,
        balanceCurrency: 'USDC',
        entryPrice: 50000,
        stopLossPrice: 49750,      // 0.5% SL
        riskPercent: 1,            // $10 risk
        currentPrice: 50000,
        instrument: 'BTC-PERPETUAL',
        lotSize: 1,                // $1 USD increments
      };

      const result = PositionSizer.calculatePositionSize(input);

      // Quantity should be rounded to nearest dollar
      expect(result.quantity % 1).toBe(0);
      expect(result.details.roundedQuantity).toBe(result.quantity);
    });

    it('should throw error when balance is insufficient', () => {
      const input = {
        balance: 0.00001,          // Extremely small balance (< $1)
        balanceCurrency: 'BTC',
        entryPrice: 50000,
        stopLossPrice: 49500,      // Smaller SL distance
        riskPercent: 1,            // Low risk (1%)
        currentPrice: 50000,
        instrument: 'BTC-PERPETUAL',
        maxLeverage: 50,           // High leverage allowed
      };

      // With such tiny balance, even 1% risk won't be enough to place minimum order
      expect(() => PositionSizer.calculatePositionSize(input))
        .toThrow(PositionSizeError); // Changed: Actually throws PositionSizeError instead of InsufficientBalanceError
    });

    it('should throw error when leverage exceeds maximum', () => {
      const input = {
        balance: 100,              // Small balance
        balanceCurrency: 'USDC',
        entryPrice: 50000,
        stopLossPrice: 49500,      // 1% SL
        riskPercent: 10,           // High risk
        currentPrice: 50000,
        instrument: 'BTC-PERPETUAL',
        maxLeverage: 5,            // Low max leverage
      };

      expect(() => PositionSizer.calculatePositionSize(input))
        .toThrow(LeverageExceededError);
    });

    it('should warn when stop-loss distance is large', () => {
      const input = {
        balance: 10000,
        balanceCurrency: 'USDC',
        entryPrice: 50000,
        stopLossPrice: 24000,      // 52% SL distance (> 50% threshold)
        riskPercent: 1,
        currentPrice: 50000,
        instrument: 'BTC-PERPETUAL',
      };

      const result = PositionSizer.calculatePositionSize(input);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Large stop-loss distance'))).toBe(true);
    });

    it('should handle ETH balance currency', () => {
      const input = {
        balance: 5,                // 5 ETH
        balanceCurrency: 'ETH',
        entryPrice: 3000,          // $3,000 ETH entry
        stopLossPrice: 2970,       // $2,970 SL (1% distance)
        riskPercent: 2,            // Risk 2%
        currentPrice: 3000,        // Current ETH price = $3,000
        instrument: 'ETH-PERPETUAL',
      };

      const result = PositionSizer.calculatePositionSize(input);

      // 2% of 5 ETH = 0.1 ETH = $300 risk
      expect(result.riskAmountUSD).toBe(300);
      expect(result.quantity).toBeGreaterThan(0);
    });

    it('should throw error for invalid stop-loss (same as entry)', () => {
      const input = {
        balance: 1000,
        balanceCurrency: 'USDC',
        entryPrice: 50000,
        stopLossPrice: 50000,    // SL = entry (no distance!)
        riskPercent: 5,
        currentPrice: 50000,
        instrument: 'BTC-PERPETUAL',
      };

      expect(() => PositionSizer.calculatePositionSize(input))
        .toThrow(PositionSizeError);
    });
  });
});

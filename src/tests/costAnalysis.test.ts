import { describe, it, expect } from 'vitest';
import {
  calculateTradingCosts,
  calculateCompleteTradeCosts,
  getCostAnalysisSummary,
} from '@/lib/costAnalysis';

describe('Cost Analysis', () => {
  describe('calculateTradingCosts', () => {
    it('should calculate costs for market close scenario', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      expect(result.scenarios.marketClose.tradingFee).toBeCloseTo(0.5, 2);
      expect(result.scenarios.marketClose.tradingFeePercent).toBe(0.05);
      expect(result.scenarios.marketClose.details.feeType).toBe('taker');
    });

    it('should calculate costs for take profit scenario', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      expect(result.scenarios.takeProfitHit.tradingFee).toBeCloseTo(0.2, 2);
      expect(result.scenarios.takeProfitHit.tradingFeePercent).toBe(0.02);
      expect(result.scenarios.takeProfitHit.details.feeType).toBe('maker');
    });

    it('should calculate costs for stop loss scenario', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 109500,
        positionSize: 1000,
        leverage: 1,
      });

      expect(result.scenarios.stopLossHit.tradingFee).toBeCloseTo(0.5, 2);
      expect(result.scenarios.stopLossHit.tradingFeePercent).toBe(0.05);
      expect(result.scenarios.stopLossHit.details.feeType).toBe('taker');
    });

    it('should scale fees with leverage', () => {
      const noLeverage = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      const withLeverage = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 5,
      });

      // Fees should be the same percentage but on different notional values
      expect(withLeverage.scenarios.marketClose.tradingFee).toBeCloseTo(
        noLeverage.scenarios.marketClose.tradingFee,
        2
      );
      
      // But the notional value should be 5x
      expect(withLeverage.scenarios.marketClose.details.notionalValue).toBe(
        noLeverage.scenarios.marketClose.details.notionalValue
      );
    });

    it('should identify best case as take profit (lowest fees)', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      expect(result.summary.bestCase.scenario).toBe('tp_hit');
      expect(result.summary.bestCase.totalCost).toBeLessThan(
        result.summary.worstCase.totalCost
      );
    });

    it('should calculate average cost correctly', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      const manualAverage =
        (result.scenarios.marketClose.totalCost +
          result.scenarios.takeProfitHit.totalCost +
          result.scenarios.stopLossHit.totalCost) /
        3;

      expect(result.summary.averageCost).toBeCloseTo(manualAverage, 4);
    });
  });

  describe('calculateCompleteTradeCosts', () => {
    it('should include entry costs', () => {
      const result = calculateCompleteTradeCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      // Entry is always taker (market order)
      expect(result.entryCost).toBeCloseTo(0.5, 2);
    });

    it('should calculate best case as entry taker + exit maker', () => {
      const result = calculateCompleteTradeCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      // Entry taker (0.5) + Exit maker (0.2) = 0.7
      expect(result.totalCostRange.best).toBeCloseTo(0.7, 2);
    });

    it('should calculate worst case as entry taker + exit taker', () => {
      const result = calculateCompleteTradeCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      // Entry taker (0.5) + Exit taker (0.5) = 1.0
      expect(result.totalCostRange.worst).toBeCloseTo(1.0, 2);
    });

    it('should calculate impact on PnL correctly', () => {
      const result = calculateCompleteTradeCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      expect(result.impactOnPnL.best).toMatch(/0\.07/); // ~0.07%
      expect(result.impactOnPnL.worst).toMatch(/0\.10/); // ~0.10%
    });

    it('should handle high leverage scenarios', () => {
      const result = calculateCompleteTradeCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 5000,
        leverage: 50,
      });

      // With 50x leverage on $5000, notional is $250,000
      // Entry: $250,000 * 0.0005 = $125
      // Best exit: $250,000 * 0.0002 = $50
      // Total best: $175
      expect(result.entryCost).toBeCloseTo(2.5, 1);
      expect(result.totalCostRange.best).toBeGreaterThan(3);
    });
  });

  describe('getCostAnalysisSummary', () => {
    it('should format summary correctly', () => {
      const analysis = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 5,
      });

      const summary = getCostAnalysisSummary(analysis);

      expect(summary.bestScenario).toBe('tp hit');
      expect(summary.bestCost).toMatch(/\$/);
      expect(summary.worstScenario).toMatch(/stop loss hit|market close/);
      expect(summary.leverageImpact).toContain('5x');
    });

    it('should calculate cost difference', () => {
      const analysis = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      const summary = getCostAnalysisSummary(analysis);

      expect(summary.costDifference).toMatch(/\$/);
      expect(summary.costDifference).toMatch(/%/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small position sizes', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 10,
        leverage: 1,
      });

      expect(result.scenarios.marketClose.tradingFee).toBeCloseTo(0.005, 4);
      expect(result.scenarios.takeProfitHit.tradingFee).toBeCloseTo(0.002, 4);
    });

    it('should handle very large position sizes', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 100000,
        leverage: 1,
      });

      expect(result.scenarios.marketClose.tradingFee).toBeCloseTo(50, 2);
      expect(result.scenarios.takeProfitHit.tradingFee).toBeCloseTo(20, 2);
    });

    it('should handle maximum leverage (50x)', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 50,
      });

      expect(result.scenarios.marketClose.details.leverage).toBe(50);
      expect(result.scenarios.marketClose.details.notionalValue).toBe(1000);
    });

    it('should handle 1x leverage (no leverage)', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      expect(result.scenarios.marketClose.details.leverage).toBe(1);
      expect(result.scenarios.marketClose.details.notionalValue).toBe(1000);
    });

    it('should handle price going down (short or losing long)', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 109000,
        positionSize: 1000,
        leverage: 1,
      });

      // Fees should be the same regardless of direction
      expect(result.scenarios.marketClose.tradingFee).toBeCloseTo(0.5, 2);
      expect(result.scenarios.takeProfitHit.tradingFee).toBeCloseTo(0.2, 2);
    });
  });

  describe('Fee Percentages', () => {
    it('should maintain correct fee percentages across scenarios', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      expect(result.scenarios.marketClose.tradingFeePercent).toBe(0.05);
      expect(result.scenarios.takeProfitHit.tradingFeePercent).toBe(0.02);
      expect(result.scenarios.stopLossHit.tradingFeePercent).toBe(0.05);
    });

    it('should maintain correct total cost percentages', () => {
      const result = calculateTradingCosts({
        entryPrice: 110000,
        exitPrice: 110500,
        positionSize: 1000,
        leverage: 1,
      });

      // Total cost % should match trading fee % (no settlement fees)
      expect(result.scenarios.marketClose.totalCostPercent).toBe(0.05);
      expect(result.scenarios.takeProfitHit.totalCostPercent).toBe(0.02);
      expect(result.scenarios.stopLossHit.totalCostPercent).toBe(0.05);
    });
  });
});

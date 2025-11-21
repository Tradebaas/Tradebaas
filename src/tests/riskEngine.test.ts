import { describe, it, expect } from 'vitest';
import {
  calculatePosition,
  buildBracket,
  createBrokerRules,
  type RiskEngineInput,
  type BrokerRules,
} from '@/lib/riskEngine';

describe('Risk Engine - Position Sizing', () => {
  const defaultBrokerRules: BrokerRules = createBrokerRules(50, 0.5, 10, 10, 10);

  describe('calculatePosition - Valid Scenarios', () => {
    it('should calculate position with percent risk mode', () => {
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'percent',
        riskValue: 2,
        entryPrice: 50000,
        stopPrice: 49000,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.quantity).toBeGreaterThan(0);
        expect(result.notional).toBeGreaterThan(0);
        expect(result.effectiveLeverage).toBeLessThanOrEqual(50);
        expect(result.quantity).toBeGreaterThanOrEqual(10);
      }
    });

    it('should calculate position with fixed risk mode', () => {
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'fixed',
        riskValue: 100,
        entryPrice: 50000,
        stopPrice: 49000,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.quantity).toBeGreaterThan(0);
        expect(result.notional).toBeGreaterThan(0);
      }
    });

    it('should respect broker max leverage cap', () => {
  const strictRules = createBrokerRules(10, 0.5, 10, 10, 10);
      const input: RiskEngineInput = {
        equity: 100,
        riskMode: 'fixed',
        riskValue: 50,
        entryPrice: 50000,
        stopPrice: 49900,
        brokerRules: strictRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.effectiveLeverage).toBeLessThanOrEqual(10);
        expect(result.warnings).toContain('Leverage begrensd tot 10x (broker limiet)');
      }
    });

    it('should round quantity to lot size', () => {
  const rules = createBrokerRules(50, 0.5, 5, 5, 5);
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'fixed',
        riskValue: 50,
        entryPrice: 50000,
        stopPrice: 49000,
        brokerRules: rules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.quantity % 5).toBe(0);
      }
    });

    it('should warn on high leverage', () => {
      const input: RiskEngineInput = {
        equity: 100,
        riskMode: 'fixed',
        riskValue: 40,
        entryPrice: 50000,
        stopPrice: 49900,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.effectiveLeverage).toBeGreaterThan(10);
        expect(result.warnings.some(w => w.includes('Hoge leverage'))).toBe(true);
      }
    });
  });

  describe('calculatePosition - Error Cases', () => {
    it('should reject zero equity', () => {
      const input: RiskEngineInput = {
        equity: 0,
        riskMode: 'percent',
        riskValue: 2,
        entryPrice: 50000,
        stopPrice: 49000,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('Equity moet groter zijn dan nul');
      }
    });

    it('should reject negative equity', () => {
      const input: RiskEngineInput = {
        equity: -100,
        riskMode: 'percent',
        riskValue: 2,
        entryPrice: 50000,
        stopPrice: 49000,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(false);
    });

    it('should reject zero entry price', () => {
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'percent',
        riskValue: 2,
        entryPrice: 0,
        stopPrice: 49000,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('Entry prijs');
      }
    });

    it('should reject zero stop distance', () => {
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'percent',
        riskValue: 2,
        entryPrice: 50000,
        stopPrice: 50000,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('Stop prijs kan niet gelijk zijn aan entry prijs');
      }
    });

    it('should reject percent out of range', () => {
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'percent',
        riskValue: 60,
        entryPrice: 50000,
        stopPrice: 49000,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('0 en 50');
      }
    });

    it('should reject fixed risk exceeding 50% of equity', () => {
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'fixed',
        riskValue: 600,
        entryPrice: 50000,
        stopPrice: 49000,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('50% van equity');
      }
    });

    it('should reject position below minimum trade amount', () => {
      const input: RiskEngineInput = {
        equity: 10,
        riskMode: 'fixed',
        riskValue: 0.1,
        entryPrice: 50000,
        stopPrice: 49000,
        brokerRules: defaultBrokerRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toContain('minimale trade hoeveelheid');
      }
    });
  });

  describe('buildBracket - Valid Scenarios', () => {
    it('should build bracket for buy order', () => {
      const bracket = buildBracket('buy', 50000, 49000, 2, 0.5);
      
      expect(bracket.stopLoss).toBe(49000);
      expect(bracket.takeProfit).toBeGreaterThan(50000);
      expect(bracket.takeProfit).toBe(52000);
    });

    it('should build bracket for sell order', () => {
      const bracket = buildBracket('sell', 50000, 51000, 2, 0.5);
      
      expect(bracket.stopLoss).toBe(51000);
      expect(bracket.takeProfit).toBeLessThan(50000);
      expect(bracket.takeProfit).toBe(48000);
    });

    it('should round prices to tick size', () => {
      const bracket = buildBracket('buy', 50000.7, 49000.3, 2, 0.5);
      
      expect(bracket.stopLoss % 0.5).toBe(0);
      expect(bracket.takeProfit % 0.5).toBe(0);
    });

    it('should apply risk reward ratio correctly', () => {
      const entry = 50000;
      const stop = 49000;
      const distance = 1000;
      const rrRatio = 3;
      
      const bracket = buildBracket('buy', entry, stop, rrRatio, 0.5);
      
      expect(bracket.takeProfit).toBe(entry + (distance * rrRatio));
    });
  });

  describe('buildBracket - Error Cases', () => {
    it('should reject zero entry price', () => {
      expect(() => {
        buildBracket('buy', 0, 49000, 2, 0.5);
      }).toThrow('Ongeldige bracket parameters');
    });

    it('should reject zero stop price', () => {
      expect(() => {
        buildBracket('buy', 50000, 0, 2, 0.5);
      }).toThrow('Ongeldige bracket parameters');
    });

    it('should reject zero risk reward ratio', () => {
      expect(() => {
        buildBracket('buy', 50000, 49000, 0, 0.5);
      }).toThrow('Ongeldige bracket parameters');
    });

    it('should reject invalid stop direction for buy', () => {
      expect(() => {
        buildBracket('buy', 50000, 51000, 2, 0.5);
      }).toThrow('Voor buy orders moet stop prijs onder entry prijs liggen');
    });

    it('should reject invalid stop direction for sell', () => {
      expect(() => {
        buildBracket('sell', 50000, 49000, 2, 0.5);
      }).toThrow('Voor sell orders moet stop prijs boven entry prijs liggen');
    });
  });

  describe('Broker-Specific Rules', () => {
    it('should handle Deribit rules (50x leverage)', () => {
  const deribitRules = createBrokerRules(50, 0.5, 10, 10, 10);
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'percent',
        riskValue: 2,
        entryPrice: 50000,
        stopPrice: 49000,
        brokerRules: deribitRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.effectiveLeverage).toBeLessThanOrEqual(50);
      }
    });

    it('should handle Kraken rules (5x leverage)', () => {
  const krakenRules = createBrokerRules(5, 0.1, 0.001, 0.001, 1);
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'percent',
        riskValue: 10,
        entryPrice: 50000,
        stopPrice: 45000,
        brokerRules: krakenRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.effectiveLeverage).toBeLessThanOrEqual(5);
      }
    });

    it('should handle Binance rules (125x leverage)', () => {
  const binanceRules = createBrokerRules(125, 0.1, 1, 1, 1);
      const input: RiskEngineInput = {
        equity: 1000,
        riskMode: 'percent',
        riskValue: 1,
        entryPrice: 50000,
        stopPrice: 49500,
        brokerRules: binanceRules,
      };

      const result = calculatePosition(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.effectiveLeverage).toBeLessThanOrEqual(125);
      }
    });
  });
});

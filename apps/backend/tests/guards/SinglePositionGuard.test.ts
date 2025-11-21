import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeribitBroker, OrderValidationError } from '../../src/brokers/DeribitBroker';

describe('Single Position Guard (GUARD-001)', () => {
  let broker: DeribitBroker;

  beforeEach(() => {
    broker = new DeribitBroker();
  });

  describe('canOpenPosition()', () => {
    it('should return true when no positions exist', async () => {
      // Mock getPositions to return empty array
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([]);

      const canOpen = await broker.canOpenPosition();
      expect(canOpen).toBe(true);
    });

    it('should return false when position exists', async () => {
      // Mock getPositions to return open position
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'BTC-PERPETUAL',
          size: 1000,
          average_price: 50000,
          mark_price: 50100,
          total_profit_loss: 100,
          leverage: 5,
        } as any,
      ]);

      const canOpen = await broker.canOpenPosition();
      expect(canOpen).toBe(false);
    });

    it('should return true when specific instrument has no position', async () => {
      // Mock getPositions to return position on different instrument
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'ETH-PERPETUAL',
          size: 1000,
          average_price: 3000,
          mark_price: 3010,
          total_profit_loss: 10,
          leverage: 3,
        } as any,
      ]);

      const canOpen = await broker.canOpenPosition('BTC-PERPETUAL');
      expect(canOpen).toBe(true);
    });

    it('should return false when specific instrument has position', async () => {
      // Mock getPositions to return position on specific instrument
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'BTC-PERPETUAL',
          size: 1000,
          average_price: 50000,
          mark_price: 50100,
          total_profit_loss: 100,
          leverage: 5,
        } as any,
      ]);

      const canOpen = await broker.canOpenPosition('BTC-PERPETUAL');
      expect(canOpen).toBe(false);
    });

    it('should ignore closed positions (size = 0)', async () => {
      // Mock getPositions to return closed position
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'BTC-PERPETUAL',
          size: 0, // Closed position
          average_price: 50000,
          mark_price: 50100,
          total_profit_loss: 0,
          leverage: 0,
        } as any,
      ]);

      const canOpen = await broker.canOpenPosition();
      expect(canOpen).toBe(true);
    });
  });

  describe('hasOpenPosition()', () => {
    it('should return false when no positions exist', async () => {
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([]);

      const hasPosition = await broker.hasOpenPosition();
      expect(hasPosition).toBe(false);
    });

    it('should return true when position exists', async () => {
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'BTC-PERPETUAL',
          size: 1000,
          average_price: 50000,
          mark_price: 50100,
          total_profit_loss: 100,
          leverage: 5,
        } as any,
      ]);

      const hasPosition = await broker.hasOpenPosition();
      expect(hasPosition).toBe(true);
    });

    it('should check specific instrument correctly', async () => {
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'ETH-PERPETUAL',
          size: 500,
          average_price: 3000,
          mark_price: 3010,
          total_profit_loss: 5,
          leverage: 2,
        } as any,
      ]);

      const hasBTC = await broker.hasOpenPosition('BTC-PERPETUAL');
      const hasETH = await broker.hasOpenPosition('ETH-PERPETUAL');

      expect(hasBTC).toBe(false);
      expect(hasETH).toBe(true);
    });
  });

  describe('getOpenPositions()', () => {
    it('should return empty array when no positions', async () => {
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([]);

      const positions = await broker.getOpenPositions();
      expect(positions).toEqual([]);
    });

    it('should return formatted position data', async () => {
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'BTC-PERPETUAL',
          size: 1000,
          average_price: 50000,
          mark_price: 50100,
          total_profit_loss: 100,
          leverage: 5,
        } as any,
      ]);

      const positions = await broker.getOpenPositions();

      expect(positions).toHaveLength(1);
      expect(positions[0]).toEqual({
        instrument: 'BTC-PERPETUAL',
        size: 1000,
        side: 'long',
        entryPrice: 50000,
        markPrice: 50100,
        unrealizedPnl: 100,
        leverage: 5,
      });
    });

    it('should detect short position correctly', async () => {
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'BTC-PERPETUAL',
          size: -1000, // Negative = short
          average_price: 50000,
          mark_price: 49900,
          total_profit_loss: 100,
          leverage: 3,
        } as any,
      ]);

      const positions = await broker.getOpenPositions();

      expect(positions[0].side).toBe('short');
      expect(positions[0].size).toBe(1000); // Absolute value
    });

    it('should handle multiple positions', async () => {
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'BTC-PERPETUAL',
          size: 1000,
          average_price: 50000,
          mark_price: 50100,
          total_profit_loss: 100,
          leverage: 5,
        } as any,
        {
          instrument_name: 'ETH-PERPETUAL',
          size: -500,
          average_price: 3000,
          mark_price: 2990,
          total_profit_loss: 5,
          leverage: 2,
        } as any,
      ]);

      const positions = await broker.getOpenPositions();

      expect(positions).toHaveLength(2);
      expect(positions[0].instrument).toBe('BTC-PERPETUAL');
      expect(positions[0].side).toBe('long');
      expect(positions[1].instrument).toBe('ETH-PERPETUAL');
      expect(positions[1].side).toBe('short');
    });
  });

  describe('placeOCOWithRiskManagement() with position guard', () => {
    it('should reject order when position already exists', async () => {
      // Mock existing position
      vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
        {
          instrument_name: 'BTC-PERPETUAL',
          size: 1000,
          average_price: 50000,
          mark_price: 50100,
          total_profit_loss: 100,
          leverage: 5,
        } as any,
      ]);

      // Attempt to place order
      await expect(
        broker.placeOCOWithRiskManagement({
          instrument: 'BTC-PERPETUAL',
          side: 'buy',
          stopLossPrice: 49000,
          takeProfitPrice: 52000,
          riskPercent: 5,
        })
      ).rejects.toThrow(OrderValidationError);

      await expect(
        broker.placeOCOWithRiskManagement({
          instrument: 'BTC-PERPETUAL',
          side: 'buy',
          stopLossPrice: 49000,
          takeProfitPrice: 52000,
          riskPercent: 5,
        })
      ).rejects.toThrow('position already exists');
    });
  });

  describe('Error handling', () => {
    it('should propagate API errors', async () => {
      vi.spyOn(broker['client'], 'getPositions').mockRejectedValue(
        new Error('API connection failed')
      );

      await expect(broker.canOpenPosition()).rejects.toThrow('API connection failed');
      await expect(broker.hasOpenPosition()).rejects.toThrow('API connection failed');
      await expect(broker.getOpenPositions()).rejects.toThrow('API connection failed');
    });

    it('should handle network timeouts', async () => {
      vi.spyOn(broker['client'], 'getPositions').mockRejectedValue(
        new Error('Request timeout')
      );

      await expect(broker.canOpenPosition()).rejects.toThrow('Request timeout');
    });
  });
});

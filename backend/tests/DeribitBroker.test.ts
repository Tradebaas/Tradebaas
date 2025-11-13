import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeribitBroker } from '../src/brokers/DeribitBroker';
import { DeribitClient } from '../../src/lib/deribitClient';

vi.mock('../../src/lib/deribitClient');

// TODO: These tests are outdated - they try to use DeribitClient but DeribitBroker uses BackendDeribitClient
// These need to be rewritten with proper mocks or moved to integration test suite with real credentials
describe.skip('DeribitBroker (OUTDATED - needs refactor)', () => {
  let broker: DeribitBroker;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      authenticate: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getAccountSummary: vi.fn().mockResolvedValue({
        available_funds: 1000,
        equity: 1200,
      }),
      placeBuyOrder: vi.fn().mockResolvedValue({
        order_id: 'test-order-123',
        order_state: 'open',
      }),
      placeSellOrder: vi.fn().mockResolvedValue({
        order_id: 'test-order-456',
        order_state: 'filled',
      }),
      cancelOrder: vi.fn().mockResolvedValue(undefined),
      cancelAllOrders: vi.fn().mockResolvedValue(undefined),
      getTradingViewChartData: vi.fn().mockResolvedValue({
        ticks: [1000, 2000, 3000],
        open: [100, 101, 102],
        high: [105, 106, 107],
        low: [99, 100, 101],
        close: [103, 104, 105],
        volume: [1000, 1100, 1200],
      }),
      getInstruments: vi.fn().mockResolvedValue([
        {
          instrument_name: 'BTC_USDC-PERPETUAL',
          min_trade_amount: 10,
          tick_size: 0.5,
          max_leverage: 50,
        },
      ]),
      subscribeToTrades: vi.fn(),
      subscribeToOrders: vi.fn(),
      unsubscribeFromChannel: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(DeribitClient).mockImplementation(() => mockClient as any);
    broker = new DeribitBroker();
  });

  describe('connect', () => {
    it('should connect successfully with valid credentials', async () => {
      await broker.connect({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: false,
      });

      expect(mockClient.authenticate).toHaveBeenCalledWith({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });
      expect(broker.getConnectionStatus()).toBe('connected');
    });

    it('should handle connection errors', async () => {
      mockClient.authenticate.mockRejectedValueOnce(new Error('Auth failed'));

      await expect(
        broker.connect({
          apiKey: 'invalid-key',
          apiSecret: 'invalid-secret',
        })
      ).rejects.toThrow('Auth failed');

      expect(broker.getConnectionStatus()).toBe('error');
    });

    it('should connect to testnet when specified', async () => {
      await broker.connect({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
      });

      expect(broker.getConnectionStatus()).toBe('connected');
    });
  });

  describe('getBalance', () => {
    it('should fetch balance correctly', async () => {
      await broker.connect({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const balances = await broker.getBalance('USDC');

      expect(balances).toHaveLength(1);
      expect(balances[0]).toEqual({
        currency: 'USDC',
        available: 1000,
        total: 1200,
        locked: 200,
      });
    });

    it('should default to USDC if no currency specified', async () => {
      await broker.connect({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const balances = await broker.getBalance();

      expect(mockClient.getAccountSummary).toHaveBeenCalledWith('USDC');
      expect(balances[0].currency).toBe('USDC');
    });
  });

  describe('placeOrder', () => {
    beforeEach(async () => {
      await broker.connect({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });
    });

    it('should place a simple buy order', async () => {
      const order = await broker.placeOrder({
        instrument: 'BTC_USDC-PERPETUAL',
        side: 'buy',
        type: 'market',
        amount: 50,
        label: 'test-order',
      });

      expect(mockClient.placeBuyOrder).toHaveBeenCalledWith(
        'BTC_USDC-PERPETUAL',
        'market',
        50,
        undefined,
        'test-order',
        undefined
      );
      expect(order.orderId).toBe('test-order-123');
      expect(order.side).toBe('buy');
      expect(order.status).toBe('open');
    });

    it('should place a sell order', async () => {
      const order = await broker.placeOrder({
        instrument: 'BTC_USDC-PERPETUAL',
        side: 'sell',
        type: 'market',
        amount: 50,
      });

      expect(mockClient.placeSellOrder).toHaveBeenCalled();
      expect(order.orderId).toBe('test-order-456');
      expect(order.status).toBe('filled');
    });

    it('should place order with OTOCO (TP and SL)', async () => {
      const order = await broker.placeOrder({
        instrument: 'BTC_USDC-PERPETUAL',
        side: 'buy',
        type: 'market',
        amount: 50,
        otocoConfig: {
          takeProfit: {
            type: 'take_limit',
            price: 110000,
            trigger: 'mark_price',
          },
          stopLoss: {
            type: 'stop_market',
            triggerPrice: 95000,
            trigger: 'mark_price',
          },
        },
      });

      expect(mockClient.placeBuyOrder).toHaveBeenCalledWith(
        'BTC_USDC-PERPETUAL',
        'market',
        50,
        undefined,
        undefined,
        expect.arrayContaining([
          expect.objectContaining({
            type: 'take_limit',
            price: 110000,
            reduce_only: true,
          }),
          expect.objectContaining({
            type: 'stop_market',
            trigger_price: 95000,
            reduce_only: true,
          }),
        ])
      );
    });
  });

  describe('getCandles', () => {
    beforeEach(async () => {
      await broker.connect({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });
    });

    it('should fetch candles with correct timeframe conversion', async () => {
      const candles = await broker.getCandles('BTC_USDC-PERPETUAL', '5m', 3);

      expect(candles).toHaveLength(3);
      expect(candles[0]).toEqual({
        timestamp: 1000,
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000,
      });
    });
  });

  describe('getInstrumentInfo', () => {
    beforeEach(async () => {
      await broker.connect({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });
    });

    it('should fetch instrument info correctly', async () => {
      const info = await broker.getInstrumentInfo('BTC_USDC-PERPETUAL');

      expect(info).toEqual({
        minTradeAmount: 10,
        tickSize: 0.5,
        maxLeverage: 50,
        amountStep: 10,
      });
    });

    it('should throw error for unknown instrument', async () => {
      await expect(
        broker.getInstrumentInfo('UNKNOWN-INSTRUMENT')
      ).rejects.toThrow('Instrument UNKNOWN-INSTRUMENT not found');
    });
  });

  describe('cancelOrder', () => {
    beforeEach(async () => {
      await broker.connect({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });
    });

    it('should cancel order by ID', async () => {
      await broker.cancelOrder('test-order-123', 'BTC_USDC-PERPETUAL');

      expect(mockClient.cancelOrder).toHaveBeenCalledWith('test-order-123');
    });
  });

  describe('cancelAllOrders', () => {
    beforeEach(async () => {
      await broker.connect({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });
    });

    it('should cancel all orders for instrument', async () => {
      await broker.cancelAllOrders('BTC_USDC-PERPETUAL');

      expect(mockClient.cancelAllOrders).toHaveBeenCalledWith('BTC_USDC-PERPETUAL');
    });
  });
});

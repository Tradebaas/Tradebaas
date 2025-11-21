import { describe, it, expect, vi } from 'vitest';
import { handleGetBrokers, handleConnectTest } from '../src/api';

vi.mock('../src/brokers/DeribitBroker');

describe('API Handlers', () => {
  describe('handleGetBrokers', () => {
    it('should return list of all 15 supported brokers', async () => {
      const response = await handleGetBrokers();

      expect(response.success).toBe(true);
      expect(response.brokers).toHaveLength(15);
      
      const brokerIds = response.brokers.map(b => b.id);
      expect(brokerIds).toContain('deribit');
      expect(brokerIds).toContain('binance');
      expect(brokerIds).toContain('bybit');
      expect(brokerIds).toContain('okx');
      expect(brokerIds).toContain('kraken');
      expect(brokerIds).toContain('bitget');
      expect(brokerIds).toContain('kucoin');
      expect(brokerIds).toContain('mexc');
      expect(brokerIds).toContain('gateio');
      expect(brokerIds).toContain('bitmex');
      expect(brokerIds).toContain('huobi');
      expect(brokerIds).toContain('phemex');
      expect(brokerIds).toContain('coinbase');
      expect(brokerIds).toContain('bitstamp');
      expect(brokerIds).toContain('bitfinex');
    });

    it('should return broker metadata with all required fields', async () => {
      const response = await handleGetBrokers();
      const deribit = response.brokers.find(b => b.id === 'deribit');

      expect(deribit).toBeDefined();
      expect(deribit?.name).toBe('Deribit');
      expect(deribit?.maxLeverage).toBe(50);
      expect(deribit?.supportedPairs).toContain('BTC_USDC-PERPETUAL');
      expect(deribit?.docsURL).toBe('https://docs.deribit.com');
      expect(deribit?.features.perpetuals).toBe(true);
      expect(deribit?.features.options).toBe(true);
      expect(deribit?.testnetAvailable).toBe(true);
    });

    it('should include feature flags for each broker', async () => {
      const response = await handleGetBrokers();

      response.brokers.forEach(broker => {
        expect(broker.features).toHaveProperty('spot');
        expect(broker.features).toHaveProperty('futures');
        expect(broker.features).toHaveProperty('perpetuals');
        expect(broker.features).toHaveProperty('options');
        expect(broker.features).toHaveProperty('websocket');
      });
    });
  });

  describe('handleConnectTest', () => {
    it('should reject unsupported broker', async () => {
      const response = await handleConnectTest('unsupported-broker', {
        apiKey: 'test',
        apiSecret: 'test',
      });

      expect(response.success).toBe(false);
      expect(response.message).toBe('Broker not supported');
    });

    it('should return error for stub brokers', async () => {
      const response = await handleConnectTest('binance', {
        apiKey: 'test',
        apiSecret: 'test',
      });

      expect(response.success).toBe(false);
      expect(response.brokerId).toBe('binance');
      expect(response.error).toContain('not yet implemented');
    });
  });
});

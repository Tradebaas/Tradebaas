import { BrokerAdapter } from './broker';
import { BitgetAdapter } from './bitget';

export type SupportedBroker = 'bitget' | 'binance' | 'bybit' | 'okx';

export interface BrokerConfig {
  name: SupportedBroker;
  apiKey: string;
  secret: string;
  passphrase?: string;
  testnet?: boolean;
  sandbox?: boolean;
  additionalConfig?: Record<string, any>;
}

/**
 * Factory class for creating broker adapters
 * Makes it easy to add new exchanges without changing core logic
 */
export class BrokerFactory {
  private static instances: Map<string, BrokerAdapter> = new Map();

  /**
   * Create or get cached broker adapter instance
   */
  static createBroker(config: BrokerConfig): BrokerAdapter {
    const key = `${config.name}-${config.testnet ? 'test' : 'live'}`;
    
    if (this.instances.has(key)) {
      return this.instances.get(key)!;
    }

    let adapter: BrokerAdapter;

    switch (config.name) {
      case 'bitget':
        adapter = new BitgetAdapter();
        break;
      
      case 'binance':
        // Future implementation
        throw new Error('Binance adapter not implemented yet');
      
      case 'bybit':
        // Future implementation  
        throw new Error('Bybit adapter not implemented yet');
      
      case 'okx':
        // Future implementation
        throw new Error('OKX adapter not implemented yet');
      
      default:
        throw new Error(`Unsupported broker: ${config.name}`);
    }

    this.instances.set(key, adapter);
    return adapter;
  }

  /**
   * Get list of supported brokers
   */
  static getSupportedBrokers(): SupportedBroker[] {
    return ['bitget', 'binance', 'bybit', 'okx'];
  }

  /**
   * Check if broker is supported
   */
  static isBrokerSupported(name: string): name is SupportedBroker {
    return this.getSupportedBrokers().includes(name as SupportedBroker);
  }

  /**
   * Clear cached instances (useful for testing)
   */
  static clearCache(): void {
    this.instances.clear();
  }

  /**
   * Get broker adapter by name (if already created)
   */
  static getBroker(name: SupportedBroker, testnet: boolean = false): BrokerAdapter | undefined {
    const key = `${name}-${testnet ? 'test' : 'live'}`;
    return this.instances.get(key);
  }

  /**
   * Remove broker from cache
   */
  static removeBroker(name: SupportedBroker, testnet: boolean = false): void {
    const key = `${name}-${testnet ? 'test' : 'live'}`;
    this.instances.delete(key);
  }
}

/**
 * Broker capability detection
 */
export class BrokerCapabilities {
  static getCapabilities(brokerName: SupportedBroker) {
    switch (brokerName) {
      case 'bitget':
        return {
          spot: true,
          futures: true,
          options: false,
          margin: true,
          lending: false,
          staking: false,
          realtime: true,
          orderTypes: ['market', 'limit', 'stop', 'stop_limit'],
          timeInForce: ['GTC', 'IOC', 'FOK'],
          maxLeverage: 125,
          supportedCoins: ['USDT', 'USDC', 'BTC', 'ETH'],
          regions: ['global'],
          fees: {
            maker: 0.0002, // 0.02%
            taker: 0.0006  // 0.06%
          }
        };
      
      case 'binance':
        return {
          spot: true,
          futures: true,
          options: true,
          margin: true,
          lending: true,
          staking: true,
          realtime: true,
          orderTypes: ['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'],
          timeInForce: ['GTC', 'IOC', 'FOK'],
          maxLeverage: 125,
          supportedCoins: ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB'],
          regions: ['global', 'us'],
          fees: {
            maker: 0.0001, // 0.01%
            taker: 0.0001  // 0.01%
          }
        };
      
      case 'bybit':
        return {
          spot: true,
          futures: true,
          options: true,
          margin: true,
          lending: false,
          staking: false,
          realtime: true,
          orderTypes: ['market', 'limit', 'stop', 'stop_limit'],
          timeInForce: ['GTC', 'IOC', 'FOK'],
          maxLeverage: 100,
          supportedCoins: ['USDT', 'USDC', 'BTC', 'ETH'],
          regions: ['global'],
          fees: {
            maker: 0.0001, // 0.01%
            taker: 0.0006  // 0.06%
          }
        };
      
      case 'okx':
        return {
          spot: true,
          futures: true,
          options: true,
          margin: true,
          lending: true,
          staking: false,
          realtime: true,
          orderTypes: ['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'],
          timeInForce: ['GTC', 'IOC', 'FOK'],
          maxLeverage: 125,
          supportedCoins: ['USDT', 'USDC', 'BTC', 'ETH', 'OKB'],
          regions: ['global'],
          fees: {
            maker: 0.0008, // 0.08%
            taker: 0.001   // 0.1%
          }
        };
      
      default:
        return null;
    }
  }
}

/**
 * Multi-broker aggregator for executing the same operation across multiple exchanges
 */
export class MultiBrokerManager {
  private brokers: Map<SupportedBroker, BrokerAdapter> = new Map();

  addBroker(config: BrokerConfig): void {
    const adapter = BrokerFactory.createBroker(config);
    this.brokers.set(config.name, adapter);
  }

  removeBroker(name: SupportedBroker): void {
    this.brokers.delete(name);
  }

  getBroker(name: SupportedBroker): BrokerAdapter | undefined {
    return this.brokers.get(name);
  }

  getAllBrokers(): BrokerAdapter[] {
    return Array.from(this.brokers.values());
  }

  async executeOnAll<T>(
    operation: (broker: BrokerAdapter) => Promise<T>
  ): Promise<Array<{ broker: string; result?: T; error?: Error }>> {
    const results = await Promise.allSettled(
      Array.from(this.brokers.entries()).map(async ([name, broker]) => {
        try {
          const result = await operation(broker);
          return { broker: name, result };
        } catch (error) {
          return { broker: name, error: error as Error };
        }
      })
    );

    return results.map((result, index) => {
      const brokerName = Array.from(this.brokers.keys())[index];
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return { broker: brokerName, error: result.reason };
      }
    });
  }

  // Aggregated operations
  async getAllBalances(): Promise<Array<{ broker: string; balances?: any; error?: Error }>> {
    return this.executeOnAll(broker => broker.getBalances());
  }

  async getAllPositions(): Promise<Array<{ broker: string; positions?: any; error?: Error }>> {
    return this.executeOnAll(broker => broker.getPositions());
  }

  async getAllTickers(symbol: string): Promise<Array<{ broker: string; ticker?: any; error?: Error }>> {
    return this.executeOnAll(broker => broker.getTicker(symbol));
  }
}

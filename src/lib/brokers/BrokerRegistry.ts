import { IBroker } from './IBroker';
import { DeribitBroker } from './DeribitBroker';
import { BinanceBroker } from './BinanceBroker';
import { KrakenBroker } from './KrakenBroker';
import { BitgetBroker } from './BitgetBroker';

export class BrokerRegistry {
  private static brokers: Map<string, () => IBroker> = new Map<string, () => IBroker>([
    ['deribit', (): IBroker => new DeribitBroker()],
    ['binance', (): IBroker => new BinanceBroker()],
    ['kraken', (): IBroker => new KrakenBroker()],
    ['bitget', (): IBroker => new BitgetBroker()],
  ]);

  static createBroker(brokerId: string): IBroker {
    const factory = this.brokers.get(brokerId.toLowerCase());
    
    if (!factory) {
      throw new Error(`Broker '${brokerId}' is not supported`);
    }

    return factory();
  }

  static getSupportedBrokers(): string[] {
    return Array.from(this.brokers.keys());
  }

  static isBrokerSupported(brokerId: string): boolean {
    return this.brokers.has(brokerId.toLowerCase());
  }
}

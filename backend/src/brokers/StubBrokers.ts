import { IBroker, Credentials, Balance, Order, Trade, Candle, PlaceOrderParams } from './IBroker';

const createStubBroker = (brokerName: string): new () => IBroker => {
  return class StubBroker implements IBroker {
    private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';

    async connect(credentials: Credentials): Promise<void> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async disconnect(): Promise<void> {
      this.connectionStatus = 'disconnected';
    }

    getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' | 'error' {
      return this.connectionStatus;
    }

    async getBalance(currency?: string): Promise<Balance[]> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async placeOrder(params: PlaceOrderParams): Promise<Order> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async cancelOrder(orderId: string, instrument: string): Promise<void> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async cancelAllOrders(instrument?: string): Promise<void> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async getOrder(orderId: string, instrument: string): Promise<Order> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async getCandles(instrument: string, timeframe: string, limit?: number): Promise<Candle[]> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async subscribeTrades(instrument: string, callback: (trade: Trade) => void): Promise<void> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async subscribeOrders(instrument: string, callback: (order: Order) => void): Promise<void> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async unsubscribe(channel: string): Promise<void> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async getInstrumentInfo(instrument: string): Promise<{
      minTradeAmount: number;
      tickSize: number;
      maxLeverage: number;
      amountStep: number;
    }> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async getOpenOrders(instrument?: string): Promise<Order[]> {
      throw new Error(`${brokerName} broker not yet implemented`);
    }

    async startOrphanCleanup(): Promise<void> {
      // No-op for stub brokers
    }

    async stopOrphanCleanup(): Promise<void> {
      // No-op for stub brokers
    }

    async scanAndCleanOrphans(): Promise<void> {
      // No-op for stub brokers
    }
  };
};

export const OKXBroker = createStubBroker('OKX');
export const KrakenBroker = createStubBroker('Kraken');
export const BitgetBroker = createStubBroker('Bitget');
export const KucoinBroker = createStubBroker('KuCoin');
export const MEXCBroker = createStubBroker('MEXC');
export const GateIOBroker = createStubBroker('Gate.io');
export const BitMEXBroker = createStubBroker('BitMEX');
export const HuobiBroker = createStubBroker('Huobi');
export const PhemexBroker = createStubBroker('Phemex');
export const CoinbaseBroker = createStubBroker('Coinbase Advanced');
export const BitstampBroker = createStubBroker('Bitstamp');
export const BitfinexBroker = createStubBroker('Bitfinex');

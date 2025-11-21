import { IBroker, Credentials, Balance, Order, Trade, Candle, PlaceOrderParams } from './IBroker';

export class BybitBroker implements IBroker {
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';

  async connect(credentials: Credentials): Promise<void> {
    throw new Error('Bybit broker not yet implemented');
  }

  async disconnect(): Promise<void> {
    this.connectionStatus = 'disconnected';
  }

  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' | 'error' {
    return this.connectionStatus;
  }

  async getBalance(currency?: string): Promise<Balance[]> {
    throw new Error('Bybit broker not yet implemented');
  }

  async placeOrder(params: PlaceOrderParams): Promise<Order> {
    throw new Error('Bybit broker not yet implemented');
  }

  async cancelOrder(orderId: string, instrument: string): Promise<void> {
    throw new Error('Bybit broker not yet implemented');
  }

  async cancelAllOrders(instrument?: string): Promise<void> {
    throw new Error('Bybit broker not yet implemented');
  }

  async getOrder(orderId: string, instrument: string): Promise<Order> {
    throw new Error('Bybit broker not yet implemented');
  }

  async getCandles(instrument: string, timeframe: string, limit?: number): Promise<Candle[]> {
    throw new Error('Bybit broker not yet implemented');
  }

  async subscribeTrades(instrument: string, callback: (trade: Trade) => void): Promise<void> {
    throw new Error('Bybit broker not yet implemented');
  }

  async subscribeOrders(instrument: string, callback: (order: Order) => void): Promise<void> {
    throw new Error('Bybit broker not yet implemented');
  }

  async unsubscribe(channel: string): Promise<void> {
    throw new Error('Bybit broker not yet implemented');
  }

  async getInstrumentInfo(instrument: string): Promise<{
    minTradeAmount: number;
    tickSize: number;
    maxLeverage: number;
    amountStep: number;
  }> {
    throw new Error('Bybit broker not yet implemented');
  }

  async getOpenOrders(instrument?: string): Promise<Order[]> {
    throw new Error('Bybit broker not yet implemented');
  }

  async startOrphanCleanup(): Promise<void> {
    // No-op for Bybit (not implemented yet)
  }

  async stopOrphanCleanup(): Promise<void> {
    // No-op for Bybit (not implemented yet)
  }

  async scanAndCleanOrphans(): Promise<void> {
    // No-op for Bybit (not implemented yet)
  }
}

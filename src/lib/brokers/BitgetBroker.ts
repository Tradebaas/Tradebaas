import {
  IBroker,
  BrokerCredentials,
  BrokerEnvironment,
  ConnectionState,
  BrokerInstrument,
  BrokerBalance,
  BrokerTicker,
  BrokerOrderParams,
  BrokerOrder,
  BrokerPosition,
  BrokerCandle,
} from './IBroker';

export class BitgetBroker implements IBroker {
  private connectionState: ConnectionState = 'Stopped';
  private credentials: BrokerCredentials | null = null;
  private environment: BrokerEnvironment = 'live';
  private onStateChangeCallback?: (state: ConnectionState) => void;
  private baseUrl = '';

  getName(): string {
    return 'Bitget';
  }

  private setState(state: ConnectionState): void {
    this.connectionState = state;
    this.onStateChangeCallback?.(state);
  }

  async connect(
    credentials: BrokerCredentials,
    environment: BrokerEnvironment,
    onStateChange?: (state: ConnectionState) => void
  ): Promise<void> {
    this.credentials = credentials;
    this.environment = environment;
    this.onStateChangeCallback = onStateChange;
    
    this.baseUrl = 'https://api.bitget.com';

    this.setState('Connecting');

    try {
      throw new Error('Bitget kan niet direct vanuit de browser worden gebruikt vanwege CORS-beperkingen. Dit vereist een backend server die als proxy fungeert. Neem contact op met de ontwikkelaar voor ondersteuning, of kies een andere broker zoals Deribit, Binance, Bybit of OKX die wel directe browser-toegang ondersteunen.');
    } catch (error) {
      this.setState('Error');
      throw error;
    }
  }

  private async testConnection(): Promise<void> {
    throw new Error('Direct API access not supported - CORS restricted');
  }

  private async generateSignature(timestamp: string, method: string, requestPath: string, body: string): Promise<string> {
    const message = timestamp + method + requestPath + body;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.credentials!.apiSecret);
    const messageData = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    
    return hashBase64;
  }

  disconnect(): void {
    this.credentials = null;
    this.setState('Stopped');
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async getInstruments(): Promise<BrokerInstrument[]> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async getInstrument(symbol: string): Promise<BrokerInstrument | null> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async getTicker(symbol: string): Promise<BrokerTicker> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async getBalance(currency = 'USDT'): Promise<BrokerBalance> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async placeOrder(params: BrokerOrderParams): Promise<BrokerOrder> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  private async placeStopOrder(symbol: string, side: string, amount: number, stopPrice: number): Promise<void> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  private async placeTakeProfitOrder(symbol: string, side: string, amount: number, takeProfitPrice: number): Promise<void> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async cancelAllOrders(symbol?: string): Promise<void> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async getOrder(orderId: string, symbol: string): Promise<BrokerOrder> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async getOpenOrders(symbol?: string): Promise<BrokerOrder[]> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async closePosition(symbol: string): Promise<void> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  async getCandles(
    symbol: string,
    timeframe: string,
    limit = 100
  ): Promise<BrokerCandle[]> {
    throw new Error('Bitget API vereist backend proxy - directe browser-toegang niet ondersteund');
  }

  private convertTimeframe(timeframe: string): string {
    const map: Record<string, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1H',
      '4h': '4H',
      '1d': '1D',
    };
    return map[timeframe] || '1m';
  }

  private getTimeframeMs(timeframe: string): number {
    const map: Record<string, number> = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000,
    };
    return map[timeframe] || 60000;
  }

  async subscribeToTrades(
    symbol: string,
    callback: (trade: unknown) => void
  ): Promise<void> {
    console.log('WebSocket subscriptions not yet implemented for Bitget');
  }

  async subscribeToOrders(callback: (order: unknown) => void): Promise<void> {
    console.log('WebSocket subscriptions not yet implemented for Bitget');
  }

  getDefaultSymbol(): string {
    return 'BTCUSDT';
  }

  formatSymbolForDisplay(symbol: string): string {
    return symbol.replace('USDT', ' / USDT');
  }
}

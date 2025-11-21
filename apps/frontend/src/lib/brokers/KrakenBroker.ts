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

export class KrakenBroker implements IBroker {
  private apiKey: string = '';
  private apiSecret: string = '';
  private environment: BrokerEnvironment = 'live';
  private connectionState: ConnectionState = 'Stopped';
  private onStateChange?: (state: ConnectionState) => void;
  private baseUrl: string = 'https://api.kraken.com';

  getName(): string {
    return 'Kraken';
  }

  async connect(
    credentials: BrokerCredentials,
    environment: BrokerEnvironment,
    onStateChange?: (state: ConnectionState) => void
  ): Promise<void> {
    this.apiKey = credentials.apiKey;
    this.apiSecret = credentials.apiSecret;
    this.environment = environment;
    this.onStateChange = onStateChange;
    
    this.setConnectionState('Connecting');

    try {
      const response = await this.makeRequest('/0/private/Balance', {}, 'POST');
      
      if (response.error && response.error.length > 0) {
        throw new Error(response.error[0]);
      }

      this.setConnectionState('Active');
    } catch (error) {
      this.setConnectionState('Error');
      if (error instanceof Error && error.message === 'Failed to fetch') {
        throw new Error('Kraken API-verbinding geblokkeerd door browser CORS-beveiliging. Kraken ondersteunt geen directe browser-toegang. Gebruik een broker met WebSocket-ondersteuning zoals Deribit, Binance, Bybit, OKX, of Bitget.');
      }
      throw error;
    }
  }

  disconnect(): void {
    this.setConnectionState('Stopped');
    this.apiKey = '';
    this.apiSecret = '';
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async getInstruments(): Promise<BrokerInstrument[]> {
    const response = await fetch(`${this.baseUrl}/0/public/AssetPairs`);
    const data = await response.json();

    if (data.error && data.error.length > 0) {
      throw new Error(data.error[0]);
    }

    const instruments: BrokerInstrument[] = [];
    
    for (const [symbol, info] of Object.entries(data.result)) {
      const pairInfo = info as any;
      
      if (pairInfo.wsname && pairInfo.wsname.includes('/USD')) {
        instruments.push({
          symbol: symbol,
          displayName: pairInfo.wsname || symbol,
          tickSize: parseFloat(pairInfo.tick_size || '0.01'),
          minTradeAmount: parseFloat(pairInfo.ordermin || '0.0001'),
          maxLeverage: 5,
          contractSize: 1,
          settlementCurrency: 'USD',
          quoteCurrency: pairInfo.quote || 'USD',
          baseCurrency: pairInfo.base || 'BTC',
        });
      }
    }

    return instruments;
  }

  async getInstrument(symbol: string): Promise<BrokerInstrument | null> {
    const instruments = await this.getInstruments();
    return instruments.find(i => i.symbol === symbol) || null;
  }

  async getTicker(symbol: string): Promise<BrokerTicker> {
    const response = await fetch(`${this.baseUrl}/0/public/Ticker?pair=${symbol}`);
    const data = await response.json();

    if (data.error && data.error.length > 0) {
      throw new Error(data.error[0]);
    }

    const pairData = Object.values(data.result)[0] as any;

    return {
      symbol,
      lastPrice: parseFloat(pairData.c[0]),
      markPrice: parseFloat(pairData.c[0]),
      bidPrice: parseFloat(pairData.b[0]),
      askPrice: parseFloat(pairData.a[0]),
    };
  }

  async getBalance(currency?: string): Promise<BrokerBalance> {
    const response = await this.makeRequest('/0/private/Balance', {}, 'POST');

    if (response.error && response.error.length > 0) {
      throw new Error(response.error[0]);
    }

    const targetCurrency = currency || 'ZUSD';
    const balance = parseFloat(response.result[targetCurrency] || '0');

    return {
      currency: targetCurrency,
      total: balance,
      available: balance,
      equity: balance,
    };
  }

  async placeOrder(params: BrokerOrderParams): Promise<BrokerOrder> {
    const orderData: any = {
      pair: params.symbol,
      type: params.side,
      ordertype: params.type,
      volume: params.amount.toString(),
    };

    if (params.price) {
      orderData.price = params.price.toString();
    }

    if (params.label) {
      orderData.userref = params.label;
    }

    if (params.reduceOnly) {
      orderData.reduce_only = true;
    }

    const response = await this.makeRequest('/0/private/AddOrder', orderData, 'POST');

    if (response.error && response.error.length > 0) {
      throw new Error(response.error[0]);
    }

    const orderId = response.result.txid[0];

    if (params.stopLoss) {
      await this.makeRequest('/0/private/AddOrder', {
        pair: params.symbol,
        type: params.side === 'buy' ? 'sell' : 'buy',
        ordertype: 'stop-loss',
        volume: params.amount.toString(),
        price: params.stopLoss.triggerPrice.toString(),
        reduce_only: true,
      }, 'POST');
    }

    if (params.takeProfit) {
      await this.makeRequest('/0/private/AddOrder', {
        pair: params.symbol,
        type: params.side === 'buy' ? 'sell' : 'buy',
        ordertype: 'take-profit',
        volume: params.amount.toString(),
        price: params.takeProfit.triggerPrice.toString(),
        reduce_only: true,
      }, 'POST');
    }

    return {
      orderId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      amount: params.amount,
      price: params.price,
      status: 'pending',
      filled: 0,
      remaining: params.amount,
      timestamp: Date.now(),
    };
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    const response = await this.makeRequest('/0/private/CancelOrder', {
      txid: orderId,
    }, 'POST');

    if (response.error && response.error.length > 0) {
      throw new Error(response.error[0]);
    }
  }

  async cancelAllOrders(symbol?: string): Promise<void> {
    const response = await this.makeRequest('/0/private/CancelAll', {}, 'POST');

    if (response.error && response.error.length > 0) {
      throw new Error(response.error[0]);
    }
  }

  async getOrder(orderId: string, symbol: string): Promise<BrokerOrder> {
    const response = await this.makeRequest('/0/private/QueryOrders', {
      txid: orderId,
    }, 'POST');

    if (response.error && response.error.length > 0) {
      throw new Error(response.error[0]);
    }

    const orderData = response.result[orderId];
    
    return {
      orderId,
      symbol: orderData.descr.pair,
      side: orderData.descr.type as 'buy' | 'sell',
      type: orderData.descr.ordertype,
      amount: parseFloat(orderData.vol),
      price: orderData.descr.price ? parseFloat(orderData.descr.price) : undefined,
      status: orderData.status,
      filled: parseFloat(orderData.vol_exec),
      remaining: parseFloat(orderData.vol) - parseFloat(orderData.vol_exec),
      timestamp: orderData.opentm * 1000,
    };
  }

  async getOpenOrders(symbol?: string): Promise<BrokerOrder[]> {
    const response = await this.makeRequest('/0/private/OpenOrders', {}, 'POST');

    if (response.error && response.error.length > 0) {
      throw new Error(response.error[0]);
    }

    const orders: BrokerOrder[] = [];
    
    for (const [orderId, orderData] of Object.entries(response.result.open)) {
      const order = orderData as any;
      
      if (!symbol || order.descr.pair === symbol) {
        orders.push({
          orderId,
          symbol: order.descr.pair,
          side: order.descr.type as 'buy' | 'sell',
          type: order.descr.ordertype,
          amount: parseFloat(order.vol),
          price: order.descr.price ? parseFloat(order.descr.price) : undefined,
          status: order.status,
          filled: parseFloat(order.vol_exec),
          remaining: parseFloat(order.vol) - parseFloat(order.vol_exec),
          timestamp: order.opentm * 1000,
        });
      }
    }

    return orders;
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    const response = await this.makeRequest('/0/private/OpenPositions', {}, 'POST');

    if (response.error && response.error.length > 0) {
      throw new Error(response.error[0]);
    }

    for (const [posId, posData] of Object.entries(response.result)) {
      const position = posData as any;
      
      if (position.pair === symbol) {
        return {
          symbol,
          side: position.type as 'long' | 'short',
          size: parseFloat(position.vol),
          entryPrice: parseFloat(position.cost) / parseFloat(position.vol),
          markPrice: parseFloat(position.cost) / parseFloat(position.vol),
          unrealizedPnl: parseFloat(position.net || '0'),
          leverage: parseFloat(position.margin || '1'),
        };
      }
    }

    return null;
  }

  async closePosition(symbol: string): Promise<void> {
    const position = await this.getPosition(symbol);
    
    if (!position) {
      return;
    }

    await this.placeOrder({
      symbol,
      side: position.side === 'long' ? 'sell' : 'buy',
      type: 'market',
      amount: position.size,
      reduceOnly: true,
    });
  }

  async getCandles(
    symbol: string,
    timeframe: string,
    limit: number = 100
  ): Promise<BrokerCandle[]> {
    const intervalMap: Record<string, number> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '1h': 60,
      '4h': 240,
      '1d': 1440,
    };

    const interval = intervalMap[timeframe] || 1;
    
    const response = await fetch(
      `${this.baseUrl}/0/public/OHLC?pair=${symbol}&interval=${interval}&since=${Date.now() / 1000 - (interval * 60 * limit)}`
    );
    
    const data = await response.json();

    if (data.error && data.error.length > 0) {
      throw new Error(data.error[0]);
    }

    const pairKey = Object.keys(data.result).find(k => k !== 'last');
    if (!pairKey) return [];

    const candles = data.result[pairKey] as any[];

    return candles.slice(-limit).map((candle: any) => ({
      timestamp: candle[0] * 1000,
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[6]),
    }));
  }

  async subscribeToTrades(
    symbol: string,
    callback: (trade: unknown) => void
  ): Promise<void> {
    console.log('Kraken WebSocket subscriptions not yet implemented');
  }

  async subscribeToOrders(
    callback: (order: unknown) => void
  ): Promise<void> {
    console.log('Kraken WebSocket subscriptions not yet implemented');
  }

  getDefaultSymbol(): string {
    return 'XXBTZUSD';
  }

  formatSymbolForDisplay(symbol: string): string {
    return symbol.replace('X', '').replace('Z', '').replace('USD', '/USD');
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    if (this.onStateChange) {
      this.onStateChange(state);
    }
  }

  private async makeRequest(
    endpoint: string,
    data: Record<string, any>,
    method: 'GET' | 'POST'
  ): Promise<any> {
    const nonce = Date.now() * 1000;
    const postData = { ...data, nonce: nonce.toString() };
    
    const body = new URLSearchParams(postData).toString();
    
    const signature = await this.generateSignature(endpoint, body, nonce);

    const headers: Record<string, string> = {
      'API-Key': this.apiKey,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        body: method === 'POST' ? body : undefined,
        mode: 'cors',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.error && result.error.length > 0) {
        throw new Error(result.error.join(', '));
      }

      return result;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Failed to fetch');
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to fetch');
    }
  }

  private async generateSignature(
    path: string,
    body: string,
    nonce: number
  ): Promise<string> {
    const message = nonce + body;
    const secretBuffer = this.base64ToArrayBuffer(this.apiSecret);
    
    const encoder = new TextEncoder();
    const messageBuffer = encoder.encode(message);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', messageBuffer);
    const pathBuffer = encoder.encode(path);
    
    const combinedBuffer = new Uint8Array(pathBuffer.length + hashBuffer.byteLength);
    combinedBuffer.set(new Uint8Array(pathBuffer));
    combinedBuffer.set(new Uint8Array(hashBuffer), pathBuffer.length);
    
    const key = await crypto.subtle.importKey(
      'raw',
      secretBuffer,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, combinedBuffer);
    
    return this.arrayBufferToBase64(signature);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

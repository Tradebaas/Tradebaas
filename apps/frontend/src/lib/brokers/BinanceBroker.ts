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

export class BinanceBroker implements IBroker {
  private connectionState: ConnectionState = 'Stopped';
  private credentials: BrokerCredentials | null = null;
  private environment: BrokerEnvironment = 'live';
  private onStateChangeCallback?: (state: ConnectionState) => void;
  private baseUrl = '';

  getName(): string {
    return 'Binance';
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
    
    this.baseUrl = environment === 'testnet'
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';

    this.setState('Connecting');

    try {
      await this.testConnection();
      this.setState('Active');
    } catch (error) {
      this.setState('Error');
      throw error;
    }
  }

  private async testConnection(): Promise<void> {
    const timestamp = Date.now();
    const response = await fetch(`${this.baseUrl}/fapi/v2/account?timestamp=${timestamp}`, {
      headers: {
        'X-MBX-APIKEY': this.credentials!.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Binance connection test failed: ${response.statusText}`);
    }
  }

  disconnect(): void {
    this.credentials = null;
    this.setState('Stopped');
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async getInstruments(): Promise<BrokerInstrument[]> {
    const response = await fetch(`${this.baseUrl}/fapi/v1/exchangeInfo`);
    const data = await response.json();
    
    return data.symbols
      .filter((s: any) => s.status === 'TRADING')
      .map((s: any) => ({
        symbol: s.symbol,
        displayName: s.symbol,
        tickSize: parseFloat(s.filters.find((f: any) => f.filterType === 'PRICE_FILTER')?.tickSize || '0.01'),
        minTradeAmount: parseFloat(s.filters.find((f: any) => f.filterType === 'LOT_SIZE')?.minQty || '0.001'),
        maxLeverage: s.maxLeverage || 125,
        contractSize: 1,
        settlementCurrency: s.quoteAsset,
        quoteCurrency: s.quoteAsset,
        baseCurrency: s.baseAsset,
      }));
  }

  async getInstrument(symbol: string): Promise<BrokerInstrument | null> {
    const instruments = await this.getInstruments();
    return instruments.find(i => i.symbol === symbol) || null;
  }

  async getTicker(symbol: string): Promise<BrokerTicker> {
    const response = await fetch(`${this.baseUrl}/fapi/v1/ticker/bookTicker?symbol=${symbol}`);
    const data = await response.json();
    
    return {
      symbol: data.symbol,
      lastPrice: parseFloat(data.price || data.lastPrice),
      markPrice: parseFloat(data.markPrice || data.price),
      bidPrice: parseFloat(data.bidPrice),
      askPrice: parseFloat(data.askPrice),
    };
  }

  async getBalance(currency = 'USDT'): Promise<BrokerBalance> {
    const timestamp = Date.now();
    const response = await fetch(
      `${this.baseUrl}/fapi/v2/account?timestamp=${timestamp}`,
      {
        headers: {
          'X-MBX-APIKEY': this.credentials!.apiKey,
        },
      }
    );
    const data = await response.json();
    
    const asset = data.assets?.find((a: any) => a.asset === currency);
    
    return {
      currency,
      total: parseFloat(asset?.walletBalance || '0'),
      available: parseFloat(asset?.availableBalance || '0'),
      equity: parseFloat(asset?.marginBalance || '0'),
    };
  }

  async placeOrder(params: BrokerOrderParams): Promise<BrokerOrder> {
    const timestamp = Date.now();
    const orderParams = new URLSearchParams({
      symbol: params.symbol,
      side: params.side.toUpperCase(),
      type: params.type.toUpperCase(),
      quantity: params.amount.toString(),
      timestamp: timestamp.toString(),
    });

    if (params.price) {
      orderParams.append('price', params.price.toString());
      orderParams.append('timeInForce', 'GTC');
    }

    if (params.reduceOnly) {
      orderParams.append('reduceOnly', 'true');
    }

    const response = await fetch(`${this.baseUrl}/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': this.credentials!.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: orderParams.toString(),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Order placement failed: ${data.msg || response.statusText}`);
    }

    if (params.stopLoss || params.takeProfit) {
      if (params.stopLoss) {
        await this.placeStopOrder(params.symbol, params.side === 'buy' ? 'sell' : 'buy', params.amount, params.stopLoss.triggerPrice);
      }
      if (params.takeProfit) {
        await this.placeTakeProfitOrder(params.symbol, params.side === 'buy' ? 'sell' : 'buy', params.amount, params.takeProfit.triggerPrice);
      }
    }

    return {
      orderId: data.orderId.toString(),
      symbol: data.symbol,
      side: params.side,
      type: data.type,
      amount: parseFloat(data.origQty),
      price: data.price ? parseFloat(data.price) : undefined,
      status: data.status,
      filled: parseFloat(data.executedQty || '0'),
      remaining: parseFloat(data.origQty) - parseFloat(data.executedQty || '0'),
      timestamp: data.updateTime || Date.now(),
    };
  }

  private async placeStopOrder(symbol: string, side: string, amount: number, stopPrice: number): Promise<void> {
    const timestamp = Date.now();
    const orderParams = new URLSearchParams({
      symbol,
      side: side.toUpperCase(),
      type: 'STOP_MARKET',
      quantity: amount.toString(),
      stopPrice: stopPrice.toString(),
      reduceOnly: 'true',
      timestamp: timestamp.toString(),
    });

    await fetch(`${this.baseUrl}/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': this.credentials!.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: orderParams.toString(),
    });
  }

  private async placeTakeProfitOrder(symbol: string, side: string, amount: number, takeProfitPrice: number): Promise<void> {
    const timestamp = Date.now();
    const orderParams = new URLSearchParams({
      symbol,
      side: side.toUpperCase(),
      type: 'TAKE_PROFIT_MARKET',
      quantity: amount.toString(),
      stopPrice: takeProfitPrice.toString(),
      reduceOnly: 'true',
      timestamp: timestamp.toString(),
    });

    await fetch(`${this.baseUrl}/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': this.credentials!.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: orderParams.toString(),
    });
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    const timestamp = Date.now();
    await fetch(
      `${this.baseUrl}/fapi/v1/order?symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`,
      {
        method: 'DELETE',
        headers: {
          'X-MBX-APIKEY': this.credentials!.apiKey,
        },
      }
    );
  }

  async cancelAllOrders(symbol?: string): Promise<void> {
    const timestamp = Date.now();
    const url = symbol
      ? `${this.baseUrl}/fapi/v1/allOpenOrders?symbol=${symbol}&timestamp=${timestamp}`
      : `${this.baseUrl}/fapi/v1/allOpenOrders?timestamp=${timestamp}`;
    
    await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': this.credentials!.apiKey,
      },
    });
  }

  async getOrder(orderId: string, symbol: string): Promise<BrokerOrder> {
    const timestamp = Date.now();
    const response = await fetch(
      `${this.baseUrl}/fapi/v1/order?symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`,
      {
        headers: {
          'X-MBX-APIKEY': this.credentials!.apiKey,
        },
      }
    );
    const data = await response.json();

    return {
      orderId: data.orderId.toString(),
      symbol: data.symbol,
      side: data.side.toLowerCase() as 'buy' | 'sell',
      type: data.type,
      amount: parseFloat(data.origQty),
      price: data.price ? parseFloat(data.price) : undefined,
      status: data.status,
      filled: parseFloat(data.executedQty),
      remaining: parseFloat(data.origQty) - parseFloat(data.executedQty),
      timestamp: data.updateTime,
    };
  }

  async getOpenOrders(symbol?: string): Promise<BrokerOrder[]> {
    const timestamp = Date.now();
    const url = symbol
      ? `${this.baseUrl}/fapi/v1/openOrders?symbol=${symbol}&timestamp=${timestamp}`
      : `${this.baseUrl}/fapi/v1/openOrders?timestamp=${timestamp}`;

    const response = await fetch(url, {
      headers: {
        'X-MBX-APIKEY': this.credentials!.apiKey,
      },
    });
    const data = await response.json();

    return data.map((order: any) => ({
      orderId: order.orderId.toString(),
      symbol: order.symbol,
      side: order.side.toLowerCase() as 'buy' | 'sell',
      type: order.type,
      amount: parseFloat(order.origQty),
      price: order.price ? parseFloat(order.price) : undefined,
      status: order.status,
      filled: parseFloat(order.executedQty),
      remaining: parseFloat(order.origQty) - parseFloat(order.executedQty),
      timestamp: order.updateTime,
    }));
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    const timestamp = Date.now();
    const response = await fetch(
      `${this.baseUrl}/fapi/v2/positionRisk?symbol=${symbol}&timestamp=${timestamp}`,
      {
        headers: {
          'X-MBX-APIKEY': this.credentials!.apiKey,
        },
      }
    );
    const data = await response.json();
    
    const position = data.find((p: any) => p.symbol === symbol);
    if (!position || parseFloat(position.positionAmt) === 0) return null;

    return {
      symbol: position.symbol,
      side: parseFloat(position.positionAmt) > 0 ? 'long' : 'short',
      size: Math.abs(parseFloat(position.positionAmt)),
      entryPrice: parseFloat(position.entryPrice),
      markPrice: parseFloat(position.markPrice),
      unrealizedPnl: parseFloat(position.unRealizedProfit),
      leverage: parseInt(position.leverage),
    };
  }

  async closePosition(symbol: string): Promise<void> {
    const position = await this.getPosition(symbol);
    if (!position) return;

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
    limit = 100
  ): Promise<BrokerCandle[]> {
    const interval = this.convertTimeframe(timeframe);
    const response = await fetch(
      `${this.baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    const data = await response.json();

    return data.map((candle: any[]) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
  }

  private convertTimeframe(timeframe: string): string {
    const map: Record<string, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d',
    };
    return map[timeframe] || '1m';
  }

  async subscribeToTrades(
    symbol: string,
    callback: (trade: unknown) => void
  ): Promise<void> {
    console.log('WebSocket subscriptions not yet implemented for Binance');
  }

  async subscribeToOrders(callback: (order: unknown) => void): Promise<void> {
    console.log('WebSocket subscriptions not yet implemented for Binance');
  }

  getDefaultSymbol(): string {
    return 'BTCUSDT';
  }

  formatSymbolForDisplay(symbol: string): string {
    return symbol.replace('USDT', ' / USDT');
  }
}

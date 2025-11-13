export type BrokerEnvironment = 'live' | 'testnet';
export type ConnectionState = 'Stopped' | 'Connecting' | 'Active' | 'Error';

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface BrokerInstrument {
  symbol: string;
  displayName: string;
  tickSize: number;
  minTradeAmount: number;
  maxLeverage: number;
  contractSize: number;
  settlementCurrency: string;
  quoteCurrency: string;
  baseCurrency: string;
}

export interface BrokerBalance {
  currency: string;
  total: number;
  available: number;
  equity: number;
}

export interface BrokerTicker {
  symbol: string;
  lastPrice: number;
  markPrice: number;
  bidPrice: number;
  askPrice: number;
}

export interface BrokerOrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number;
  stopLoss?: {
    triggerPrice: number;
    type: 'market' | 'limit';
    price?: number;
  };
  takeProfit?: {
    triggerPrice: number;
    type: 'market' | 'limit';
    price?: number;
  };
  reduceOnly?: boolean;
  label?: string;
}

export interface BrokerOrder {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  amount: number;
  price?: number;
  status: string;
  filled: number;
  remaining: number;
  timestamp: number;
}

export interface BrokerPosition {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

export interface BrokerCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IBroker {
  getName(): string;
  
  connect(
    credentials: BrokerCredentials,
    environment: BrokerEnvironment,
    onStateChange?: (state: ConnectionState) => void
  ): Promise<void>;
  
  disconnect(): void;
  
  getConnectionState(): ConnectionState;
  
  getInstruments(): Promise<BrokerInstrument[]>;
  
  getInstrument(symbol: string): Promise<BrokerInstrument | null>;
  
  getTicker(symbol: string): Promise<BrokerTicker>;
  
  getBalance(currency?: string): Promise<BrokerBalance>;
  
  placeOrder(params: BrokerOrderParams): Promise<BrokerOrder>;
  
  cancelOrder(orderId: string, symbol: string): Promise<void>;
  
  cancelAllOrders(symbol?: string): Promise<void>;
  
  getOrder(orderId: string, symbol: string): Promise<BrokerOrder>;
  
  getOpenOrders(symbol?: string): Promise<BrokerOrder[]>;
  
  getPosition(symbol: string): Promise<BrokerPosition | null>;
  
  closePosition(symbol: string): Promise<void>;
  
  getCandles(
    symbol: string,
    timeframe: string,
    limit?: number
  ): Promise<BrokerCandle[]>;
  
  subscribeToTrades(
    symbol: string,
    callback: (trade: unknown) => void
  ): Promise<void>;
  
  subscribeToOrders(
    callback: (order: unknown) => void
  ): Promise<void>;
  
  getDefaultSymbol(): string;
  
  formatSymbolForDisplay(symbol: string): string;
}

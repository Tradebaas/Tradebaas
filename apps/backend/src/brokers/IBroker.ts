/**
 * Broker Interface
 * Defines the contract for all broker implementations
 */

import type { Candle, Credentials, OrderSide as SharedOrderSide, OrderType as SharedOrderType, OrderStatus as SharedOrderStatus, ConnectionStatus as SharedConnectionStatus } from '../types/shared';

// Re-export common types for convenience
export type { Candle, Credentials };

export interface OrderSide {
  BUY: 'buy';
  SELL: 'sell';
}

export interface OrderType {
  MARKET: 'market';
  LIMIT: 'limit';
  STOP_MARKET: 'stop_market';
  STOP_LIMIT: 'stop_limit';
  TAKE_LIMIT: 'take_limit';
  TAKE_MARKET: 'take_market';
}

export interface ConnectionStatus {
  DISCONNECTED: 'disconnected';
  CONNECTING: 'connecting';
  CONNECTED: 'connected';
  ERROR: 'error';
}

export interface Balance {
  currency: string;
  available: number;
  total: number;
  locked: number;
}

export interface Order {
  orderId: string;
  instrument: string;
  side: 'buy' | 'sell';
  type: string;
  amount: number;
  price?: number;
  filled: number;
  status: 'open' | 'filled' | 'cancelled' | 'rejected';
  timestamp: number;
  label?: string;
  ocoRef?: string;
}

export interface Trade {
  tradeId: string;
  orderId: string;
  instrument: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: number;
  fee?: number;
  feeCurrency?: string;
}

// Candle is now imported from shared types (see top of file)

export interface OTOCOConfig {
  takeProfit?: {
    type: 'take_limit' | 'take_market';
    price?: number;
    trigger?: 'last_price' | 'mark_price' | 'index_price';
  };
  stopLoss?: {
    type: 'stop_limit' | 'stop_market';
    triggerPrice: number;
    price?: number;
    trigger?: 'last_price' | 'mark_price' | 'index_price';
  };
}

export interface PlaceOrderParams {
  instrument: string;
  side: 'buy' | 'sell';
  type: string;
  amount: number;
  price?: number;
  otocoConfig?: OTOCOConfig;
  reduceOnly?: boolean;
  label?: string;
}

export interface IBroker {
  connect(credentials: Credentials): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' | 'error';
  
  getBalance(currency?: string): Promise<Balance[]>;
  
  placeOrder(params: PlaceOrderParams): Promise<Order>;
  cancelOrder(orderId: string, instrument: string): Promise<void>;
  cancelAllOrders(instrument?: string): Promise<void>;
  getOrder(orderId: string, instrument: string): Promise<Order>;
  getOpenOrders(instrument?: string): Promise<Order[]>;
  
  getCandles(instrument: string, timeframe: string, limit?: number): Promise<Candle[]>;
  
  subscribeTrades(instrument: string, callback: (trade: Trade) => void): Promise<void>;
  subscribeOrders(instrument: string, callback: (order: Order) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  
  getInstrumentInfo(instrument: string): Promise<{
    minTradeAmount: number;
    tickSize: number;
    maxLeverage: number;
    amountStep: number;
  }>;
  
  // BROKER-004: Orphan order cleanup methods
  startOrphanCleanup(): void;
  stopOrphanCleanup(): void;
  scanAndCleanOrphans(): Promise<void>;
}

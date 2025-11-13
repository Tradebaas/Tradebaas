/**
 * Shared Backend Types
 * Central source of truth for common types used across the backend.
 * 
 * IMPORTANT: Logic must stay in sync with MASTER.md requirements.
 */

/**
 * OHLCV Candle data structure
 * Used by: brokers, strategies, indicators, risk engine
 */
export interface Candle {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Opening price */
  open: number;
  /** Highest price during period */
  high: number;
  /** Lowest price during period */
  low: number;
  /** Closing price */
  close: number;
  /** Volume traded during period */
  volume: number;
}

/**
 * Trading position representation
 * Used by: strategy runner, risk engine, state management
 */
export interface Position {
  /** Unique order ID from broker */
  orderId: string;
  /** Instrument symbol (e.g., "BTC_USDC-PERPETUAL") */
  instrument: string;
  /** Position direction */
  side: 'buy' | 'sell';
  /** Entry price */
  entryPrice: number;
  /** Position size in contracts/units */
  amount: number;
  /** Stop loss price */
  stopLoss: number;
  /** Take profit price */
  takeProfit: number;
  /** Entry time (Unix timestamp in milliseconds) */
  entryTime: number;
  /** Stop loss order ID (if placed) */
  slOrderId?: string;
  /** Take profit order ID (if placed) */
  tpOrderId?: string;
}

/**
 * Deribit API credentials
 * Used by: Deribit client, credential management
 */
export interface DeribitCredentials {
  /** API key from Deribit */
  apiKey: string;
  /** API secret from Deribit */
  apiSecret: string;
  /** Optional: whether to use testnet */
  testnet?: boolean;
}

/**
 * Deribit environment configuration
 */
export type DeribitEnvironment = 'live' | 'testnet';

/**
 * Generic broker credentials
 * Used by: Multi-broker system
 */
export interface Credentials {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
  [key: string]: any;
}

/**
 * Order side enum
 */
export type OrderSide = 'buy' | 'sell';

/**
 * Order type enum
 */
export type OrderType = 'market' | 'limit' | 'stop_market' | 'stop_limit' | 'take_limit' | 'take_market';

/**
 * Order status enum
 */
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'rejected';

/**
 * Connection status enum
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Strategy signal action
 */
export type SignalAction = 'buy' | 'sell' | 'none';

/**
 * Timeframe enum for candle intervals
 */
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h';

/**
 * Shared Types - Frontend
 * Centralized type definitions for common data structures
 * Eliminates duplication across the codebase
 */

/**
 * Candle represents OHLCV data for a single time period
 * Used by: indicators, strategies, charting
 */
export interface Candle {
  /** Timestamp (Unix epoch in milliseconds) */
  t: number;
  /** Open price */
  o: number;
  /** High price */
  h: number;
  /** Low price */
  l: number;
  /** Close price */
  c: number;
  /** Volume */
  v: number;
}

/**
 * Error log entry for strategy execution errors
 * Used by: all strategies, error dialogs, debugging
 */
export interface ErrorLog {
  id: string;
  timestamp: number;
  errorType: string;
  message: string;
  stack?: string;
  context?: {
    action: string;
    instrument?: string;
    price?: number;
    amount?: number;
    environment?: string;
    connectionState?: string;
    strategy?: string;
    signal?: string;
    [key: string]: unknown;
  };
  apiResponse?: {
    statusCode?: number;
    errorCode?: string;
    data?: any;
  };
  requestDetails?: {
    method?: string;
    params?: any;
  };
}

/**
 * Deribit API Types - Frontend
 * Type definitions for Deribit exchange API
 * Source: https://docs.deribit.com/
 */

export type DeribitEnvironment = 'live' | 'testnet';

export interface DeribitCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface DeribitAuthResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

export interface DeribitRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

export interface DeribitRPCResponse<T = unknown> {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface AccountSummary {
  currency: string;
  balance: number;
  equity: number;
  available_funds: number;
  maintenance_margin: number;
  initial_margin: number;
  margin_balance: number;
  session_funding: number;
  session_rpl: number;
  session_upl: number;
  total_pl: number;
  futures_pl: number;
  futures_session_rpl: number;
  futures_session_upl: number;
  options_value: number;
  options_pl: number;
  options_session_rpl: number;
  options_session_upl: number;
  options_delta: number;
  options_gamma: number;
  options_vega: number;
  options_theta: number;
}

export interface Instrument {
  instrument_name: string;
  tick_size: number;
  min_trade_amount: number;
  max_leverage: number;
  contract_size: number;
  settlement_period: string;
  settlement_currency: string;
  kind: string;
  quote_currency: string;
}

export interface Ticker {
  instrument_name: string;
  last_price: number;
  mark_price: number;
  best_bid_price: number;
  best_ask_price: number;
  mid_price?: number;
}

export interface OTOCOOrder {
  type: string;
  amount?: number;
  trigger?: string;
  trigger_price?: number;
  price?: number;
  reduce_only?: boolean;
}

export interface OrderResponse {
  order_id: string;
  order_state: string;
  label?: string;
  oco_ref?: string;
  direction: string;
  amount: number;
  price?: number;
  trigger?: string;
  trigger_price?: number;
  reduce_only?: boolean;
  instrument_name: string;
}

export interface Position {
  instrument_name: string;
  size: number;
  direction: 'buy' | 'sell';
  average_price: number;
  mark_price: number;
  index_price: number;
  floating_profit_loss: number;
  realized_profit_loss: number;
  total_profit_loss: number;
  leverage: number;
  initial_margin: number;
  maintenance_margin: number;
  kind: string;
  settlement_price?: number;
}

export enum DeribitErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  ORDER_ERROR = 'ORDER_ERROR',
  SUBSCRIPTION_ERROR = 'SUBSCRIPTION_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  PRICE_OUT_OF_RANGE = 'PRICE_OUT_OF_RANGE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'authenticated'
  | 'error';

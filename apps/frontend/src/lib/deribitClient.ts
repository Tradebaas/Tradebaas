import { globalRateLimiter } from './utils/rateLimiter';

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
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  INVALID_PARAMS = 'INVALID_PARAMS',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  WEBSOCKET_ERROR = 'WEBSOCKET_ERROR',
}

export class DeribitError extends Error {
  constructor(
    public type: DeribitErrorType,
    message: string,
    public code?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'DeribitError';
  }
}

export interface TelemetryHooks {
  onRPC?: (method: string, params: Record<string, unknown>, duration: number, success: boolean) => void;
  onWS?: (event: 'open' | 'close' | 'error' | 'reconnect', details?: unknown) => void;
  onFill?: (fill: unknown) => void;
  onOrderUpdate?: (order: unknown) => void;
}

const ENDPOINTS = {
  live: 'wss://www.deribit.com/ws/api/v2',
  testnet: 'wss://test.deribit.com/ws/api/v2',
};

const MAX_RETRIES = 5;
const BASE_BACKOFF = 1000;
const MAX_BACKOFF = 30000;
const REQUEST_TIMEOUT = 30000;
const HEARTBEAT_INTERVAL = 15000;
const STALE_CONNECTION_TIMEOUT = 60000;
const MAX_RECONNECT_ATTEMPTS = 10;

const RETRYABLE_ERROR_CODES = [
  -32000,
  -32603,
  503,
  502,
  500,
];

const RETRYABLE_METHODS = [
  'public/ticker',
  'public/get_instruments',
  'private/get_account_summary',
];

export class DeribitClient {
  private ws: WebSocket | null = null;
  private requestId = 1;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: number;
    method: string;
    retries: number;
    params: Record<string, unknown>;
  }>();
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private environment: DeribitEnvironment = 'live';
  private credentials: DeribitCredentials | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: number | null = null;
  private onStateChange?: (state: ConnectionState) => void;
  private currentState: ConnectionState = 'Stopped';
  private subscriptionHandlers = new Map<string, (data: unknown) => void>();
  private activeSubscriptions = new Set<string>();
  private heartbeatInterval: number | null = null;
  private lastHeartbeat: number = Date.now();
  private staleCheckInterval: number | null = null;
  private instrumentCache = new Map<string, Instrument>();
  private instrumentCacheExpiry: number = 0;
  private telemetryHooks: TelemetryHooks = {};
  private isReconnecting = false;

  constructor(
    environment: DeribitEnvironment = 'live',
    onStateChange?: (state: ConnectionState) => void,
    telemetryHooks?: TelemetryHooks
  ) {
    this.environment = environment;
    this.onStateChange = onStateChange;
    this.telemetryHooks = telemetryHooks || {};
  }

  private setState(state: ConnectionState): void {
    this.currentState = state;
    this.onStateChange?.(state);
  }

  private getEndpoint(): string {
    return ENDPOINTS[this.environment];
  }

  private generateId(): number {
    return this.requestId++;
  }

  private calculateBackoff(attempt: number): number {
    const backoff = Math.min(BASE_BACKOFF * Math.pow(2, attempt), MAX_BACKOFF);
    const jitter = Math.random() * 0.3 * backoff;
    return backoff + jitter;
  }

  private normalizeError(error: unknown, code?: number): DeribitError {
    if (error instanceof DeribitError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (code === -32602) {
      return new DeribitError(DeribitErrorType.INVALID_PARAMS, message, code);
    }
    if (code === 10009 || message.includes('insufficient')) {
      return new DeribitError(DeribitErrorType.INSUFFICIENT_FUNDS, message, code);
    }
    if (code === 10028 || message.includes('rate limit')) {
      return new DeribitError(DeribitErrorType.RATE_LIMIT, message, code);
    }
    if (code && code >= 10000 && code < 11000) {
      return new DeribitError(DeribitErrorType.AUTHENTICATION_ERROR, message, code);
    }
    if (code && (code >= 500 || code === -32000 || code === -32603)) {
      return new DeribitError(DeribitErrorType.SERVER_ERROR, message, code);
    }
    if (message.includes('timeout') || message.includes('Request timeout')) {
      return new DeribitError(DeribitErrorType.TIMEOUT_ERROR, message, code);
    }
    if (message.includes('WebSocket')) {
      return new DeribitError(DeribitErrorType.WEBSOCKET_ERROR, message, code);
    }

    return new DeribitError(DeribitErrorType.UNKNOWN_ERROR, message, code);
  }

  private isRetryableError(error: DeribitError): boolean {
    return (
      error.type === DeribitErrorType.NETWORK_ERROR ||
      error.type === DeribitErrorType.TIMEOUT_ERROR ||
      error.type === DeribitErrorType.SERVER_ERROR ||
      error.type === DeribitErrorType.WEBSOCKET_ERROR ||
      (error.code !== undefined && RETRYABLE_ERROR_CODES.includes(error.code))
    );
  }

  private isRetryableMethod(method: string): boolean {
    return RETRYABLE_METHODS.includes(method);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = window.setInterval(async () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          await this.callRPC('public/test', {}, 0, true);
          this.lastHeartbeat = Date.now();
        } catch (error) {
          console.warn('Heartbeat failed:', error);
        }
      }
    }, HEARTBEAT_INTERVAL);

    this.staleCheckInterval = window.setInterval(() => {
      if (Date.now() - this.lastHeartbeat > STALE_CONNECTION_TIMEOUT) {
        console.warn('Connection appears stale, forcing reconnect');
        this.telemetryHooks.onWS?.('error', { reason: 'stale_connection' });
        this.handleClose();
      }
    }, STALE_CONNECTION_TIMEOUT / 2);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.staleCheckInterval) {
      window.clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
  }

  private async resubscribeAll(): Promise<void> {
    if (this.activeSubscriptions.size === 0) {
      return;
    }

    const channels = Array.from(this.activeSubscriptions);
    console.log('Resubscribing to channels:', channels);

    try {
      await this.callRPC('private/subscribe', { channels }, 0, true);
      console.log('Successfully resubscribed to all channels');
    } catch (error) {
      console.error('Failed to resubscribe:', error);
      this.telemetryHooks.onWS?.('error', { reason: 'resubscribe_failed', error });
    }
  }

  private async callRPC<T>(
    method: string,
    params: Record<string, unknown> = {},
    retries = 0,
    skipRetry = false
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;

    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        if (!skipRetry && this.isRetryableMethod(method) && retries < MAX_RETRIES) {
          const backoff = this.calculateBackoff(retries);
          await new Promise(resolve => window.setTimeout(resolve, backoff));
          return this.callRPC<T>(method, params, retries + 1, skipRetry);
        }
        throw this.normalizeError(new Error('WebSocket not connected'));
      }

      const id = this.generateId();
      const request: DeribitRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const result = await new Promise<T>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(this.normalizeError(new Error(`Request timeout for method: ${method}`)));
        }, REQUEST_TIMEOUT);

        this.pendingRequests.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timeout,
          method,
          retries,
          params,
        });
        
        this.ws!.send(JSON.stringify(request));
      });

      success = true;
      return result;
    } catch (error) {
      const deribitError = error instanceof DeribitError ? error : this.normalizeError(error);
      
      if (!skipRetry && this.isRetryableError(deribitError) && this.isRetryableMethod(method) && retries < MAX_RETRIES) {
        const backoff = this.calculateBackoff(retries);
        console.log(`Retrying ${method} after ${backoff}ms (attempt ${retries + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => window.setTimeout(resolve, backoff));
        return this.callRPC<T>(method, params, retries + 1, skipRetry);
      }

      throw deribitError;
    } finally {
      const duration = Date.now() - startTime;
      this.telemetryHooks.onRPC?.(method, params, duration, success);
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const response: DeribitRPCResponse = JSON.parse(event.data);

      if ('method' in response && response.method === 'subscription') {
        const notification = response as unknown as { params: { channel: string; data: unknown } };
        const channel = notification.params?.channel;
        if (channel) {
          const handler = this.subscriptionHandlers.get(channel);
          if (handler) {
            handler(notification.params.data);
          }

          if (channel.includes('user.trades')) {
            this.telemetryHooks.onFill?.(notification.params.data);
          }
          if (channel.includes('user.orders')) {
            this.telemetryHooks.onOrderUpdate?.(notification.params.data);
          }
        }
        return;
      }

      if ('id' in response && typeof response.id === 'number' && this.pendingRequests.has(response.id)) {
        const pending = this.pendingRequests.get(response.id)!;
        window.clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          const error = this.normalizeError(
            new Error(`${response.error.message}`),
            response.error.code
          );
          error.data = response.error.data;
          pending.reject(error);
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleError(error: Event): void {
    console.error('WebSocket error:', error);
    this.telemetryHooks.onWS?.('error', { error });
    this.setState('Error');
  }

  private handleClose(): void {
    console.log('WebSocket closed, current state:', this.currentState);
    this.stopHeartbeat();
    this.telemetryHooks.onWS?.('close');
    
    if (this.currentState !== 'Stopped' && !this.isReconnecting) {
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      this.setState('Error');
      this.telemetryHooks.onWS?.('error', { reason: 'max_reconnect_attempts' });
      return;
    }

    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    const backoff = this.calculateBackoff(this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`Attempting reconnect in ${backoff}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    this.telemetryHooks.onWS?.('reconnect', { attempt: this.reconnectAttempts, backoff });

    this.reconnectTimeout = window.setTimeout(async () => {
      if (this.credentials) {
        try {
          await this.connect(this.credentials);
          this.isReconnecting = false;
          await this.resubscribeAll();
        } catch (error) {
          console.error('Reconnect failed:', error);
          this.isReconnecting = false;
          this.attemptReconnect();
        }
      } else {
        this.isReconnecting = false;
      }
    }, backoff);
  }

  async connect(credentials: DeribitCredentials): Promise<void> {
    this.credentials = credentials;
    this.setState('Connecting');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.getEndpoint());

        this.ws.onopen = async () => {
          try {
            this.telemetryHooks.onWS?.('open');
            await this.authenticate(credentials);
            await this.testConnection();
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.setState('Active');
            resolve();
          } catch (error) {
            this.setState('Error');
            reject(error);
          }
        };

        this.ws.onmessage = (event) => this.handleMessage(event);
        this.ws.onerror = (error) => {
          this.handleError(error);
          reject(this.normalizeError(new Error('WebSocket connection failed')));
        };
        this.ws.onclose = () => this.handleClose();
      } catch (error) {
        this.setState('Error');
        reject(error);
      }
    });
  }

  private async testConnection(): Promise<void> {
    try {
      await this.callRPC('public/test', {}, 0, true);
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private async authenticate(credentials: DeribitCredentials): Promise<void> {
    try {
      const response = await this.callRPC<DeribitAuthResponse>('public/auth', {
        grant_type: 'client_credentials',
        client_id: credentials.apiKey,
        client_secret: credentials.apiSecret,
      }, 0, true);

      this.accessToken = response.access_token;
      this.refreshToken = response.refresh_token;
      this.tokenExpiresAt = Date.now() + response.expires_in * 1000;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw this.normalizeError(new Error('No refresh token available'));
    }

    try {
      const response = await this.callRPC<DeribitAuthResponse>('public/auth', {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }, 0, true);

      this.accessToken = response.access_token;
      this.refreshToken = response.refresh_token;
      this.tokenExpiresAt = Date.now() + response.expires_in * 1000;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiresAt) return true;
    return Date.now() >= this.tokenExpiresAt - 60000;
  }

  disconnect(): void {
    this.setState('Stopped');
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.pendingRequests.forEach(({ timeout, reject }) => {
      window.clearTimeout(timeout);
      reject(this.normalizeError(new Error('Connection closed')));
    });
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.activeSubscriptions.clear();
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getCurrentState(): ConnectionState {
    return this.currentState;
  }

  setEnvironment(environment: DeribitEnvironment): void {
    if (this.environment !== environment) {
      const wasConnected = this.isConnected();
      this.disconnect();
      this.environment = environment;
      this.instrumentCache.clear();
      this.instrumentCacheExpiry = 0;
      
      if (wasConnected && this.credentials) {
        this.connect(this.credentials).catch(console.error);
      }
    }
  }

  getEnvironment(): DeribitEnvironment {
    return this.environment;
  }

  async getCachedInstruments(currency: string = 'USDC', kind: string = 'future', forceRefresh = false): Promise<Instrument[]> {
    const cacheKey = `${currency}_${kind}`;
    const now = Date.now();
    const CACHE_TTL = 5 * 60 * 1000;

    if (!forceRefresh && now < this.instrumentCacheExpiry && this.instrumentCache.has(cacheKey)) {
      return JSON.parse(this.instrumentCache.get(cacheKey)!.instrument_name);
    }

    try {
      const instruments = await this.getInstruments(currency, kind);
      this.instrumentCache.set(cacheKey, { 
        instrument_name: JSON.stringify(instruments),
        tick_size: 0,
        min_trade_amount: 0,
        max_leverage: 0,
        contract_size: 0,
        settlement_period: '',
        settlement_currency: '',
        kind: '',
        quote_currency: '',
      });
      this.instrumentCacheExpiry = now + CACHE_TTL;
      return instruments;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getInstrument(instrumentName: string): Promise<Instrument | null> {
    try {
      const instruments = await this.getCachedInstruments();
      return instruments.find(i => i.instrument_name === instrumentName) || null;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getAccountSummary(currency: string = 'USDC'): Promise<AccountSummary> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    try {
      const response = await this.callRPC<AccountSummary>('private/get_account_summary', {
        currency: currency,
        extended: true,
      });
      return response;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getInstruments(currency: string, kind: string): Promise<Instrument[]> {
    try {
      const response = await this.callRPC<Instrument[]>('public/get_instruments', {
        currency,
        kind,
      });
      return response;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTicker(instrumentName: string): Promise<Ticker> {
    try {
      const response = await this.callRPC<Ticker>('public/ticker', {
        instrument_name: instrumentName,
      });
      return response;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async placeBuyOrder(
    instrumentName: string,
    amount: number,
    price?: number,
    orderType: string = 'limit',
    label?: string,
    linkedOrderType?: string,
    otocoConfig?: OTOCOOrder[],
    triggerFillCondition?: 'first_hit' | 'complete_fill'
  ): Promise<OrderResponse> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    const instrument = await this.getInstrument(instrumentName);
    if (instrument) {
      const contractSize = instrument.contract_size;
      const minAmount = instrument.min_trade_amount;
      
      if (amount <= 0) {
        throw this.normalizeError(
          new Error(`Invalid amount: ${amount} must be greater than 0`),
          -32602
        );
      }
      
      if (amount < minAmount) {
        throw this.normalizeError(
          new Error(`Invalid amount: ${amount} is below minimum trade amount ${minAmount}`),
          -32602
        );
      }
      
      const decimalPlaces = Math.max(
        (amount.toString().split('.')[1] || '').length,
        (contractSize.toString().split('.')[1] || '').length
      );
      const scaleFactor = Math.pow(10, decimalPlaces);
      const scaledAmount = Math.round(amount * scaleFactor);
      const scaledContractSize = Math.round(contractSize * scaleFactor);
      
      if (scaledAmount % scaledContractSize !== 0) {
        throw this.normalizeError(
          new Error(`Invalid amount: ${amount} is not a multiple of contract size ${contractSize}`),
          -32602
        );
      }
    }

    try {
      const params: Record<string, unknown> = {
        instrument_name: instrumentName,
        amount,
        type: orderType,
      };

      if (price !== undefined && orderType !== 'market') {
        params.price = price;
      }

      if (label) {
        params.label = label;
      }

      if (linkedOrderType && otocoConfig && otocoConfig.length > 0) {
        params.linked_order_type = linkedOrderType;
        
        if (triggerFillCondition) {
          params.trigger_fill_condition = triggerFillCondition;
        }
        
        params.otoco_config = otocoConfig.map(order => {
          const config: Record<string, unknown> = {
            type: order.type,
          };
          
          if (order.amount !== undefined) {
            config.amount = order.amount;
          }
          
          if (order.price !== undefined) {
            config.price = order.price;
          }
          
          if (order.trigger_price !== undefined) {
            config.trigger_price = order.trigger_price;
          }
          
          if (order.trigger) {
            config.trigger = order.trigger;
          }

          if (order.reduce_only !== undefined) {
            config.reduce_only = order.reduce_only;
          }
          
          return config;
        });
      }

      const response = await this.callRPC<{ order: OrderResponse }>('private/buy', params);
      return response.order;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async placeSellOrder(
    instrumentName: string,
    amount: number,
    price?: number,
    orderType: string = 'market',
    label?: string,
    reduceOnly: boolean = false,
    trigger?: string
  ): Promise<OrderResponse> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    if (!reduceOnly) {
      const instrument = await this.getInstrument(instrumentName);
      if (instrument) {
        const contractSize = instrument.contract_size;
        const minAmount = instrument.min_trade_amount;
        
        if (amount <= 0) {
          throw this.normalizeError(
            new Error(`Invalid amount: ${amount} must be greater than 0`),
            -32602
          );
        }
        
        if (amount < minAmount) {
          throw this.normalizeError(
            new Error(`Invalid amount: ${amount} is below minimum trade amount ${minAmount}`),
            -32602
          );
        }
        
        const decimalPlaces = Math.max(
          (amount.toString().split('.')[1] || '').length,
          (contractSize.toString().split('.')[1] || '').length
        );
        const scaleFactor = Math.pow(10, decimalPlaces);
        const scaledAmount = Math.round(amount * scaleFactor);
        const scaledContractSize = Math.round(contractSize * scaleFactor);
        
        if (scaledAmount % scaledContractSize !== 0) {
          throw this.normalizeError(
            new Error(`Invalid amount: ${amount} is not a multiple of contract size ${contractSize}`),
            -32602
          );
        }
      }
    }

    try {
      const params: Record<string, unknown> = {
        instrument_name: instrumentName,
        amount,
        type: orderType,
        reduce_only: reduceOnly,
      };

      if (orderType === 'stop_market' && price !== undefined) {
        params.trigger_price = price;
        params.trigger = trigger || 'mark_price';
      } else if (price !== undefined && orderType !== 'market') {
        params.price = price;
      }

      if (label) {
        params.label = label;
      }

      const response = await this.callRPC<{ order: OrderResponse }>('private/sell', params);
      return response.order;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async closePosition(instrumentName: string, orderType: string = 'market'): Promise<OrderResponse> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    try {
      const params: Record<string, unknown> = {
        instrument_name: instrumentName,
        type: orderType,
      };

      const response = await this.callRPC<{ order: OrderResponse }>('private/close_position', params);
      return response.order;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async cancelAllByInstrument(instrumentName: string): Promise<number> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    try {
      const response = await this.callRPC<number>('private/cancel_all_by_instrument', {
        instrument_name: instrumentName,
      });
      return response;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getOpenOrders(instrumentName?: string): Promise<OrderResponse[]> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    try {
      const params: Record<string, unknown> = {};
      
      if (instrumentName) {
        params.instrument_name = instrumentName;
      }
      
      const response = await this.callRPC<OrderResponse[]>('private/get_open_orders_by_instrument', params);
      return response;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async cancelOrder(orderId: string): Promise<OrderResponse> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    try {
      const response = await this.callRPC<{ order: OrderResponse }>('private/cancel', {
        order_id: orderId,
      });
      return response.order;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
  
  async cancelAllOrders(instrumentName?: string): Promise<number> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    try {
      const params: Record<string, unknown> = {};
      
      if (instrumentName) {
        params.instrument_name = instrumentName;
      } else {
        params.currency = 'USDC';
      }
      
      const response = await this.callRPC<number>(
        instrumentName ? 'private/cancel_all_by_instrument' : 'private/cancel_all_by_currency',
        params
      );
      return response;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async subscribe(channels: string[], handler?: (channel: string, data: unknown) => void): Promise<void> {
    try {
      await this.callRPC('private/subscribe', {
        channels,
      });

      channels.forEach(channel => {
        this.activeSubscriptions.add(channel);
        if (handler) {
          this.subscriptionHandlers.set(channel, (data) => handler(channel, data));
        }
      });
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  onSubscription(channel: string, handler: (data: unknown) => void): void {
    this.subscriptionHandlers.set(channel, handler);
    this.activeSubscriptions.add(channel);
  }

  clearSubscriptions(): void {
    this.subscriptionHandlers.clear();
    this.activeSubscriptions.clear();
  }

  setTelemetryHooks(hooks: TelemetryHooks): void {
    this.telemetryHooks = { ...this.telemetryHooks, ...hooks };
  }

  async request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    try {
      return await globalRateLimiter.throttle(() => this.callRPC<T>(method, params));
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTradingViewChartData(
    instrumentName: string,
    startTimestamp: number,
    endTimestamp: number,
    resolution: string
  ): Promise<{
    ticks: number[];
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
  }> {
    try {
      const response = await this.callRPC<{
        ticks: number[];
        open: number[];
        high: number[];
        low: number[];
        close: number[];
        volume: number[];
      }>('public/get_tradingview_chart_data', {
        instrument_name: instrumentName,
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
        resolution,
      });
      return response;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getPositions(currency: string = 'USDC', kind?: string): Promise<Position[]> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    try {
      const params: Record<string, unknown> = {
        currency,
      };
      
      if (kind) {
        params.kind = kind;
      }
      
      const response = await this.callRPC<Position[]>('private/get_positions', params);
      return response || [];
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getPosition(instrumentName: string): Promise<Position | null> {
    if (!this.accessToken) {
      throw this.normalizeError(new Error('Not authenticated'));
    }

    try {
      const response = await this.callRPC<Position>('private/get_position', {
        instrument_name: instrumentName,
      });
      
      if (response && response.size !== 0) {
        return response;
      }
      return null;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
}

export type ConnectionState = 'Stopped' | 'Connecting' | 'Analyzing' | 'Active' | 'Error';

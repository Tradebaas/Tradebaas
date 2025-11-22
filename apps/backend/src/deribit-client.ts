/**
 * Backend Deribit Client
 * Node.js compatible WebSocket client for Deribit
 * Manages connection, authentication, and order execution
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import { updateWebSocketHealth, updateWebSocketHeartbeat } from './health';
import type { DeribitCredentials, DeribitEnvironment } from './types/shared';

// Re-export for convenience
export type { DeribitCredentials, DeribitEnvironment };

export interface DeribitOrder {
  instrument_name: string;
  amount: number;
  type: 'limit' | 'market' | 'stop_market';
  direction: 'buy' | 'sell';
  price?: number;
  post_only?: boolean;
  reduce_only?: boolean;
  label?: string;
}

export interface DeribitPosition {
  instrument_name: string;
  size: number;
  average_price: number;
  direction: 'buy' | 'sell' | 'zero';
  unrealized_pnl: number;
  realized_pnl: number;
}

export class BackendDeribitClient {
  private ws: WebSocket | null = null;
  private environment: DeribitEnvironment;
  private credentials: DeribitCredentials | null = null;
  private authenticated = false;
  private messageId = 1;
  private pendingRequests = new Map<number, { resolve: any; reject: any; timeout: NodeJS.Timeout }>();
  private subscriptions = new Map<string, (data: any) => void>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly requestTimeout = 30000; // 30 seconds
  
  // Reconnect strategy
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelays = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
  private circuitBreakerOpen = false;
  private circuitBreakerResetTimer: NodeJS.Timeout | null = null;

  constructor(environment: DeribitEnvironment = 'testnet') {
    this.environment = environment;
  }

  /**
   * Get WebSocket URL based on environment
   */
  private getWsUrl(): string {
    return this.environment === 'live'
      ? 'wss://www.deribit.com/ws/api/v2'
      : 'wss://test.deribit.com/ws/api/v2';
  }

  /**
   * Connect to Deribit and authenticate
   */
  async connect(credentials: DeribitCredentials): Promise<void> {
    this.credentials = credentials;

    return new Promise((resolve, reject) => {
      try {
        console.log(`[DeribitClient] Connecting to ${this.environment}...`);
        
        updateWebSocketHealth('disconnected');
        const ws = new WebSocket(this.getWsUrl());
        this.ws = ws;

        ws.on('open', async () => {
          console.log('[DeribitClient] WebSocket connected');
          
          try {
            await this.authenticate();
            this.startHeartbeat();
            
            // CRITICAL: Resubscribe to all channels after reconnect
            await this.resubscribeAll();
            
            updateWebSocketHealth('connected');
            updateWebSocketHeartbeat();
            console.log('[DeribitClient] Authenticated successfully');
            resolve();
          } catch (error) {
            updateWebSocketHealth('disconnected');
            reject(error);
          }
        });

        ws.on('message', (data: Buffer | string) => {
          this.handleMessage(data.toString());
          updateWebSocketHeartbeat();
        });

        ws.on('error', (error: Error) => {
          console.error('[DeribitClient] WebSocket error:', error);
          updateWebSocketHealth('disconnected');
          reject(error);
        });

        ws.on('close', () => {
          console.log('[DeribitClient] WebSocket closed');
          this.authenticated = false;
          updateWebSocketHealth('disconnected');
          this.cleanup();
          
          // AUTO-RECONNECT: Enable for 24/7 trading (backend-only)
          // Only reconnect if we have credentials (prevents reconnect after manual disconnect)
          if (this.credentials) {
            console.log('[DeribitClient] 🔄 Connection lost - scheduling auto-reconnect...');
            this.scheduleReconnect();
          } else {
            console.log('[DeribitClient] ⚠️ Connection closed - no credentials, manual reconnect required');
          }
        });
      } catch (error) {
        updateWebSocketHealth('disconnected');
        reject(error);
      }
    });
  }

  /**
   * Schedule reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[DeribitClient] ⛔ Max reconnect attempts reached, opening circuit breaker');
      this.openCircuitBreaker();
      return;
    }

    const delay = this.reconnectDelays[this.reconnectAttempts] || this.reconnectDelays[this.reconnectDelays.length - 1];
    this.reconnectAttempts++;

    console.log(`[DeribitClient] 🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
    updateWebSocketHealth('reconnecting');

    this.reconnectTimer = setTimeout(async () => {
      console.log(`[DeribitClient] Attempting reconnect (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      try {
        await this.connect(this.credentials!);
        // Success! Reset reconnect counter
        this.reconnectAttempts = 0;
        console.log('[DeribitClient] ✅ Reconnection successful');
      } catch (error) {
        console.error(`[DeribitClient] ❌ Reconnect attempt ${this.reconnectAttempts} failed:`, error);
        updateWebSocketHealth('disconnected');
        // scheduleReconnect will be called automatically on 'close' event
      }
    }, delay);
  }

  /**
   * Open circuit breaker (stop reconnect attempts)
   */
  private openCircuitBreaker(): void {
    this.circuitBreakerOpen = true;
    updateWebSocketHealth('disconnected');
    
    console.error('[DeribitClient] ⛔ Circuit breaker OPEN - reconnection disabled for 5 minutes');
    
    // TODO: Send Telegram alert
    // await telegramService.sendAlert(`WebSocket circuit breaker opened - ${this.maxReconnectAttempts} reconnect attempts failed`);
    
    // Reset circuit breaker after 5 minutes
    this.circuitBreakerResetTimer = setTimeout(() => {
      console.log('[DeribitClient] 🔓 Circuit breaker RESET - reconnection re-enabled');
      this.circuitBreakerOpen = false;
      this.reconnectAttempts = 0;
      
      // Attempt to reconnect
      if (this.credentials) {
        console.log('[DeribitClient] Attempting to reconnect after circuit breaker reset...');
        this.connect(this.credentials).catch(err => {
          console.error('[DeribitClient] Reconnect after circuit breaker reset failed:', err);
        });
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Authenticate with Deribit using credentials
   */
  private async authenticate(): Promise<void> {
    if (!this.credentials) {
      throw new Error('No credentials provided');
    }

    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const signature = this.generateSignature(timestamp, nonce);

    const response = await this.sendRequest('public/auth', {
      grant_type: 'client_signature',
      client_id: this.credentials.apiKey,
      timestamp,
      signature,
      nonce,
    });

    if (response.access_token) {
      this.authenticated = true;
    } else {
      throw new Error('Authentication failed');
    }
  }

  /**
   * Generate signature for authentication
   */
  private generateSignature(timestamp: number, nonce: string): string {
    if (!this.credentials) {
      throw new Error('No credentials');
    }

    const message = `${timestamp}\n${nonce}\n`;
    return crypto
      .createHmac('sha256', this.credentials.apiSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Send request to Deribit and wait for response
   */
  async sendRequest(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = this.messageId++;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.ws.send(JSON.stringify(message));
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle responses to requests
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject, timeout } = this.pendingRequests.get(message.id)!;
        clearTimeout(timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          reject(new Error(message.error.message || 'Unknown error'));
        } else {
          resolve(message.result);
        }
        return;
      }

      // Handle subscription notifications
      if (message.method === 'subscription') {
        const channel = message.params.channel;
        const callback = this.subscriptions.get(channel);
        if (callback) {
          callback(message.params.data);
        } else {
          console.warn(`[DeribitClient] ❌ No callback registered for channel: ${channel}`);
          console.warn(`[DeribitClient] Available channels:`, Array.from(this.subscriptions.keys()));
        }
        return;
      }

      // Handle heartbeat test_request
      if (message.method === 'heartbeat' && message.params?.type === 'test_request') {
        this.sendRequest('public/test');
      }
    } catch (error) {
      console.error('[DeribitClient] Error parsing message:', error);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    // Enable heartbeat
    this.sendRequest('public/set_heartbeat', { interval: 30 }).catch(err => {
      console.error('[DeribitClient] Failed to set heartbeat:', err);
    });

    // Send test every 25 seconds
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendRequest('public/test').catch(err => {
          console.error('[DeribitClient] Heartbeat test failed:', err);
        });
      }
    }, 25000);
  }

  /**
   * Place an order
   */
  async placeOrder(order: DeribitOrder): Promise<any> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const method = order.direction === 'buy' ? 'private/buy' : 'private/sell';
    
    // For stop orders, use trigger_price instead of price
    const params: any = {
      instrument_name: order.instrument_name,
      amount: order.amount,
      type: order.type,
      reduce_only: order.reduce_only,
      label: order.label,
    };

    // Handle different order types
    if (order.type === 'stop_market') {
      params.trigger_price = order.price; // Stop orders use trigger_price
      params.trigger = 'mark_price'; // Required for stop_market orders
    } else if (order.type === 'limit' && order.price) {
      params.price = order.price; // Limit orders use price
    }
    // Market orders don't need price/trigger_price

    if (order.post_only !== undefined) {
      params.post_only = order.post_only;
    }

    // Add OTOCO configuration if provided
    if ((order as any).otoco_config) {
      params.otoco_config = (order as any).otoco_config;
      console.log(`[DeribitClient] Adding OTOCO config:`, JSON.stringify(params.otoco_config, null, 2));
    }

    // Add linked order type if provided
    if ((order as any).linked_order_type) {
      params.linked_order_type = (order as any).linked_order_type;
      console.log(`[DeribitClient] Adding linked_order_type:`, params.linked_order_type);
    }

    // Add OCO ID if provided
    if ((order as any).oco_id) {
      params.oco_id = (order as any).oco_id;
      console.log(`[DeribitClient] Adding oco_id:`, params.oco_id);
    }
    
    console.log(`[DeribitClient] Placing ${order.type} ${order.direction} order:`, params);
    console.log(`[DeribitClient] Using method: ${method}`);
    console.log(`[DeribitClient] Full order object:`, order);
    console.log(`[DeribitClient] REDUCE_ONLY DEBUG - order.reduce_only:`, order.reduce_only, 'params.reduce_only:', params.reduce_only);
    
    try {
      const result = await this.sendRequest(method, params);
      console.log(`[DeribitClient] Order placed successfully:`, result);
      return result;
    } catch (error) {
      console.error(`[DeribitClient] Order placement failed:`, error);
      console.error(`[DeribitClient] Failed params:`, JSON.stringify(params, null, 2));
      throw error;
    }
  }

  /**
   * Place a buy order (convenience method)
   */
  async placeBuyOrder(
    instrument: string,
    amount: number,
    price?: number,
    type: 'market' | 'limit' | 'stop_market' = 'market',
    label?: string,
    reduceOnly: boolean = false,
    options?: {
      otoco_config?: Array<{
        direction: 'buy' | 'sell';
        amount: number;
        type: 'market' | 'limit' | 'stop_market';
        price?: number;
        trigger_price?: number;
        trigger?: 'index_price' | 'mark_price' | 'last_price';
        reduce_only?: boolean;
        label?: string;
        linked_order_type?: 'one_cancels_other' | 'one_triggers_other' | 'one_triggers_one_cancels_other';
      }>;
      linked_order_type?: 'one_cancels_other' | 'one_triggers_other' | 'one_triggers_one_cancels_other';
      trigger_fill_condition?: 'first_hit' | 'full_fill';
    }
  ): Promise<any> {
    const order: any = {
      instrument_name: instrument,
      amount,
      type,
      direction: 'buy',
      price,
      reduce_only: reduceOnly,
      label,
    };

    // Add OTOCO configuration if provided
    if (options?.otoco_config) {
      order.otoco_config = options.otoco_config;
    }

    // Add linked order type if provided
    if (options?.linked_order_type) {
      order.linked_order_type = options.linked_order_type;
    }

    // Add trigger fill condition if provided
    if (options?.trigger_fill_condition) {
      order.trigger_fill_condition = options.trigger_fill_condition;
    }

    return await this.placeOrder(order);
  }

  /**
   * Place a sell order (convenience method)
   */
  async placeSellOrder(
    instrument: string,
    amount: number,
    price?: number,
    type: 'market' | 'limit' | 'stop_market' = 'market',
    label?: string,
    reduceOnly: boolean = false,
    options?: {
      linked_order_type?: 'one_cancels_other' | 'one_triggers_other' | 'one_triggers_one_cancels_other';
      oco_id?: string;
      trigger_fill_condition?: 'first_hit' | 'full_fill';
      otoco_config?: Array<{
        direction: 'buy' | 'sell';
        amount: number;
        type: 'market' | 'limit' | 'stop_market';
        price?: number;
        trigger_price?: number;
        trigger?: 'index_price' | 'mark_price' | 'last_price';
        reduce_only?: boolean;
        label?: string;
        linked_order_type?: 'one_cancels_other' | 'one_triggers_other' | 'one_triggers_one_cancels_other';
      }>;
    }
  ): Promise<any> {
    const order: any = {
      instrument_name: instrument,
      amount,
      type,
      direction: 'sell',
      price,
      reduce_only: reduceOnly,
      label,
    };

    // Add OTOCO configuration if provided
    if (options?.otoco_config) {
      order.otoco_config = options.otoco_config;
    }

    // Add linked order type if provided
    if (options?.linked_order_type) {
      order.linked_order_type = options.linked_order_type;
    }

    // Add trigger fill condition if provided
    if (options?.trigger_fill_condition) {
      order.trigger_fill_condition = options.trigger_fill_condition;
    }

    // Add OCO ID if provided
    if (options?.oco_id) {
      order.oco_id = options.oco_id;
    }

    return await this.placeOrder(order);
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<any> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    return await this.sendRequest('private/get_order_state', {
      order_id: orderId,
    });
  }

  /**
   * Get positions
   */
  async getPositions(currency: string): Promise<any[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const result = await this.sendRequest('private/get_positions', {
      currency,
      kind: 'future',
    });

    return result || [];
  }

  /**
   * Get instrument details
   */
  async getInstrument(instrumentName: string): Promise<any> {
    const result = await this.sendRequest('public/get_instrument', {
      instrument_name: instrumentName,
    });

    return result;
  }

  /**
   * Get ticker (current market data)
   */
  async getTicker(instrumentName: string): Promise<any> {
    const result = await this.sendRequest('public/ticker', {
      instrument_name: instrumentName,
    });

    return result;
  }

  /**
   * Get historical candles (OHLC data)
   * @param instrument - e.g., "BTC_USDC-PERPETUAL"
   * @param resolution - "1" (1 min), "5" (5 min), "60" (1 hour), etc.
   * @param count - number of candles to fetch (max 10000)
   */
  async getCandles(instrument: string, resolution: string = '1', count: number = 100): Promise<any> {
    const endTime = Date.now();
    const startTime = endTime - (count * parseInt(resolution) * 60 * 1000);
    
    const result = await this.sendRequest('public/get_tradingview_chart_data', {
      instrument_name: instrument,
      resolution: resolution,
      start_timestamp: startTime,
      end_timestamp: endTime,
    });

    return result;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<any> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    return await this.sendRequest('private/cancel', {
      order_id: orderId,
    });
  }

  /**
   * Get open orders for an instrument
   */
  async getOpenOrders(instrument: string): Promise<any[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const result = await this.sendRequest('private/get_open_orders_by_instrument', {
      instrument_name: instrument,
    });

    return result || [];
  }

  /**
   * Get all open orders for a currency
   */
  async getOpenOrdersByCurrency(currency: string): Promise<any[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const result = await this.sendRequest('private/get_open_orders_by_currency', {
      currency,
      kind: 'future',
    });

    return result || [];
  }

  /**
   * Get account summary
   */
  async getAccountSummary(currency: string = 'BTC'): Promise<any> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    return await this.sendRequest('private/get_account_summary', {
      currency,
      extended: true,
    });
  }

  /**
   * Cancel all orders for an instrument
   */
  async cancelAllByInstrument(instrument: string): Promise<number> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const result = await this.sendRequest('private/cancel_all_by_instrument', {
      instrument_name: instrument,
    });

    return result?.length || 0;
  }

  /**
   * Close position for an instrument
   */
  async closePosition(instrument: string, type: 'limit' | 'market' = 'market', price?: number): Promise<any> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const params: any = {
      instrument_name: instrument,
      type,
    };

    if (type === 'limit' && price) {
      params.price = price;
    }

    return await this.sendRequest('private/close_position', params);
  }


  /**
   * Subscribe to ticker updates
   */
  async subscribeTicker(instrument: string, callback: (data: any) => void): Promise<void> {
    const channel = `ticker.${instrument}.raw`;
    
    console.log(`[DeribitClient] Subscribing to ${channel}...`);
    
    // First check if instrument exists
    try {
      const instrumentInfo = await this.getInstrument(instrument);
      if (!instrumentInfo) {
        throw new Error(`Instrument ${instrument} not found`);
      }
      console.log(`[DeribitClient] ✅ Instrument ${instrument} exists: ${instrumentInfo.instrument_name}`);
    } catch (error) {
      console.error(`[DeribitClient] ❌ Instrument ${instrument} not found or error checking:`, error);
      throw new Error(`Cannot subscribe to ticker for non-existent instrument ${instrument}`);
    }
    
    // Store callback BEFORE subscribing
    this.subscriptions.set(channel, callback);
    
    try {
      const result = await this.sendRequest('public/subscribe', {
        channels: [channel],
      });
      
      console.log(`[DeribitClient] ✅ Successfully subscribed to ${channel}`);
      console.log(`[DeribitClient] Subscription result:`, JSON.stringify(result));
      console.log(`[DeribitClient] Active subscriptions:`, Array.from(this.subscriptions.keys()));
      
      // Test callback immediately to verify it works
      if (this.subscriptions.has(channel)) {
        console.log(`[DeribitClient] ✅ Callback registered for ${channel}`);
      } else {
        console.error(`[DeribitClient] ❌ Callback NOT found for ${channel}!`);
      }
    } catch (error) {
      console.error(`[DeribitClient] ❌ Failed to subscribe to ${channel}:`, error);
      this.subscriptions.delete(channel);
      throw error;
    }
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel: string): Promise<void> {
    this.subscriptions.delete(channel);

    await this.sendRequest('public/unsubscribe', {
      channels: [channel],
    });

    console.log(`[DeribitClient] Unsubscribed from ${channel}`);
  }

  /**
   * Resubscribe to all channels after reconnect
   * CRITICAL: This ensures ticker data keeps flowing after WebSocket reconnects
   */
  private async resubscribeAll(): Promise<void> {
    const channels = Array.from(this.subscriptions.keys());
    
    if (channels.length === 0) {
      console.log('[DeribitClient] No subscriptions to restore');
      return;
    }

    console.log(`[DeribitClient] 🔄 Resubscribing to ${channels.length} channel(s) after reconnect...`);
    
    try {
      // Resubscribe to all channels in one request (more efficient)
      await this.sendRequest('public/subscribe', {
        channels: channels,
      });
      
      console.log(`[DeribitClient] ✅ Successfully resubscribed to all channels:`, channels);
    } catch (error) {
      console.error('[DeribitClient] ❌ Failed to resubscribe to channels:', error);
      // Don't throw - connection is still valid, just no subscriptions
    }
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    console.log('[DeribitClient] Disconnecting...');
    this.cleanup();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Cleanup timers and pending requests
   */
  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.circuitBreakerResetTimer) {
      clearTimeout(this.circuitBreakerResetTimer);
      this.circuitBreakerResetTimer = null;
    }

    // Reject all pending requests
    for (const [id, { reject, timeout }] of this.pendingRequests.entries()) {
      clearTimeout(timeout);
      reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Check if connected and authenticated
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.authenticated;
  }
}

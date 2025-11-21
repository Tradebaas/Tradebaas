import WebSocket from 'ws';
import EventEmitter from 'events';
import { config } from '../config';
import { logExchange } from './auditService';

export interface RealtimeUpdate {
  type: 'ticker' | 'orderbook' | 'position' | 'order' | 'balance';
  symbol?: string;
  data: any;
  timestamp: number;
}

export class BitgetRealtimeService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private pingInterval: NodeJS.Timeout | null = null;
  private subscriptions = new Set<string>();
  private isConnecting = false;

  constructor() {
    super();
    this.setMaxListeners(0); // Remove limit for listeners
  }

  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    
    try {
      // Bitget WebSocket URL
      const wsUrl = 'wss://ws.bitget.com/mix/v1/stream';
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        console.log('[Bitget WS] Connected to Bitget WebSocket');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startPing();
        this.emit('connected');
        
        // Re-subscribe to all previous subscriptions
        this.resubscribe();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('[Bitget WS] Failed to parse message:', error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`[Bitget WS] Connection closed: ${code} ${reason.toString()}`);
        this.isConnecting = false;
        this.stopPing();
        this.ws = null;
        this.emit('disconnected');
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => this.reconnect(), this.reconnectDelay);
        }
      });

      this.ws.on('error', (error: Error) => {
        console.error('[Bitget WS] WebSocket error:', error);
        this.isConnecting = false;
        this.emit('error', error);
      });

    } catch (error) {
      this.isConnecting = false;
      console.error('[Bitget WS] Failed to connect:', error);
      throw error;
    }
  }

  private async reconnect(): Promise<void> {
    this.reconnectAttempts++;
    console.log(`[Bitget WS] Reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    try {
      await this.connect();
    } catch (error) {
      console.error('[Bitget WS] Reconnection failed:', error);
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => this.reconnect(), this.reconnectDelay * this.reconnectAttempts);
      } else {
        console.error('[Bitget WS] Max reconnection attempts reached');
        this.emit('maxReconnectAttemptsReached');
      }
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private resubscribe(): void {
    for (const subscription of this.subscriptions) {
      this.sendSubscription(subscription);
    }
  }

  private sendSubscription(channel: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      op: 'subscribe',
      args: [channel]
    };

    this.ws.send(JSON.stringify(message));
    console.log(`[Bitget WS] Subscribed to ${channel}`);
  }

  private handleMessage(message: any): void {
    try {
      // Handle different message types
      if (message.event === 'subscribe') {
        console.log(`[Bitget WS] Subscription confirmed for ${message.arg}`);
        return;
      }

      if (message.event === 'error') {
        console.error('[Bitget WS] Server error:', message);
        return;
      }

      // Handle data messages
      if (message.action === 'snapshot' || message.action === 'update') {
        const { arg, data } = message;
        
        if (!arg || !data) return;

        // Parse channel to determine data type
        const [instType, channel, symbol] = arg.split(':');
        
        let updateType: RealtimeUpdate['type'];
        let processedData: any;

        switch (channel) {
          case 'ticker':
            updateType = 'ticker';
            processedData = this.processTicker(data[0]);
            break;
          case 'books':
          case 'books5':
          case 'books15':
            updateType = 'orderbook';
            processedData = this.processOrderBook(data[0]);
            break;
          case 'positions':
            updateType = 'position';
            processedData = this.processPosition(data);
            break;
          case 'orders':
            updateType = 'order';
            processedData = this.processOrder(data);
            break;
          case 'account':
            updateType = 'balance';
            processedData = this.processBalance(data);
            break;
          default:
            console.log(`[Bitget WS] Unknown channel: ${channel}`);
            return;
        }

        const update: RealtimeUpdate = {
          type: updateType,
          symbol,
          data: processedData,
          timestamp: Date.now()
        };

        this.emit('update', update);
        this.emit(updateType, update);

      }
    } catch (error) {
      console.error('[Bitget WS] Error processing message:', error);
    }
  }

  private processTicker(data: any): any {
    return {
      symbol: data.instId,
      price: parseFloat(data.lastPr),
      change24h: parseFloat(data.change24h || '0'),
      changePercentage: parseFloat(data.changeUtc || '0'),
      volume: parseFloat(data.baseVolume || '0'),
      high24h: parseFloat(data.high24h || '0'),
      low24h: parseFloat(data.low24h || '0'),
      timestamp: parseInt(data.ts)
    };
  }

  private processOrderBook(data: any): any {
    return {
      symbol: data.instId,
      bids: data.bids?.map((bid: string[]) => [parseFloat(bid[0]), parseFloat(bid[1])]) || [],
      asks: data.asks?.map((ask: string[]) => [parseFloat(ask[0]), parseFloat(ask[1])]) || [],
      timestamp: parseInt(data.ts)
    };
  }

  private processPosition(data: any[]): any[] {
    return data.map(pos => ({
      symbol: pos.instId,
      side: pos.holdSide,
      size: parseFloat(pos.total || '0'),
      entryPrice: parseFloat(pos.averageOpenPrice || '0'),
      markPrice: parseFloat(pos.markPx || '0'),
      pnl: parseFloat(pos.unrealizedPL || '0'),
      margin: parseFloat(pos.margin || '0'),
      leverage: parseFloat(pos.leverage || '1'),
      timestamp: parseInt(pos.ts || Date.now().toString())
    }));
  }

  private processOrder(data: any[]): any[] {
    return data.map(order => ({
      orderId: order.ordId,
      symbol: order.instId,
      side: order.side,
      type: order.ordType,
      size: parseFloat(order.sz || '0'),
      price: order.px ? parseFloat(order.px) : undefined,
      filledSize: parseFloat(order.fillSz || '0'),
      averageFillPrice: order.avgPx ? parseFloat(order.avgPx) : undefined,
      status: order.state,
      timestamp: parseInt(order.uTime || order.cTime || Date.now().toString())
    }));
  }

  private processBalance(data: any[]): any[] {
    return data.map(balance => ({
      coin: balance.ccy,
      available: parseFloat(balance.availBal || '0'),
      total: parseFloat(balance.bal || '0'),
      frozen: parseFloat(balance.frozenBal || '0'),
      timestamp: parseInt(balance.uTime || Date.now().toString())
    }));
  }

  // Public subscription methods
  subscribeTicker(symbol: string): void {
    const channel = `mc:ticker:${symbol}`;
    this.subscriptions.add(channel);
    this.sendSubscription(channel);
  }

  subscribeOrderBook(symbol: string, depth: '5' | '15' | 'books' = '15'): void {
    const channel = `mc:books${depth === 'books' ? '' : depth}:${symbol}`;
    this.subscriptions.add(channel);
    this.sendSubscription(channel);
  }

  subscribePositions(): void {
    // Private channel - would need authentication
    const channel = 'mc:positions';
    this.subscriptions.add(channel);
    this.sendSubscription(channel);
  }

  subscribeOrders(): void {
    // Private channel - would need authentication
    const channel = 'mc:orders';
    this.subscriptions.add(channel);
    this.sendSubscription(channel);
  }

  subscribeBalance(): void {
    // Private channel - would need authentication
    const channel = 'mc:account';
    this.subscriptions.add(channel);
    this.sendSubscription(channel);
  }

  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        op: 'unsubscribe',
        args: [channel]
      };
      this.ws.send(JSON.stringify(message));
      console.log(`[Bitget WS] Unsubscribed from ${channel}`);
    }
  }

  disconnect(): void {
    this.stopPing();
    this.subscriptions.clear();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getSubscriptions(): Set<string> {
    return new Set(this.subscriptions);
  }
}

// Singleton instance
export const bitgetRealtimeService = new BitgetRealtimeService();

import { LIVE_ENABLED } from '../config';

// Auto-connect if live enabled
if (LIVE_ENABLED && config.bitget.apiKey) {
  bitgetRealtimeService.connect().catch(err => {
    console.error('[Bitget WS] Auto-connect failed:', err);
  });
}

/**
 * Analysis WebSocket Server (FRONTEND-002)
 * Provides real-time updates for strategy state and position
 */

import WebSocket, { WebSocketServer } from 'ws';
import { StrategyManager } from '../lifecycle/StrategyManager';
import { MetricsCollector } from '../monitoring/metrics';
import { log } from '../logger';
import type { IncomingMessage } from 'http';

export interface WebSocketMessage {
  type: string;
  channel?: string;
  data?: any;
}

export interface StrategyUpdateMessage {
  type: 'strategyUpdate';
  timestamp: number;
  data: {
    strategyName: string | null;
    instrument: string | null;
    state: string;
    isActive: boolean;
    position: {
      entryPrice: number | null;
      size: number | null;
      side: 'long' | 'short' | null;
    } | null;
  };
}

export class AnalysisWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private strategyManager: StrategyManager;
  private metricsCollector: MetricsCollector;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 1000;
  
  // Rate limiting (SEC-002 enhancement)
  private connectionsByIp: Map<string, number> = new Map();
  private readonly MAX_CONNECTIONS_PER_IP = 5;

  constructor() {
    this.strategyManager = StrategyManager.getInstance();
    this.metricsCollector = MetricsCollector.getInstance();
  }

  public start(port: number = 3001): void {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', this.handleConnection.bind(this));
    this.strategyManager.on('stateChange', this.broadcastStrategyUpdate.bind(this));
    this.startPeriodicUpdates();
    log.info('WebSocket server started', { port, service: 'AnalysisWebSocket' });
  }

  public startWithServer(server: any): void {
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', this.handleConnection.bind(this));
    this.strategyManager.on('stateChange', this.broadcastStrategyUpdate.bind(this));
    this.startPeriodicUpdates();
    log.info('WebSocket server started with HTTP server', { service: 'AnalysisWebSocket' });
  }

  public stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.clients.forEach(client => client.close());
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    log.info('WebSocket server stopped', { service: 'AnalysisWebSocket', clientCount: this.clients.size });
  }

  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    // Rate limiting: Check connections per IP
    const clientIp = request.socket.remoteAddress || 'unknown';
    const currentConnections = this.connectionsByIp.get(clientIp) || 0;
    
    if (currentConnections >= this.MAX_CONNECTIONS_PER_IP) {
      log.warn('WebSocket connection rejected - rate limit exceeded', { 
        service: 'AnalysisWebSocket', 
        ip: clientIp,
        currentConnections,
        maxAllowed: this.MAX_CONNECTIONS_PER_IP,
      });
      ws.close(1008, 'Too many connections from this IP');
      return;
    }
    
    // Track connection
    this.connectionsByIp.set(clientIp, currentConnections + 1);
    
    log.info('WebSocket client connected', { 
      service: 'AnalysisWebSocket', 
      clientCount: this.clients.size + 1,
      ip: clientIp,
    });
    this.clients.add(ws);
    this.sendStrategyUpdate(ws);

    ws.on('message', (data: Buffer | string) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleClientMessage(ws, message);
      } catch (error) {
        log.error('Invalid WebSocket message received', { 
          service: 'AnalysisWebSocket', 
          error: error instanceof Error ? error.message : String(error) 
        });
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      // Cleanup connection tracking
      const clientIp = request.socket.remoteAddress || 'unknown';
      const currentConnections = this.connectionsByIp.get(clientIp) || 0;
      if (currentConnections > 0) {
        this.connectionsByIp.set(clientIp, currentConnections - 1);
        if (currentConnections - 1 === 0) {
          this.connectionsByIp.delete(clientIp);
        }
      }
      
      log.info('WebSocket client disconnected', { 
        service: 'AnalysisWebSocket', 
        clientCount: this.clients.size - 1,
        ip: clientIp,
      });
      this.clients.delete(ws);
    });

    ws.on('error', (error: Error) => {
      // Cleanup connection tracking
      const clientIp = request.socket.remoteAddress || 'unknown';
      const currentConnections = this.connectionsByIp.get(clientIp) || 0;
      if (currentConnections > 0) {
        this.connectionsByIp.set(clientIp, currentConnections - 1);
        if (currentConnections - 1 === 0) {
          this.connectionsByIp.delete(clientIp);
        }
      }
      
      log.error('WebSocket error occurred', { 
        service: 'AnalysisWebSocket', 
        error: error.message,
        stack: error.stack,
        ip: clientIp,
      });
      this.clients.delete(ws);
    });
  }

  private handleClientMessage(ws: WebSocket, message: WebSocketMessage): void {
    switch (message.type) {
      case 'subscribe':
        if (message.channel === 'strategy') {
          this.sendStrategyUpdate(ws);
        }
        break;
      case 'ping':
        this.send(ws, { type: 'pong', timestamp: Date.now() });
        break;
      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  private broadcastStrategyUpdate(): void {
    const state = this.strategyManager.getState();
    const message: StrategyUpdateMessage = {
      type: 'strategyUpdate',
      timestamp: Date.now(),
      data: {
        strategyName: state.strategyName,
        instrument: state.instrument,
        state: state.state,
        isActive: this.strategyManager.isStrategyActive(),
        position: state.positionEntryPrice !== null ? {
          entryPrice: state.positionEntryPrice,
          size: state.positionSize,
          side: state.positionSide,
        } : null,
      },
    };
    this.broadcast(message);
  }

  private sendStrategyUpdate(ws: WebSocket): void {
    const state = this.strategyManager.getState();
    const message: StrategyUpdateMessage = {
      type: 'strategyUpdate',
      timestamp: Date.now(),
      data: {
        strategyName: state.strategyName,
        instrument: state.instrument,
        state: state.state,
        isActive: this.strategyManager.isStrategyActive(),
        position: state.positionEntryPrice !== null ? {
          entryPrice: state.positionEntryPrice,
          size: state.positionSize,
          side: state.positionSide,
        } : null,
      },
    };
    this.send(ws, message);
  }

  private startPeriodicUpdates(): void {
    this.updateInterval = setInterval(() => {
      this.broadcastStrategyUpdate();
    }, this.UPDATE_INTERVAL_MS);
  }

  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, { type: 'error', error, timestamp: Date.now() });
  }

  public getClientCount(): number {
    return this.clients.size;
  }
}

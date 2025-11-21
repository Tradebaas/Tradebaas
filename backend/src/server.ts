#!/usr/bin/env node
/**
 * Tradebaas Backend HTTP Server
 * Exposes REST API for broker connections and strategy management
 */

import 'dotenv/config';
import Fastify from 'fastify';
// import cors from '@fastify/cors'; // DISABLED - using manual CORS headers
import rateLimit from '@fastify/rate-limit';
import { checkHealth, checkReady } from './health';
import { credentialsManager, type SaveCredentialsRequest } from './credentials-manager';
import { strategyService, type StartStrategyRequest, type StopStrategyRequest } from './strategy-service';
import { createReconciliationService, getReconciliationService } from './services/reconciliation-service';
import { getTradeHistoryService } from './services/trade-history';
import { 
  handleGetStrategyStatus, 
  handleStartStrategy, 
  handleStopStrategy,
  handleGetTradeHistory,
  handleGetTradeStats,
  handleSyncCurrentPosition,
  type StrategyStartRequest as NewStrategyStartRequest
} from './api';
import { AnalysisWebSocketServer } from './websocket/AnalysisWebSocket';
import { log } from './logger';
import { telegramService } from './notifications/telegram';

import { kvStorage } from './kv-storage';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Changed from 127.0.0.1 to allow external access

// CORS whitelist configuration (SEC-003)
const FRONTEND_URLS = (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174,http://localhost:5000').split(',');
const PRODUCTION_URLS = ['https://app.tradebazen.nl', 'https://www.tradebazen.nl'];
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production' 
  ? PRODUCTION_URLS 
  : [...FRONTEND_URLS, ...PRODUCTION_URLS];

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Manual CORS headers - using onRequest hook to set headers on ALL responses
server.addHook('onRequest', (request, reply, done) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  reply.header('Access-Control-Max-Age', '86400');
  
  // Chrome Private Network Access (PNA) - allow requests from public to private network
  reply.header('Access-Control-Allow-Private-Network', 'true');
  
  done();
});

// Handle OPTIONS preflight separately
server.addHook('onRequest', (request, reply, done) => {
  if (request.method === 'OPTIONS') {
    reply.code(204).send();
    return; // Don't call done() - request is finished
  }
  done();
});

// Rate limiting (SEC-002) - TEMPORARILY DISABLED for debugging
// server.register(rateLimit, {
//   max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // Increased from 10 to 100
//   timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
//   cache: 10000, // Cache size
//   allowList: (req) => {
//     // Allow health checks and OPTIONS (preflight) to bypass rate limiting
//     return req.url === '/health' || req.url === '/ready' || req.method === 'OPTIONS';
//   },
//   onExceeding: (req) => {
//     log.warn('Rate limit exceeded', {
//       ip: req.ip,
//       url: req.url,
//     });
//   },
// });

// Initialize WebSocket server (Iteration 7)
const wsServer = new AnalysisWebSocketServer();

// Health check endpoint - returns 200/503 based on actual health
server.get('/health', async (request, reply) => {
  try {
    const health = await checkHealth();
    
    // Return 503 if unhealthy, 200 if healthy or degraded
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    
    return reply.code(statusCode).send(health);
  } catch (error: unknown) {
    request.log.error({ error }, 'Health check failed');
    return reply.code(503).send({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Readiness check endpoint - returns 200 only when ready
server.get('/ready', async (request, reply) => {
  try {
    const readiness = await checkReady();
    
    const statusCode = readiness.ready ? 200 : 503;
    
    return reply.code(statusCode).send(readiness);
  } catch (error: unknown) {
    request.log.error({ error }, 'Readiness check failed');
    return reply.code(503).send({
      ready: false,
      error: 'Readiness check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================================
// NEW Strategy API Endpoints (Iteration 7 - FRONTEND-001)
// ============================================================================

// GET /api/connection/status - Real-time connection status
server.get('/api/connection/status', async (request, reply) => {
  try {
    const connectionStatus = strategyService.getConnectionStatus();
    const healthMetrics = strategyService.getHealthMetrics();
    
    // Get detailed WebSocket status
    const detailedStatus = {
      connected: connectionStatus.connected,
      environment: connectionStatus.environment,
      broker: connectionStatus.broker || 'deribit',
      connectedAt: connectionStatus.connectedAt,
      uptime: connectionStatus.connectedAt ? Date.now() - connectionStatus.connectedAt : 0,
      manuallyDisconnected: connectionStatus.manuallyDisconnected || false,
      websocket: {
        connected: connectionStatus.connected,
        authenticated: connectionStatus.connected, // If connected, we're authenticated
        lastPing: Date.now(), // Current timestamp as "last ping"
      },
      health: {
        strategies: healthMetrics.strategiesActive,
        errors: healthMetrics.errors24h || 0,
      },
      timestamp: Date.now()
    };

    return reply.send({
      success: true,
      ...detailedStatus
    });
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      connected: false,
      error: error.message || 'Failed to get connection status',
      timestamp: Date.now()
    });
  }
});

// DEBUG ENDPOINT: Get detailed strategy state for diagnostics
server.get('/api/debug/strategies', async (request, reply) => {
  try {
    const strategies = await strategyService.getStrategyStatus();
    return reply.send({
      success: true,
      count: strategies.length,
      strategies: strategies.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        startedAt: s.startedAt,
        hasAnalysis: !!s.analysisState,
        analysisStatus: s.analysisState?.status,
        analysisCheckpoints: s.analysisState?.checkpoints?.length || 0,
        hasPosition: !!s.position,
        hasMetrics: !!s.metrics,
      })),
      timestamp: Date.now()
    });
  } catch (error: any) {
    log.error('Debug endpoint failed', { error: error.message, stack: error.stack });
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to get debug info',
    });
  }
});

// GET /api/strategy/status - Get current strategy status
server.get('/api/strategy/status/v2', async (request, reply) => {
  try {
    const response = await handleGetStrategyStatus();
    return reply.send(response);
  } catch (error: any) {
    log.error('Failed to get strategy status', { error: error.message, stack: error.stack });
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to get strategy status',
    });
  }
});

// POST /api/strategy/start - Start strategy (new API)
server.post<{ Body: NewStrategyStartRequest }>('/api/strategy/start/v2', async (request, reply) => {
  log.info('Strategy start request received', { body: request.body });
  try {
    const response = await handleStartStrategy(request.body);
    const statusCode = response.success ? 200 : 400;
    return reply.code(statusCode).send(response);
  } catch (error: any) {
    log.error('Failed to start strategy', { error: error.message, stack: error.stack, body: request.body });
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to start strategy',
    });
  }
});

// POST /api/strategy/stop - Stop strategy (new API)
server.post('/api/strategy/stop/v2', async (request, reply) => {
  log.info('Strategy stop request received');
  try {
    const response = await handleStopStrategy();
    const statusCode = response.success ? 200 : 400;
    return reply.code(statusCode).send(response);
  } catch (error: any) {
    log.error('Failed to stop strategy', { error: error.message, stack: error.stack });
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to stop strategy',
    });
  }
});

// ============================================================================
// LEGACY Strategy management endpoints (keep for backward compatibility)
// ============================================================================

server.post<{ Body: StartStrategyRequest }>('/api/strategy/start', async (request) => {
  log.info('Legacy strategy start request received', { body: request.body });
  try {
    return await strategyService.startStrategy(request.body);
  } catch (error: any) {
    log.error('Legacy strategy start failed', { error: error.message, stack: error.stack, body: request.body });
    return {
      success: false,
      strategyId: '',
      message: error.message || 'Failed to start strategy',
    };
  }
});

server.post<{ Body: StopStrategyRequest }>('/api/strategy/stop', async (request) => {
  log.info('Legacy strategy stop request received', { body: request.body });
  try {
    return await strategyService.stopStrategy(request.body);
  } catch (error: any) {
    log.error('Legacy strategy stop failed', { error: error.message, stack: error.stack, body: request.body });
    return {
      success: false,
      message: error.message || 'Failed to stop strategy',
    };
  }
});

server.get('/api/strategy/status', async (request) => {
  const { strategyId } = request.query as { strategyId?: string };
  const strategies = await strategyService.getStrategyStatus(strategyId);
  return {
    success: true,
    strategies,
    connection: strategyService.getConnectionStatus(),
  };
});

// Get strategy analysis state (real-time monitoring data)
server.get('/api/strategy/analysis/:strategyId', async (request, reply) => {
  const { strategyId } = request.params as { strategyId: string };
  
  // Enhanced logging for debugging
  log.info('[API] Analysis request received', { strategyId });
  
  try {
    const analysis = await strategyService.getStrategyAnalysis(strategyId);

    // If service returns null, the strategy itself does not exist
    if (!analysis) {
      log.warn('[API] Strategy not found for analysis', { strategyId });
      // Also log what strategies DO exist for debugging
      const allStrategies = await strategyService.getStrategyStatus();
      log.warn('[API] Available strategies', { 
        count: allStrategies.length,
        ids: allStrategies.map(s => ({ id: s.id, name: s.name, status: s.status }))
      });
      return reply.code(404).send({
        success: false,
        error: 'Strategy not found',
      });
    }

    // For existing strategies, StrategyService always returns an AnalysisState
    // (either real data or a safe default warm-up state)
    log.info('[API] Analysis returned successfully', { 
      strategyId, 
      status: analysis.status,
      hasCheckpoints: !!analysis.checkpoints?.length 
    });
    return reply.send({
      success: true,
      analysis,
    });
  } catch (error: any) {
    log.error('[API] Analysis request failed', { strategyId, error: error.message, stack: error.stack });
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to get analysis data',
    });
  }
});

// Get strategy position metrics (P&L, risk, timing)
server.get('/api/strategy/metrics/:strategyId', async (request, reply) => {
  const { strategyId } = request.params as { strategyId: string };
  try {
    const metrics = await strategyService.getStrategyMetrics(strategyId);
    if (!metrics) {
      return reply.code(404).send({
        success: false,
        error: 'No position metrics available for this strategy',
      });
    }
    return {
      success: true,
      metrics,
    };
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to get metrics',
    });
  }
});

server.post('/api/killswitch', async () => {
  log.warn('Kill switch activated');
  try {
    await strategyService.killSwitch();
    return {
      success: true,
      message: 'Kill switch activated - all strategies stopped',
    };
  } catch (error: any) {
    log.error('Kill switch activation failed', { error: error.message, stack: error.stack });
    return {
      success: false,
      message: error.message || 'Failed to activate kill switch',
    };
  }
});

// Credentials management endpoints (generic for all services)
server.get('/api/credentials/:service', async (request) => {
  const { service } = request.params as { service: string };
  return await credentialsManager.getCredentials(service);
});

server.post<{ Body: SaveCredentialsRequest }>('/api/credentials', async (request) => {
  return await credentialsManager.saveCredentials(request.body);
});

server.delete('/api/credentials/:service', async (request) => {
  const { service } = request.params as { service: string };
  return await credentialsManager.deleteCredentials(service);
});

// Broker connection endpoint (manual connect only)
server.post<{ Body: { environment: 'testnet' | 'live' } }>('/api/v2/connect', async (request, reply) => {
  try {
    const { environment } = request.body;
    
    if (!environment || !['testnet', 'live'].includes(environment)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid environment. Must be "testnet" or "live"',
      });
    }

    console.log(`[API] Manual connect requested: ${environment}`);
    
    // Connect to broker
    await strategyService.connect(environment);
    
    console.log(`[API] Successfully connected to ${environment}`);
    
    return {
      success: true,
      message: `Connected to Deribit ${environment}`,
      environment,
    };
  } catch (error: any) {
    console.error('[API] Connection failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Connection failed',
    });
  }
});

// Broker disconnect endpoint
server.post('/api/v2/disconnect', async (request, reply) => {
  try {
    console.log('[API] Manual disconnect requested');
    
    await strategyService.disconnect();
    
    console.log('[API] Successfully disconnected');
    
    return {
      success: true,
      message: 'Disconnected from broker',
    };
  } catch (error: any) {
    console.error('[API] Disconnect failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Disconnect failed',
    });
  }
});

// Get account balance
server.get('/api/v2/balance', async (request, reply) => {
  try {
    const connectionStatus = strategyService.getConnectionStatus();
    
    if (!connectionStatus.connected) {
      return reply.code(400).send({
        success: false,
        error: 'Not connected to broker',
      });
    }
    
    // Get USDC balance (for perpetuals trading)
    const balance = await strategyService.getBalance('USDC');
    
    if (!balance) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch balance from broker',
      });
    }
    
    console.log('[API] Balance fetched:', balance);
    
    return {
      success: true,
      balance,
    };
  } catch (error: any) {
    console.error('[API] Balance fetch failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to fetch balance',
    });
  }
});

// Get open positions
server.get('/api/v2/positions', async (request, reply) => {
  try {
    const connectionStatus = strategyService.getConnectionStatus();
    
    if (!connectionStatus.connected) {
      return reply.code(400).send({
        success: false,
        error: 'Not connected to broker',
      });
    }
    
    const positions = await strategyService.getPositions('USDC');
    
    return {
      success: true,
      positions,
    };
  } catch (error: any) {
    console.error('[API] Failed to get positions:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to get positions',
    });
  }
});

// Get open orders for instrument
server.get('/api/v2/orders/:instrument', async (request, reply) => {
  try {
    const { instrument } = request.params as { instrument: string };
    const connectionStatus = strategyService.getConnectionStatus();
    
    if (!connectionStatus.connected) {
      return reply.code(400).send({
        success: false,
        error: 'Not connected to broker',
      });
    }
    
    const orders = await strategyService.getOpenOrders(instrument);
    
    return {
      success: true,
      orders: orders || [],
    };
  } catch (error: any) {
    console.error('[API] Failed to get orders:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to get orders',
    });
  }
});

// Get ticker data for instrument
server.get('/api/v2/ticker/:instrument', async (request, reply) => {
  try {
    const { instrument } = request.params as { instrument: string };
    const connectionStatus = strategyService.getConnectionStatus();
    
    if (!connectionStatus.connected) {
      return reply.code(400).send({
        success: false,
        error: 'Not connected to broker',
      });
    }
    
    const ticker = await strategyService.getTicker(instrument);
    
    if (!ticker) {
      return reply.code(404).send({
        success: false,
        error: `Ticker data not found for ${instrument}`,
      });
    }
    
    return {
      success: true,
      ticker,
    };
  } catch (error: any) {
    console.error('[API] Failed to get ticker:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to get ticker',
    });
  }
});

// Test micro order endpoint (with stop loss and take profit)
server.post('/api/v2/test-order', async (request, reply) => {
  try {
    // Use both connection checks for safety
    const connectionStatus = strategyService.getConnectionStatus();
    
    if (!connectionStatus.connected) {
      return reply.code(400).send({
        success: false,
        error: 'Not connected to broker - WebSocket connection lost',
      });
    }
    
    console.log('[API] Test order request with connection:', connectionStatus);
    
    const result = await strategyService.placeTestOrder();
    
    if (result.success) {
      console.log('[API] Test order placed successfully:', result);
      return reply.send(result);
    } else {
      console.error('[API] Test order failed:', result.error);
      return reply.code(400).send(result);
    }
  } catch (error: any) {
    console.error('[API] Test order endpoint error:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to place test order',
    });
  }
});

// Close position manually
server.post<{ Body: { instrument: string } }>('/api/v2/positions/close', async (request, reply) => {
  try {
    const { instrument } = request.body;
    
    if (!instrument) {
      return reply.code(400).send({
        success: false,
        error: 'Missing instrument parameter',
      });
    }
    
    const connectionStatus = strategyService.getConnectionStatus();
    
    if (!connectionStatus.connected) {
      return reply.code(400).send({
        success: false,
        error: 'Not connected to broker',
      });
    }
    
    await strategyService.closePosition(instrument);
    
    return {
      success: true,
      message: `Position closed for ${instrument}`,
    };
  } catch (error: any) {
    console.error('[API] Failed to close position:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to close position',
    });
  }
});

// Add or update stop loss for current open position
server.post<{ Body: { instrument: string; price?: number; percent?: number } }>('/api/v2/positions/add-sl', async (request, reply) => {
  try {
    const { instrument, price, percent } = request.body;
    if (!instrument) {
      return reply.code(400).send({ success: false, error: 'instrument required' });
    }
    const connectionStatus = strategyService.getConnectionStatus();
    if (!connectionStatus.connected) {
      return reply.code(400).send({ success: false, error: 'Not connected to broker' });
    }
    const client = strategyService.getClient();
    if (!client) {
      return reply.code(500).send({ success: false, error: 'Broker client unavailable' });
    }
    const positions = await strategyService.getPositions('USDC');
    const position = positions.find((p: any) => (p.instrument_name === instrument || p.instrument === instrument) && p.size !== 0);
    if (!position) {
      return reply.code(404).send({ success: false, error: 'No open position for instrument' });
    }
    const openOrders = await strategyService.getOpenOrders(instrument);
    const existingSl = openOrders.find((o: any) => o.reduce_only && o.order_type === 'stop_market');
    const ticker = await strategyService.getTicker(instrument);
    const currentPrice = ticker.last_price || ticker.mark_price;
    let targetPrice: number | undefined = price;
    if (!targetPrice && typeof percent === 'number') {
      const pct = percent / 100;
      targetPrice = position.direction === 'buy' ? currentPrice * (1 - pct) : currentPrice * (1 + pct);
    }
    if (!targetPrice) {
      return reply.code(400).send({ success: false, error: 'Provide price or percent' });
    }
    const instrumentDetails = await client.getInstrument(instrument);
    const tickSize = instrumentDetails?.tick_size || 0.1;
    targetPrice = Math.round(targetPrice / tickSize) * tickSize;
    if (existingSl) {
      try { await client.cancelOrder(existingSl.order_id); } catch { /* ignore */ }
    }
    const amount = Math.abs(position.size);
    const isLong = position.direction === 'buy';
    const label = `manual_sl_${Date.now()}`;
    const slOrder = isLong
      ? await client.placeSellOrder(instrument, amount, targetPrice, 'stop_market', label, true)
      : await client.placeBuyOrder(instrument, amount, targetPrice, 'stop_market', label, true);
    const slOrderId = slOrder?.order?.order_id || slOrder?.order_id;
    const tradeHistory = getTradeHistoryService();
    const openTrades = await tradeHistory.queryTrades({ instrument, status: 'open', limit: 1 });
    if (openTrades.length > 0) {
      await tradeHistory.updateOrderIds(openTrades[0].id, slOrderId, openTrades[0].tpOrderId || undefined);
      await tradeHistory.updateStops(openTrades[0].id, targetPrice, undefined);
    }
    return reply.send({ success: true, message: existingSl ? 'Stop loss updated' : 'Stop loss added', slOrderId, stopLoss: targetPrice });
  } catch (error: any) {
    console.error('[API] Failed to add/update stop loss:', error);
    return reply.code(500).send({ success: false, error: error.message || 'Failed to add/update stop loss' });
  }
});

// Ensure stop loss from recorded trade exists (idempotent repair)
server.post<{ Body: { instrument: string } }>('/api/v2/positions/ensure-sl', async (request, reply) => {
  try {
    const { instrument } = request.body;
    if (!instrument) return reply.code(400).send({ success: false, error: 'instrument required' });
    const connectionStatus = strategyService.getConnectionStatus();
    if (!connectionStatus.connected) return reply.code(400).send({ success: false, error: 'Not connected to broker' });
    const client = strategyService.getClient();
    if (!client) return reply.code(500).send({ success: false, error: 'Broker client unavailable' });

    // Fetch open trade (single)
    const tradeHistory = getTradeHistoryService();
    const openTrades = await tradeHistory.queryTrades({ instrument, status: 'open', limit: 1 });
    if (openTrades.length === 0) return reply.code(404).send({ success: false, error: 'No open trade found' });
    const trade = openTrades[0];
    if (!trade.stopLoss || trade.stopLoss === 0) return reply.code(400).send({ success: false, error: 'Trade has no recorded stopLoss price' });

    // Check if position exists
    const positions = await strategyService.getPositions('USDC');
    const position = positions.find((p: any) => (p.instrument_name === instrument || p.instrument === instrument) && p.size !== 0);
    if (!position) return reply.code(404).send({ success: false, error: 'No active position' });

    // Check existing SL order
    const openOrders = await strategyService.getOpenOrders(instrument);
    const existingSl = openOrders.find((o: any) => o.reduce_only && o.order_type === 'stop_market');
    if (existingSl) {
      return reply.send({ success: true, message: 'SL already exists', slOrderId: existingSl.order_id, stopLoss: existingSl.trigger_price || existingSl.price });
    }

    // Place SL using recorded stopLoss
    const instrumentDetails = await client.getInstrument(instrument);
    const tickSize = instrumentDetails?.tick_size || 0.1;
    const desiredSL = Math.round(trade.stopLoss / tickSize) * tickSize;
    const amount = Math.abs(position.size);
    const isLong = position.direction === 'buy';
    const label = `ensure_sl_${Date.now()}`;
    const slOrder = isLong
      ? await client.placeSellOrder(instrument, amount, desiredSL, 'stop_market', label, true)
      : await client.placeBuyOrder(instrument, amount, desiredSL, 'stop_market', label, true);
    const slOrderId = slOrder?.order?.order_id || slOrder?.order_id;
    if (slOrderId) {
      await tradeHistory.updateOrderIds(trade.id, slOrderId, trade.tpOrderId || undefined);
      // Ensure stored stop matches rounded
      if (desiredSL !== trade.stopLoss) await tradeHistory.updateStops(trade.id, desiredSL, undefined);
    }
    return reply.send({ success: true, message: 'SL placed', slOrderId, stopLoss: desiredSL });
  } catch (error: any) {
    console.error('[API] ensure-sl failed:', error);
    return reply.code(500).send({ success: false, error: error.message || 'Failed to ensure stop loss' });
  }
});

// Test micro order endpoint (for testing connection & functionality)
server.post('/api/v2/test-micro-order', async (request, reply) => {
  try {
    console.log('[API] Test micro order requested');
    
    const connectionStatus = strategyService.getConnectionStatus();
    
    if (!connectionStatus.connected) {
      return reply.code(400).send({
        success: false,
        error: 'Not connected to broker',
      });
    }

    // Get current BTC price for calculation
    const instrument = 'BTC_USDC-PERPETUAL';
    const ticker = await strategyService.getTicker(instrument);
    
    if (!ticker) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get current price',
      });
    }

    const currentPrice = ticker.markPrice || ticker.lastPrice;
    const testAmount = 10; // $10 USD test order
    
    // Place test order with 0.3% stop loss and take profit
    const stopLossPrice = currentPrice * 0.997; // 0.3% below entry
    const takeProfitPrice = currentPrice * 1.003; // 0.3% above entry
    
    const orderResult = await strategyService.placeTestOrder({
      instrument,
      amount: testAmount,
      side: 'buy', // Always buy for test
      currentPrice,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
      label: `test_micro_${Date.now()}`,
    });

    console.log('[API] Test micro order placed:', orderResult);

    return {
      success: true,
      orderId: orderResult.orderId,
      instrumentName: instrument,
      entryPrice: currentPrice,
      amount: testAmount,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
      message: 'Test order placed successfully',
    };
  } catch (error: any) {
    console.error('[API] Failed to place test micro order:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to place test order',
    });
  }
});

// ============================================================================
// KV STORAGE ENDPOINTS
// Robust, scalable key-value storage for frontend state
// ============================================================================

// GET key-value
server.get<{ Params: { key: string } }>('/api/kv/:key', async (request, reply) => {
  try {
    const { key } = request.params;
    const value = await kvStorage.get(key);
    
    if (value === null) {
      return reply.code(404).send({
        success: false,
        error: 'Key not found',
      });
    }
    
    return {
      success: true,
      key,
      value,
    };
  } catch (error: any) {
    console.error('[API] KV GET failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to get key',
    });
  }
});

// SET key-value
server.post<{ Body: { key: string; value: any; ttl?: number } }>('/api/kv', async (request, reply) => {
  try {
    const { key, value, ttl } = request.body;
    
    if (!key) {
      return reply.code(400).send({
        success: false,
        error: 'Missing key parameter',
      });
    }
    
    await kvStorage.set(key, value, ttl);
    
    return {
      success: true,
      key,
      message: 'Key saved successfully',
    };
  } catch (error: any) {
    console.error('[API] KV SET failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to set key',
    });
  }
});

// DELETE key
server.delete<{ Params: { key: string } }>('/api/kv/:key', async (request, reply) => {
  try {
    const { key } = request.params;
    const existed = await kvStorage.delete(key);
    
    return {
      success: true,
      key,
      existed,
      message: existed ? 'Key deleted successfully' : 'Key did not exist',
    };
  } catch (error: any) {
    console.error('[API] KV DELETE failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to delete key',
    });
  }
});

// KV Stats (for debugging)
server.get('/api/kv/_stats', async (request, reply) => {
  try {
    const stats = await kvStorage.stats();
    return {
      success: true,
      stats,
    };
  } catch (error: any) {
    console.error('[API] KV STATS failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to get stats',
    });
  }
});

// License/entitlement endpoints
server.post('/api/license/verify-receipt', async (request) => {
  log.info('License verification requested', { body: request.body });
  return {
    valid: true,
    entitlement: {
      tier: 'premium',
      expiry: null,
    },
    jwt: 'mock-jwt-token',
  };
});

// ============================================================================
// Telegram configuration endpoints (NOTIF-001)
// ============================================================================

// Get Telegram settings (masked)
server.get('/api/notifications/telegram', async () => {
  const cfg = telegramService.getConfig();
  // Try to load persisted values
  const storedEnabled = await kvStorage.get('TELEGRAM_ENABLED');
  const storedChatId = await kvStorage.get('TELEGRAM_CHAT_ID');
  const tokenPresent = !!(await kvStorage.get('TELEGRAM_BOT_TOKEN'));
  return {
    success: true,
    enabled: storedEnabled !== null ? storedEnabled === 'true' : cfg.enabled,
    chatId: storedChatId || cfg.chatId,
    tokenPresent: tokenPresent || cfg.tokenPresent,
  };
});

// Save Telegram settings (persist and hot-apply)
server.post<{ Body: { enabled?: boolean; botToken?: string; chatId?: string } }>(
  '/api/notifications/telegram',
  async (request, reply) => {
    try {
      const { enabled, botToken, chatId } = request.body || {};

      if (typeof enabled !== 'undefined') {
        await kvStorage.set('TELEGRAM_ENABLED', String(enabled));
      }
      if (typeof chatId === 'string') {
        await kvStorage.set('TELEGRAM_CHAT_ID', chatId);
      }
      if (typeof botToken === 'string' && botToken.trim() !== '') {
        // Store token; not returned in GET for security
        await kvStorage.set('TELEGRAM_BOT_TOKEN', botToken);
      }

      // Build runtime config from persisted values
      const persistedEnabled = (await kvStorage.get('TELEGRAM_ENABLED')) === 'true';
      const persistedToken = (await kvStorage.get('TELEGRAM_BOT_TOKEN')) || '';
      const persistedChatId = (await kvStorage.get('TELEGRAM_CHAT_ID')) || '';

      telegramService.updateConfig({
        enabled: persistedEnabled,
        botToken: persistedToken,
        chatId: persistedChatId,
      });

      return reply.send({ success: true });
    } catch (error: any) {
      log.error('[API] Failed to save Telegram settings', { error: error.message });
      return reply.code(500).send({ success: false, error: 'Failed to save Telegram settings' });
    }
  }
);

server.get('/api/license/entitlement', async () => {
  return {
    tier: 'premium',
    expiry: null,
    isActive: true,
    daysRemaining: null,
  };
});

// Strategy Registry API (Iteration 9)
server.get('/api/v2/strategies', async (request, reply) => {
  try {
    // For now, return hardcoded strategies
    // TODO: Import strategyRegistry from './strategies'
    const strategies = [
      {
        id: 'razor',
        name: 'Razor Strategy',
        description: 'Smart Money Concepts strategy with CHoCH, FVG, and liquidity sweeps',
        author: 'Tradebaas',
        version: '1.0.0',
        tags: ['SMC', 'ICT', 'structure'],
      },
      {
        id: 'scalping',
        name: 'Scalping Strategy',
        description: 'High-frequency scalping with tight stops (15m timeframe)',
        author: 'Tradebaas',
        version: '1.0.0',
        tags: ['scalping', 'high-frequency', 'tight-stops'],
      },
      {
        id: 'vortex',
        name: 'Vortex Indicator Strategy',
        description: 'Trend following using Vortex Indicator crossovers',
        author: 'Tradebaas',
        version: '1.0.0',
        tags: ['vortex', 'trend-following', 'indicator'],
      },
      {
        id: 'fast-test',
        name: 'Fast Test Strategy',
        description: 'Rapid testing strategy - generates signals every ~30 seconds',
        author: 'Tradebaas Dev',
        version: '1.0.0',
        tags: ['testing', 'fast', 'debug'],
      },
    ];
    
    return reply.send({ success: true, strategies });
  } catch (error: any) {
    log.error('[API] Error getting strategies:', error);
    return reply.code(500).send({ success: false, error: error.message });
  }
});

server.get('/api/v2/strategies/:id', async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    
    // For now, return hardcoded strategy data
    const strategies: Record<string, any> = {
      'razor': {
        id: 'razor',
        name: 'Razor Strategy',
        description: 'Smart Money Concepts strategy with CHoCH, FVG, and liquidity sweeps',
        author: 'Tradebaas',
        version: '1.0.0',
        tags: ['SMC', 'ICT', 'structure'],
      },
      'scalping': {
        id: 'scalping',
        name: 'Scalping Strategy',
        description: 'High-frequency scalping with tight stops (15m timeframe)',
        author: 'Tradebaas',
        version: '1.0.0',
        tags: ['scalping', 'high-frequency', 'tight-stops'],
      },
      'vortex': {
        id: 'vortex',
        name: 'Vortex Indicator Strategy',
        description: 'Trend following using Vortex Indicator crossovers',
        author: 'Tradebaas',
        version: '1.0.0',
        tags: ['vortex', 'trend-following', 'indicator'],
      },
      'fast-test': {
        id: 'fast-test',
        name: 'Fast Test Strategy',
        description: 'Rapid testing strategy - generates signals every ~30 seconds',
        author: 'Tradebaas Dev',
        version: '1.0.0',
        tags: ['testing', 'fast', 'debug'],
      },
    };
    
    const strategy = strategies[id];
    if (!strategy) {
      return reply.code(404).send({ success: false, error: 'Strategy not found' });
    }
    
    return reply.send({ 
      success: true, 
      strategy: {
        ...strategy,
        state: { isRunning: false, lastAnalysis: null, checkpoints: {} },
      }
    });
  } catch (error: any) {
    log.error('[API] Error getting strategy:', error);
    return reply.code(500).send({ success: false, error: error.message });
  }
});

// Sync current position to database (retroactive)
server.post<{ Body: { strategyName: string; instrument: string } }>(
  '/api/trades/sync-position', 
  async (request, reply) => {
    try {
      const { strategyName, instrument } = request.body;
      
      if (!strategyName || !instrument) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields: strategyName and instrument'
        });
      }
      
      const connectionStatus = strategyService.getConnectionStatus();
      
      if (!connectionStatus.connected) {
        return reply.code(400).send({
          success: false,
          error: 'Not connected to broker'
        });
      }
      
      // Pass broker methods to the handler
      const result = await handleSyncCurrentPosition({
        strategyName,
        instrument,
        getPositions: () => strategyService.getPositions('USDC'),
        getOpenOrders: (inst: string) => strategyService.getOpenOrders(inst),
      });
      
      return reply.send(result);
    } catch (error: any) {
      log.error('[API] Error syncing position:', error);
      return reply.code(500).send({
        success: false,
        error: error.message || 'Failed to sync position'
      });
    }
  }
);

// Trade History API endpoints
server.get('/api/trades/history', async (request, reply) => {
  try {
    const queryParams = request.query as {
      strategyName?: string;
      instrument?: string;
      status?: 'open' | 'closed';
      limit?: string;
      offset?: string;
    };
    
    const response = await handleGetTradeHistory({
      strategyName: queryParams.strategyName,
      instrument: queryParams.instrument,
      status: queryParams.status,
      limit: queryParams.limit ? parseInt(queryParams.limit) : undefined,
      offset: queryParams.offset ? parseInt(queryParams.offset) : undefined,
    });
    
    return reply.send(response);
  } catch (error: any) {
    log.error('[API] Error getting trade history:', error);
    return reply.code(500).send({ 
      success: false, 
      trades: [],
      total: 0,
      error: error.message 
    });
  }
});

server.get('/api/trades/stats', async (request, reply) => {
  try {
    const queryParams = request.query as {
      strategyName?: string;
      instrument?: string;
      startTime?: string;
      endTime?: string;
    };
    
    const response = await handleGetTradeStats({
      strategyName: queryParams.strategyName,
      instrument: queryParams.instrument,
      startTime: queryParams.startTime ? parseInt(queryParams.startTime) : undefined,
      endTime: queryParams.endTime ? parseInt(queryParams.endTime) : undefined,
    });
    
    return reply.send(response);
  } catch (error: any) {
    log.error('[API] Error getting trade stats:', error);
    return reply.code(500).send({ 
      success: false,
      stats: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: 0,
        avgPnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        slHits: 0,
        tpHits: 0
      },
      error: error.message 
    });
  }
});

// DELETE trade by ID
server.delete('/api/trades/:tradeId', async (request, reply) => {
  try {
    const { tradeId } = request.params as { tradeId: string };
    
    const tradeHistory = getTradeHistoryService();
    await tradeHistory.deleteTrade(tradeId);
    
    log.info(`[API] Trade deleted: ${tradeId}`);
    
    return reply.send({ 
      success: true,
      message: 'Trade successfully deleted'
    });
  } catch (error: any) {
    log.error('[API] Error deleting trade:', error);
    return reply.code(500).send({ 
      success: false,
      error: error.message 
    });
  }
});

// Start server
const start = async () => {
  try {
    // Initialize strategy service (auto-resume if needed)
    console.log('[START] Initializing strategy service...');
    await strategyService.initialize();
    console.log('[START] Strategy service initialized');
    
    // Start reconciliation service for database-Deribit sync
    console.log('[START] Starting reconciliation service...');
    const client = strategyService.getClient();
    if (client) {
      const reconciliationService = createReconciliationService(client, 1); // Check every 1 minute
      reconciliationService.start();
      console.log('[START] ✅ Reconciliation service started (checking every 1 minute)');
    } else {
      console.log('[START] ⚠️  No Deribit client available, reconciliation service not started');
    }
    
    console.log(`[START] Starting server on ${HOST}:${PORT}...`);
    // CRITICAL: Use '0.0.0.0' explicitly to bind to all interfaces
    await server.listen({ port: PORT, host: '0.0.0.0' });
    console.log('[START] Server.listen() completed');
    log.info('Tradebaas Backend server started', { 
      host: HOST, 
      port: PORT,
      healthEndpoint: `http://${HOST}:${PORT}/health`,
      apiEndpoint: `http://${HOST}:${PORT}/api/*`,
    });
    
    // Start WebSocket server for realtime updates (Iteration 7)
    const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3001;
    wsServer.start(WS_PORT);
    log.info('WebSocket server started', {
      host: HOST,
      port: WS_PORT,
      endpoint: `ws://${HOST}:${WS_PORT}`,
    });
  } catch (err) {
    log.error('Failed to start server', { error: err });
    process.exit(1);
  }
};

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  log.info('Graceful shutdown initiated', { signal });
  
  const shutdownTimeout = setTimeout(() => {
    log.error('Shutdown timeout exceeded (10s), forcing exit');
    process.exit(1);
  }, 10000); // Max 10 seconds
  
  try {
    // 1. Stop accepting new requests
    log.info('Shutdown step 1/5: Stopping HTTP server');
    await server.close();
    log.info('HTTP server closed successfully');
    
    // 2. Stop WebSocket server (Iteration 7)
    log.info('Shutdown step 2/5: Stopping WebSocket server');
    wsServer.stop();
    log.info('WebSocket server stopped successfully');
    
    // 2.5. Stop reconciliation service
    log.info('Shutdown step 2.5/5: Stopping reconciliation service');
    const reconciliationService = getReconciliationService();
    if (reconciliationService) {
      reconciliationService.stop();
      log.info('Reconciliation service stopped successfully');
    }
    
    // 3. Stop all active strategies and close WebSocket connections
    log.info('Shutdown step 3/5: Stopping strategies');
    await strategyService.shutdown();
    log.info('Strategies stopped successfully');
    
    // 4. Flush pending state updates
    log.info('Shutdown step 4/5: Flushing state');
    // State manager auto-saves on every change, but ensure final flush
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for final writes
    log.info('State flushed successfully');
    
    // 5. Cleanup complete
    log.info('Shutdown step 5/5: Shutdown complete');
    clearTimeout(shutdownTimeout);
    process.exit(0);
  } catch (error) {
    log.error('Error during graceful shutdown', { error });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', { error: error.message, stack: error.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection', { reason, promise });
  gracefulShutdown('UNHANDLED_REJECTION');
});

start();

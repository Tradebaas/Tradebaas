import { FastifyInstance } from 'fastify';
import { BitgetAdapter } from '../adapters/bitget';
import { LIVE_ENABLED } from '../config';

const bitget = new BitgetAdapter();

export async function brokerRoutes(fastify: FastifyInstance) {
  // ===== STATUS & HEALTH =====
  
  fastify.get('/bitget/status', async () => ({
    name: bitget.name,
    testnet: bitget.testnet,
    dryRun: bitget.dryRun,
    liveEnabled: LIVE_ENABLED,
    note: bitget.dryRun ? 'Fill BITGET_API_KEY/SECRET/PASSPHRASE in .env to enable live calls' : undefined
  }));

  // Ping the broker: when LIVE_ENABLED=true and credentials present, perform a balance check
  fastify.get('/bitget/ping', async (request, reply) => {
    console.log('=== BITGET PING REQUEST ===');
    console.log('LIVE_ENABLED:', LIVE_ENABLED);
    console.log('bitget.dryRun:', bitget.dryRun);
    
    if (!LIVE_ENABLED) {
      console.log('Returning: LIVE_ENABLED is false');
      return { ok: false, reason: 'LIVE_ENABLED is false; set LIVE_ENABLED=true in .env to allow live checks' };
    }
    if (bitget.dryRun) {
      console.log('Returning: Broker credentials missing');
      return { ok: false, reason: 'Broker credentials missing. Fill BITGET_API_KEY/SECRET/PASSPHRASE in .env' };
    }

    try {
      console.log('Calling bitget.getMarginBalance("USDC")...');
      const bal = await bitget.getMarginBalance('USDC');
      console.log('Success! Balance result:', bal);
      return { ok: true, balanceUSDC: bal };
    } catch (e: any) {
      console.log('Error occurred:', e);
      const errorMsg = String(e?.message || e);
      console.log('Error message:', errorMsg);
      return { ok: false, error: errorMsg };
    }
  });

  // ===== ACCOUNT MANAGEMENT =====

  fastify.get('/bitget/balances', async (request, reply) => {
    try {
      const balances = await bitget.getBalances();
      return { success: true, data: balances };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/bitget/balance/:coin', async (request, reply) => {
    const { coin } = request.params as { coin: string };
    try {
      const balance = await bitget.getMarginBalance(coin.toUpperCase());
      return { success: true, data: balance };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  // ===== ORDER MANAGEMENT =====

  fastify.post('/bitget/orders', async (request, reply) => {
    const orderRequest = request.body as any;
    
    if (!LIVE_ENABLED || bitget.dryRun) {
      return { 
        success: false, 
        error: 'Live trading disabled or credentials missing',
        dryRun: true 
      };
    }

    try {
      const order = await bitget.placeOrder(orderRequest);
      return { success: true, data: order };
    } catch (error: any) {
      reply.status(400);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/bitget/orders', async (request, reply) => {
    const { symbol } = request.query as { symbol?: string };
    try {
      const orders = await bitget.getOpenOrders(symbol);
      return { success: true, data: orders };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/bitget/orders/history', async (request, reply) => {
    const { symbol, limit } = request.query as { symbol?: string; limit?: string };
    try {
      const orders = await bitget.getOrderHistory(symbol, limit ? parseInt(limit) : undefined);
      return { success: true, data: orders };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/bitget/orders/:orderId', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const { symbol } = request.query as { symbol?: string };
    try {
      const order = await bitget.getOrder(orderId, symbol);
      return { success: true, data: order };
    } catch (error: any) {
      reply.status(404);
      return { success: false, error: error.message };
    }
  });

  fastify.delete('/bitget/orders/:orderId', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const { symbol } = request.query as { symbol?: string };
    
    if (!LIVE_ENABLED || bitget.dryRun) {
      return { 
        success: false, 
        error: 'Live trading disabled or credentials missing',
        dryRun: true 
      };
    }

    try {
      const success = await bitget.cancelOrder(orderId, symbol);
      return { success, message: success ? 'Order cancelled' : 'Failed to cancel order' };
    } catch (error: any) {
      reply.status(400);
      return { success: false, error: error.message };
    }
  });

  fastify.delete('/bitget/orders', async (request, reply) => {
    const { symbol } = request.query as { symbol?: string };
    
    if (!LIVE_ENABLED || bitget.dryRun) {
      return { 
        success: false, 
        error: 'Live trading disabled or credentials missing',
        dryRun: true 
      };
    }

    try {
      const success = await bitget.cancelAllOrders(symbol);
      return { success, message: success ? 'All orders cancelled' : 'Failed to cancel orders' };
    } catch (error: any) {
      reply.status(400);
      return { success: false, error: error.message };
    }
  });

  // ===== POSITION MANAGEMENT =====

  fastify.get('/bitget/positions', async (request, reply) => {
    const { symbol } = request.query as { symbol?: string };
    try {
      const positions = await bitget.getPositions(symbol);
      return { success: true, data: positions };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.post('/bitget/positions/:symbol/close', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { side } = request.body as { side?: 'long' | 'short' };
    
    if (!LIVE_ENABLED || bitget.dryRun) {
      return { 
        success: false, 
        error: 'Live trading disabled or credentials missing',
        dryRun: true 
      };
    }

    try {
      const success = await bitget.closePosition(symbol, side);
      return { success, message: success ? 'Position closed' : 'Failed to close position' };
    } catch (error: any) {
      reply.status(400);
      return { success: false, error: error.message };
    }
  });

  fastify.post('/bitget/positions/:symbol/leverage', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { leverage } = request.body as { leverage: number };
    
    if (!LIVE_ENABLED || bitget.dryRun) {
      return { 
        success: false, 
        error: 'Live trading disabled or credentials missing',
        dryRun: true 
      };
    }

    try {
      const success = await bitget.setLeverage(symbol, leverage);
      return { success, message: success ? 'Leverage updated' : 'Failed to update leverage' };
    } catch (error: any) {
      reply.status(400);
      return { success: false, error: error.message };
    }
  });

  // ===== MARKET DATA =====

  fastify.get('/bitget/ticker/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    try {
      const ticker = await bitget.getTicker(symbol);
      return { success: true, data: ticker };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/bitget/orderbook/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { depth } = request.query as { depth?: string };
    try {
      const orderbook = await bitget.getOrderBook(symbol, depth ? parseInt(depth) : undefined);
      return { success: true, data: orderbook };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/bitget/market/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    try {
      const marketData = await bitget.getMarketData(symbol);
      return { success: true, data: marketData };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  // ===== REAL-TIME DATA =====

  fastify.post('/bitget/realtime/connect', async (request, reply) => {
    try {
      const { bitgetRealtimeService } = await import('../services/realtimeService');
      if (!bitgetRealtimeService.isConnected()) {
        await bitgetRealtimeService.connect();
      }
      return { success: true, message: 'Connected to real-time stream' };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.post('/bitget/realtime/disconnect', async (request, reply) => {
    try {
      const { bitgetRealtimeService } = await import('../services/realtimeService');
      bitgetRealtimeService.disconnect();
      return { success: true, message: 'Disconnected from real-time stream' };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/bitget/realtime/status', async (request, reply) => {
    try {
      const { bitgetRealtimeService } = await import('../services/realtimeService');
      return { 
        success: true, 
        data: {
          connected: bitgetRealtimeService.isConnected(),
          subscriptions: Array.from(bitgetRealtimeService.getSubscriptions())
        }
      };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.post('/bitget/realtime/subscribe/ticker/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    try {
      const { bitgetRealtimeService } = await import('../services/realtimeService');
      bitgetRealtimeService.subscribeTicker(symbol);
      return { success: true, message: `Subscribed to ticker for ${symbol}` };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  fastify.post('/bitget/realtime/subscribe/orderbook/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { depth } = request.body as { depth?: '5' | '15' | 'books' };
    try {
      const { bitgetRealtimeService } = await import('../services/realtimeService');
      bitgetRealtimeService.subscribeOrderBook(symbol, depth);
      return { success: true, message: `Subscribed to orderbook for ${symbol}` };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });
}

export const brokers = { bitget };

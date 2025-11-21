import { BotConfig, Signal, Trade, Position, Order, OrderRequest } from '../models/types';
import { BrokerFactory, MultiBrokerManager, SupportedBroker } from '../adapters/brokerFactory';
import { BitgetAdapter } from '../adapters/bitget';
import { v4 as uuidv4 } from 'uuid';
import { inc, setError } from './metricsService';
import prisma from '../db/client';
import { publish } from './events';

// In-memory stores (replace with DB in production)
const bots = new Map<string, BotConfig>();
const pendingSignals = new Map<string, Signal[]>();
const openTrades = new Map<string, Trade[]>();

// Enhanced broker management
const brokerAdapters = {
  bitget: new BitgetAdapter()
};

// Multi-broker manager instance
const multiBrokerManager = new MultiBrokerManager();

// Initialize with default Bitget broker
multiBrokerManager.addBroker({
  name: 'bitget',
  apiKey: process.env.BITGET_API_KEY || '',
  secret: process.env.BITGET_SECRET || '',
  passphrase: process.env.BITGET_PASSPHRASE || '',
  testnet: process.env.BITGET_TESTNET === 'true'
});

// ===== ENHANCED BOT MANAGEMENT =====

export const registerBot = async (cfg: Partial<BotConfig>): Promise<BotConfig> => {
  // try to persist
  try {
    const b = await prisma.bot.create({ 
      data: { 
        name: cfg.name || 'bot', 
        broker: cfg.broker || 'bitget', 
        mode: cfg.mode || 'manual', 
        maxOpenTrades: cfg.maxOpenTrades || 2, 
        defaultInstrument: cfg.defaultInstrument || null, 
        ownerId: (cfg as any).ownerId || '' 
      } 
    });
    inc('botsRegistered', 1);
    publish({ type: 'bot:created', bot: b });
    return b as unknown as BotConfig;
  } catch (e) {
    const id = cfg.id || uuidv4();
    const bot: BotConfig = {
      id,
      name: cfg.name || `bot-${id.slice(0, 6)}`,
      broker: cfg.broker || 'bitget',
      mode: cfg.mode || 'manual',
      maxOpenTrades: cfg.maxOpenTrades || 2,
      defaultInstrument: cfg.defaultInstrument
    } as BotConfig;

    bots.set(id, bot);
    pendingSignals.set(id, []);
    openTrades.set(id, []);
    inc('botsRegistered', 1);
    publish({ type: 'bot:created', bot });
    return bot;
  }
};

export const updateBot = async (botId: string, updates: Partial<BotConfig>): Promise<BotConfig> => {
  try {
    const updatedBot = await prisma.bot.update({
      where: { id: botId },
      data: {
        name: updates.name,
        mode: updates.mode,
        maxOpenTrades: updates.maxOpenTrades,
        defaultInstrument: updates.defaultInstrument
      }
    });
    publish({ type: 'bot:updated', bot: updatedBot });
    return updatedBot as unknown as BotConfig;
  } catch (e) {
    const bot = bots.get(botId);
    if (!bot) throw new Error('Bot not found');
    
    const updatedBot = { ...bot, ...updates };
    bots.set(botId, updatedBot);
    publish({ type: 'bot:updated', bot: updatedBot });
    return updatedBot;
  }
};

export const deleteBot = async (botId: string): Promise<boolean> => {
  try {
    await prisma.bot.delete({ where: { id: botId } });
    publish({ type: 'bot:deleted', botId });
    return true;
  } catch (e) {
    const success = bots.delete(botId);
    pendingSignals.delete(botId);
    openTrades.delete(botId);
    if (success) {
      publish({ type: 'bot:deleted', botId });
    }
    return success;
  }
};

export const listBots = async (): Promise<BotConfig[]> => {
  try {
    const b = await prisma.bot.findMany();
    return b as unknown as BotConfig[];
  } catch (e) {
    return Array.from(bots.values());
  }
};

export const getBot = async (botId: string): Promise<BotConfig | null> => {
  try {
    const bot = await prisma.bot.findUnique({ where: { id: botId } });
    return bot as unknown as BotConfig;
  } catch (e) {
    return bots.get(botId) || null;
  }
};

// ===== ENHANCED SIGNAL PROCESSING =====

export const ingestSignal = async (signal: Partial<Signal>): Promise<Signal> => {
  if (!signal.botId) throw new Error('botId required');
  const s: Signal = {
    id: signal.id || uuidv4(),
    botId: signal.botId,
    instrument: signal.instrument || 'BTCUSDC',
    side: signal.side || 'buy',
    size: signal.size || 10,
    price: signal.price,
    timestamp: signal.timestamp || Date.now(),
    meta: signal.meta || {}
  };

  // try DB
  try {
    const bot = await prisma.bot.findUnique({ where: { id: s.botId } });
    if (!bot) throw new Error('bot not found');

    const created = await prisma.signal.create({ 
      data: { 
        id: s.id, 
        botId: s.botId, 
        instrument: s.instrument, 
        side: s.side, 
        size: s.size, 
        price: s.price || undefined, 
        timestamp: new Date(s.timestamp), 
        processed: false 
      } 
    });
    publish({ type: 'signal:ingested', signal: created });
    inc('signalsIngested', 1);
    
    if (bot.mode === 'auto') {
      // execute asynchronously
      executeTrade(s).catch(err => setError(String(err?.message || err)));
    }
    return created as unknown as Signal;
  } catch (e) {
    // fallback in-memory
    const bot = bots.get(s.botId);
    if (!bot) throw new Error('bot not found');

    if (bot.mode === 'auto') {
      executeTrade(s).catch(err => setError(String(err?.message || err)));
    } else {
      const list = pendingSignals.get(s.botId) || [];
      list.push(s);
      pendingSignals.set(s.botId, list);
      inc('signalsIngested', 1);
    }

    publish({ type: 'signal:ingested', signal: s });
    return s;
  }
};

export const listPendingSignals = async (botId: string): Promise<Signal[]> => {
  try {
    const signals = await prisma.signal.findMany({
      where: { botId, processed: false },
      orderBy: { timestamp: 'desc' }
    });
    return signals as unknown as Signal[];
  } catch (e) {
    return pendingSignals.get(botId) || [];
  }
};

export const processSignal = async (signalId: string): Promise<Trade> => {
  try {
    const signal = await prisma.signal.findUnique({ where: { id: signalId } });
    if (!signal) throw new Error('Signal not found');
    if (signal.processed) throw new Error('Signal already processed');
    
    const trade = await executeTrade(signal as unknown as Signal);
    
    await prisma.signal.update({
      where: { id: signalId },
      data: { processed: true }
    });
    
    return trade;
  } catch (e) {
    throw new Error(`Failed to process signal: ${(e as Error).message}`);
  }
};

// ===== ENHANCED TRADING OPERATIONS =====

const canOpenTrade = async (botId: string, instrument: string): Promise<boolean> => {
  try {
    const bot = await getBot(botId);
    if (!bot) return false;
    
    const openTradesCount = await prisma.trade.count({
      where: { botId, status: 'open' }
    });
    
    if (openTradesCount >= (bot.maxOpenTrades || 2)) return false;
    
    // Check for existing trade on same instrument
    const existingTrade = await prisma.trade.findFirst({
      where: { botId, instrument, status: 'open' }
    });
    
    return !existingTrade;
  } catch (e) {
    // Fallback to in-memory check
    const trades = openTrades.get(botId) || [];
    if (trades.length >= (bots.get(botId)?.maxOpenTrades || 2)) return false;
    return !trades.some(t => t.instrument === instrument);
  }
};

export const executeTrade = async (signal: Signal): Promise<Trade> => {
  const bot = await getBot(signal.botId);
  if (!bot) throw new Error('Bot not found');
  
  // Get broker adapter
  const adapter = multiBrokerManager.getBroker(bot.broker as SupportedBroker);
  if (!adapter) throw new Error(`Broker adapter not configured: ${bot.broker}`);

  // Check if trade can be opened
  const canOpen = await canOpenTrade(signal.botId, signal.instrument);
  if (!canOpen) throw new Error('Cannot open trade: max trades or duplicate instrument');

  // Check for existing orders on exchange
  try {
    const existingOrders = await adapter.getOpenOrders(signal.instrument);
    if (existingOrders.length > 0) {
      throw new Error('Exchange has existing open orders for this instrument');
    }
  } catch (e) {
    // Continue if endpoint not available
  }

  // Convert signal to order request
  const orderRequest: OrderRequest = {
    symbol: signal.instrument,
    side: signal.side,
    type: signal.price ? 'limit' : 'market',
    size: signal.size,
    price: signal.price
  };

  // Place order
  const order = await adapter.placeOrder(orderRequest);
  
  // Convert order to trade for legacy compatibility
  const trade: Trade = {
    id: order.id,
    botId: signal.botId,
    instrument: order.symbol,
    side: order.side,
    size: order.size,
    price: order.price,
    entryPrice: order.averageFillPrice,
    status: order.status === 'filled' ? 'closed' : 'open',
    openedAt: order.createdAt,
    fees: order.fees,
    leverage: 1 // Default leverage
  };

  // Persist trade
  try {
    const created = await prisma.trade.create({
      data: {
        id: trade.id,
        botId: trade.botId,
        instrument: trade.instrument,
        side: trade.side,
        size: trade.size,
        price: trade.price || undefined,
        status: trade.status,
        openedAt: new Date(trade.openedAt),
        closedAt: trade.closedAt ? new Date(trade.closedAt) : undefined
      }
    });
    
    inc('tradesExecuted', 1);
    inc('openTrades', trade.status === 'open' ? 1 : 0);
    publish({ type: 'trade:opened', trade: created });
    
    return created as unknown as Trade;
  } catch (e) {
    // Fallback to in-memory
    const list = openTrades.get(signal.botId) || [];
    list.push(trade);
    openTrades.set(signal.botId, list);
    
    inc('tradesExecuted', 1);
    inc('openTrades', 1);
    
    const ps = pendingSignals.get(signal.botId) || [];
    pendingSignals.set(signal.botId, ps.filter(s => s.id !== signal.id));
    
    publish({ type: 'trade:opened', trade });
    return trade;
  }
};

export const closeTrade = async (tradeId: string): Promise<boolean> => {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) throw new Error('Trade not found');
    
    const bot = await getBot(trade.botId);
    if (!bot) throw new Error('Bot not found');
    
    const adapter = multiBrokerManager.getBroker(bot.broker as SupportedBroker);
    if (!adapter) throw new Error(`Broker adapter not configured: ${bot.broker}`);

    // Close position on exchange
    const success = await adapter.closePosition(trade.instrument);
    
    if (success) {
      await prisma.trade.update({
        where: { id: tradeId },
        data: { status: 'closed', closedAt: new Date() }
      });
      
      inc('openTrades', -1);
      publish({ type: 'trade:closed', tradeId });
    }
    
    return success;
  } catch (e) {
    console.error(`Failed to close trade ${tradeId}:`, e);
    return false;
  }
};

export const cancelOrder = async (orderId: string, botId: string): Promise<boolean> => {
  try {
    const bot = await getBot(botId);
    if (!bot) throw new Error('Bot not found');
    
    const adapter = multiBrokerManager.getBroker(bot.broker as SupportedBroker);
    if (!adapter) throw new Error(`Broker adapter not configured: ${bot.broker}`);

    const success = await adapter.cancelOrder(orderId);
    
    if (success) {
      publish({ type: 'order:cancelled', orderId, botId });
    }
    
    return success;
  } catch (e) {
    console.error(`Failed to cancel order ${orderId}:`, e);
    return false;
  }
};

// ===== ENHANCED DATA RETRIEVAL =====

export const getOpenTradesForBot = async (botId: string): Promise<Trade[]> => {
  try {
    const trades = await prisma.trade.findMany({
      where: { botId, status: 'open' },
      orderBy: { openedAt: 'desc' }
    });
    return trades as unknown as Trade[];
  } catch (e) {
    return openTrades.get(botId) || [];
  }
};

export const getPositionsForBot = async (botId: string): Promise<Position[]> => {
  try {
    const bot = await getBot(botId);
    if (!bot) return [];
    
    const adapter = multiBrokerManager.getBroker(bot.broker as SupportedBroker);
    if (!adapter) return [];

    return await adapter.getPositions();
  } catch (e) {
    console.error(`Failed to get positions for bot ${botId}:`, e);
    return [];
  }
};

export const getOrdersForBot = async (botId: string): Promise<Order[]> => {
  try {
    const bot = await getBot(botId);
    if (!bot) return [];
    
    const adapter = multiBrokerManager.getBroker(bot.broker as SupportedBroker);
    if (!adapter) return [];

    return await adapter.getOpenOrders();
  } catch (e) {
    console.error(`Failed to get orders for bot ${botId}:`, e);
    return [];
  }
};

export const getBotAnalytics = async (botId: string) => {
  try {
    const [bot, trades, signals] = await Promise.all([
      getBot(botId),
      prisma.trade.findMany({ where: { botId } }),
      prisma.signal.findMany({ where: { botId } })
    ]);

    if (!bot) throw new Error('Bot not found');

    const openTrades = trades.filter((t: any) => t.status === 'open');
    const closedTrades = trades.filter((t: any) => t.status === 'closed');
    
    const totalPnL = closedTrades.reduce((sum: number, trade: any) => {
      return sum + (trade.pnl || 0);
    }, 0);

    const winRate = closedTrades.length > 0 
      ? (closedTrades.filter((t: any) => (t.pnl || 0) > 0).length / closedTrades.length) * 100 
      : 0;

    return {
      bot,
      stats: {
        totalSignals: signals.length,
        processedSignals: signals.filter((s: any) => s.processed).length,
        totalTrades: trades.length,
        openTrades: openTrades.length,
        closedTrades: closedTrades.length,
        totalPnL,
        winRate: Math.round(winRate * 100) / 100
      },
      recentTrades: trades.slice(-10),
      recentSignals: signals.slice(-10)
    };
  } catch (e) {
    throw new Error(`Failed to get bot analytics: ${(e as Error).message}`);
  }
};

// ===== MULTI-BROKER OPERATIONS =====

export const addBrokerToBot = (botId: string, brokerConfig: any): boolean => {
  try {
    multiBrokerManager.addBroker(brokerConfig);
    return true;
  } catch (e) {
    console.error(`Failed to add broker to bot ${botId}:`, e);
    return false;
  }
};

export const getAllBrokerBalances = async (): Promise<any> => {
  return await multiBrokerManager.getAllBalances();
};

export const getAllBrokerPositions = async (): Promise<any> => {
  return await multiBrokerManager.getAllPositions();
};

export const getAllBrokerTickers = async (symbol: string): Promise<any> => {
  return await multiBrokerManager.getAllTickers(symbol);
};

// Legacy compatibility
export { listPendingSignals as getPendingSignals };
export { multiBrokerManager };

// ===== BOT PERFORMANCE MONITORING =====

export const getBotPerformance = async (botId: string, timeframe: '1h' | '24h' | '7d' | '30d' = '24h') => {
  try {
    const now = new Date();
    const timeframeDuration = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    
    const since = new Date(now.getTime() - timeframeDuration[timeframe]);
    
    const trades = await prisma.trade.findMany({
      where: {
        botId,
        openedAt: { gte: since }
      },
      orderBy: { openedAt: 'desc' }
    });

    const signals = await prisma.signal.findMany({
      where: {
        botId,
        timestamp: { gte: since }
      },
      orderBy: { timestamp: 'desc' }
    });

    const closedTrades = trades.filter((t: any) => t.status === 'closed');
    const totalPnL = closedTrades.reduce((sum: number, trade: any) => sum + (trade.pnl || 0), 0);
    const totalVolume = trades.reduce((sum: number, trade: any) => sum + trade.size, 0);
    
    return {
      timeframe,
      period: { from: since, to: now },
      summary: {
        totalSignals: signals.length,
        totalTrades: trades.length,
        closedTrades: closedTrades.length,
        totalPnL,
        totalVolume,
        averageTradeSize: trades.length > 0 ? totalVolume / trades.length : 0,
        winRate: closedTrades.length > 0 
          ? (closedTrades.filter(t => (t.pnl || 0) > 0).length / closedTrades.length) * 100 
          : 0
      },
      trades: trades.slice(0, 20), // Last 20 trades
      signals: signals.slice(0, 20)  // Last 20 signals
    };
  } catch (e) {
    throw new Error(`Failed to get bot performance: ${(e as Error).message}`);
  }
};

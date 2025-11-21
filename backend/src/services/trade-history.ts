/**
 * Trade History Service
 * 
 * Central service for tracking trade history.
 * Supports pluggable storage backends (KV in-memory or SQL persistent).
 */

import type { ITradeHistoryStore, TradeRecord, TradeHistoryQuery, TradeHistoryStats } from './ITradeHistoryStore';
import { KvTradeHistoryStore } from './KvTradeHistoryStore';
import { SqlTradeHistoryStore } from './SqlTradeHistoryStore';
import { telegramService } from '../notifications/telegram';

export class TradeHistoryService {
  private store: ITradeHistoryStore;
  
  constructor(storeType: 'kv' | 'sql' = 'kv', dbPath?: string) {
    // Select store based on configuration
    if (storeType === 'sql') {
      this.store = new SqlTradeHistoryStore(dbPath);
    } else {
      this.store = new KvTradeHistoryStore();
    }
  }
  
  /**
   * Initialize the service and underlying store
   */
  async initialize(): Promise<void> {
    await this.store.initialize();
    console.log('[TradeHistoryService] Service initialized');
  }
  
  /**
   * Record a new trade when position is opened
   */
  async recordTrade(params: {
    strategyName: string;
    instrument: string;
    side: 'buy' | 'sell';
    entryOrderId: string;
    slOrderId?: string;
    tpOrderId?: string;
    entryPrice: number;
    amount: number;
    stopLoss: number;
    takeProfit: number;
  }): Promise<string> {
    const trade: TradeRecord = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      strategyName: params.strategyName,
      instrument: params.instrument,
      side: params.side,
      entryOrderId: params.entryOrderId,
      slOrderId: params.slOrderId,
      tpOrderId: params.tpOrderId,
      entryPrice: params.entryPrice,
      amount: params.amount,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      entryTime: Date.now(),
      status: 'open'
    };
    
    await this.store.addTrade(trade);
    console.log(`[TradeHistoryService] Recorded trade ${trade.id} for ${params.strategyName}`);
    // Fire Telegram notification (best-effort)
    try {
      await telegramService.notifyTradeOpen({
        instrument: params.instrument,
        side: params.side === 'buy' ? 'long' : 'short',
        entryPrice: params.entryPrice,
        size: params.amount,
      });
    } catch (e) {
      console.warn('[TradeHistoryService] Telegram notifyTradeOpen failed (non-critical)');
    }
    
    return trade.id;
  }
  
  /**
   * Update trade when position is closed
   */
  async closeTrade(params: {
    tradeId: string;
    exitPrice: number;
    exitReason: 'sl_hit' | 'tp_hit' | 'manual' | 'strategy_stop' | 'error';
    pnl: number;
    pnlPercentage: number;
  }): Promise<void> {
    await this.store.updateTrade(params.tradeId, {
      exitPrice: params.exitPrice,
      exitTime: Date.now(),
      exitReason: params.exitReason,
      pnl: params.pnl,
      pnlPercentage: params.pnlPercentage,
      status: 'closed'
    });
    
    console.log(`[TradeHistoryService] Closed trade ${params.tradeId} - ${params.exitReason} - PnL: $${params.pnl.toFixed(2)}`);
    // Fire Telegram notification (best-effort)
    try {
      // Fetch minimal context for message (instrument & size) if needed
      const trade = await this.store.getTrade(params.tradeId);
      await telegramService.notifyTradeClose({
        instrument: trade?.instrument || 'UNKNOWN',
        side: (trade?.side || 'buy') === 'buy' ? 'long' : 'short',
        exitPrice: params.exitPrice,
        size: trade?.amount || 0,
        pnl: params.pnl,
        pnlPercent: params.pnlPercentage,
      });
    } catch (e) {
      console.warn('[TradeHistoryService] Telegram notifyTradeClose failed (non-critical)');
    }
  }
  
  /**
   * Update SL/TP order IDs after they're placed
   */
  async updateOrderIds(tradeId: string, slOrderId?: string, tpOrderId?: string): Promise<void> {
    await this.store.updateTrade(tradeId, {
      slOrderId,
      tpOrderId
    });
    
    console.log(`[TradeHistoryService] Updated order IDs for trade ${tradeId}`);
  }
  
  /**
   * Update stop prices (SL/TP) for an open trade
   */
  async updateStops(tradeId: string, stopLoss?: number, takeProfit?: number): Promise<void> {
    const updates: any = {};
    if (typeof stopLoss === 'number') updates.stopLoss = stopLoss;
    if (typeof takeProfit === 'number') updates.takeProfit = takeProfit;
    if (Object.keys(updates).length === 0) return;
    await this.store.updateTrade(tradeId, updates);
    console.log(`[TradeHistoryService] Updated stops for trade ${tradeId}:`, updates);
  }
  
  /**
   * Get a specific trade by ID
   */
  async getTrade(tradeId: string): Promise<TradeRecord | null> {
    return this.store.getTrade(tradeId);
  }
  
  /**
   * Query trades with filters
   */
  async queryTrades(query: TradeHistoryQuery): Promise<TradeRecord[]> {
    return this.store.queryTrades(query);
  }
  
  /**
   * Get all trades (for backwards compatibility)
   */
  async getAllTrades(): Promise<TradeRecord[]> {
    return this.store.getAllTrades();
  }
  
  /**
   * Get statistics for a strategy or time period
   */
  async getStats(query?: TradeHistoryQuery): Promise<TradeHistoryStats> {
    return this.store.getStats(query);
  }
  
  /**
   * Find the most recent open trade for a strategy
   */
  async getOpenTrade(strategyName: string, instrument: string): Promise<TradeRecord | null> {
    const trades = await this.store.queryTrades({
      strategyName,
      instrument,
      status: 'open',
      limit: 1
    });
    
    return trades.length > 0 ? trades[0] : null;
  }

  /**
   * Delete a trade by ID
   */
  async deleteTrade(tradeId: string): Promise<void> {
    await this.store.deleteTrade(tradeId);
    console.log(`[TradeHistoryService] Trade deleted: ${tradeId}`);
  }
  
  /**
   * Close the service and underlying store
   */
  async close(): Promise<void> {
    await this.store.close();
    console.log('[TradeHistoryService] Service closed');
  }
}

// Singleton instance
let instance: TradeHistoryService | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get or create the trade history service singleton
 * IMPORTANT: For the first call, you must await ensureTradeHistoryInitialized() 
 * before recording trades to ensure the DB is ready!
 */
export function getTradeHistoryService(): TradeHistoryService {
  if (!instance) {
    // Check environment variable for store type
    const storeType = process.env.DB_PROVIDER === 'sql' ? 'sql' : 'kv';
    const dbPath = process.env.TRADE_DB_PATH;
    
    instance = new TradeHistoryService(storeType, dbPath);
    
    // Initialize asynchronously and store promise
    if (!initPromise) {
      initPromise = instance.initialize().catch(err => {
        console.error('[TradeHistoryService] Initialization error:', err);
        throw err;
      });
    }
  }
  
  return instance;
}

/**
 * Ensure TradeHistoryService is initialized before using it
 * CRITICAL: Call this BEFORE recording trades to prevent data loss!
 */
export async function ensureTradeHistoryInitialized(): Promise<void> {
  // Get or create instance
  getTradeHistoryService();
  
  // Wait for initialization to complete
  if (initPromise) {
    await initPromise;
    console.log('[TradeHistoryService] ✅ Database ready for trade recording');
  }
}

// Export types
export type { TradeRecord, TradeHistoryQuery, TradeHistoryStats };

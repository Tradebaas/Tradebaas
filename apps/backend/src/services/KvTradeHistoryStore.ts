/**
 * KV Trade History Store (In-Memory)
 * 
 * Simple Map-based implementation for development/testing.
 * Data is lost on server restart.
 */

import type { ITradeHistoryStore, TradeRecord, TradeHistoryQuery, TradeHistoryStats } from './ITradeHistoryStore';

export class KvTradeHistoryStore implements ITradeHistoryStore {
  private trades: Map<string, TradeRecord> = new Map();
  
  async initialize(): Promise<void> {
    console.log('[KvTradeHistoryStore] Initialized (in-memory storage)');
  }
  
  async addTrade(trade: TradeRecord): Promise<void> {
    this.trades.set(trade.id, { ...trade });
    console.log(`[KvTradeHistoryStore] Added trade ${trade.id}`);
  }
  
  async updateTrade(id: string, updates: Partial<TradeRecord>): Promise<void> {
    const existing = this.trades.get(id);
    if (!existing) {
      throw new Error(`Trade ${id} not found`);
    }
    
    this.trades.set(id, { ...existing, ...updates });
    console.log(`[KvTradeHistoryStore] Updated trade ${id}`);
  }
  
  async getTrade(id: string): Promise<TradeRecord | null> {
    return this.trades.get(id) || null;
  }
  
  async queryTrades(query: TradeHistoryQuery): Promise<TradeRecord[]> {
    let results = Array.from(this.trades.values());
    
    // Apply filters
    if (query.strategyName) {
      results = results.filter(t => t.strategyName === query.strategyName);
    }
    
    if (query.instrument) {
      results = results.filter(t => t.instrument === query.instrument);
    }
    
    if (query.status) {
      results = results.filter(t => t.status === query.status);
    }
    
    if (query.startTime) {
      results = results.filter(t => t.entryTime >= query.startTime!);
    }
    
    if (query.endTime) {
      results = results.filter(t => t.entryTime <= query.endTime!);
    }
    
    // Sort by entry time descending (newest first)
    results.sort((a, b) => b.entryTime - a.entryTime);
    
    // Apply pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }
    
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    
    return results;
  }
  
  async getAllTrades(): Promise<TradeRecord[]> {
    return this.queryTrades({});
  }
  
  async getStats(query?: TradeHistoryQuery): Promise<TradeHistoryStats> {
    const trades = await this.queryTrades(query || {});
    const closedTrades = trades.filter(t => t.status === 'closed' && t.pnl !== undefined);
    
    const winningTrades = closedTrades.filter(t => t.pnl! > 0);
    const losingTrades = closedTrades.filter(t => t.pnl! < 0);
    
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
    
    const pnls = closedTrades.map(t => t.pnl!);
    const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
    
    const slHits = closedTrades.filter(t => t.exitReason === 'sl_hit').length;
    const tpHits = closedTrades.filter(t => t.exitReason === 'tp_hit').length;
    
    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
      totalPnl,
      avgPnl,
      bestTrade,
      worstTrade,
      slHits,
      tpHits
    };
  }
  
  async deleteTrade(id: string): Promise<void> {
    this.trades.delete(id);
    console.log(`[KvTradeHistoryStore] Deleted trade ${id}`);
  }
  
  async clearAll(): Promise<void> {
    this.trades.clear();
    console.log('[KvTradeHistoryStore] Cleared all trades');
  }
  
  async close(): Promise<void> {
    // No cleanup needed for in-memory store
    console.log('[KvTradeHistoryStore] Closed');
  }
}

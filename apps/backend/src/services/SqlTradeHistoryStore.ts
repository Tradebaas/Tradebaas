/**
 * SQL Trade History Store (SQLite)
 * 
 * Persistent storage using better-sqlite3.
 * Data survives server restarts.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { ITradeHistoryStore, TradeRecord, TradeHistoryQuery, TradeHistoryStats } from './ITradeHistoryStore';

export class SqlTradeHistoryStore implements ITradeHistoryStore {
  private db: Database.Database | null = null;
  private dbPath: string;
  
  constructor(dbPath?: string) {
    // Default to state/trades.db
    this.dbPath = dbPath || path.join(process.cwd(), '..', 'state', 'trades.db');
  }
  
  async initialize(): Promise<void> {
    // Ensure state directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Open database
    this.db = new Database(this.dbPath);
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    // Create trades table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        strategyName TEXT NOT NULL,
        instrument TEXT NOT NULL,
        side TEXT NOT NULL,
        entryOrderId TEXT NOT NULL,
        slOrderId TEXT,
        tpOrderId TEXT,
        entryPrice REAL NOT NULL,
        exitPrice REAL,
        amount REAL NOT NULL,
        stopLoss REAL NOT NULL,
        takeProfit REAL NOT NULL,
        entryTime INTEGER NOT NULL,
        exitTime INTEGER,
        exitReason TEXT,
        pnl REAL,
        pnlPercentage REAL,
        status TEXT NOT NULL,
        metadata TEXT,
        user_id TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategyName);
      CREATE INDEX IF NOT EXISTS idx_trades_instrument ON trades(instrument);
      CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
      CREATE INDEX IF NOT EXISTS idx_trades_entryTime ON trades(entryTime);
      CREATE INDEX IF NOT EXISTS idx_trades_exitReason ON trades(exitReason);
      CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id);
      CREATE INDEX IF NOT EXISTS idx_trades_user_strategy_time ON trades(user_id, strategyName, entryTime DESC);
    `);
    
    console.log(`[SqlTradeHistoryStore] Initialized at ${this.dbPath}`);
  }
  
  async addTrade(trade: TradeRecord): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(`
      INSERT INTO trades (
        id, user_id, strategyName, instrument, side, entryOrderId, slOrderId, tpOrderId,
        entryPrice, exitPrice, amount, stopLoss, takeProfit,
        entryTime, exitTime, exitReason, pnl, pnlPercentage, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      trade.id,
      trade.userId || null,
      trade.strategyName,
      trade.instrument,
      trade.side,
      trade.entryOrderId,
      trade.slOrderId || null,
      trade.tpOrderId || null,
      trade.entryPrice,
      trade.exitPrice || null,
      trade.amount,
      trade.stopLoss,
      trade.takeProfit,
      trade.entryTime,
      trade.exitTime || null,
      trade.exitReason || null,
      trade.pnl || null,
      trade.pnlPercentage || null,
      trade.status,
      trade.metadata ? JSON.stringify(trade.metadata) : null
    );
    
    console.log(`[SqlTradeHistoryStore] Added trade ${trade.id}`);
  }
  
  async updateTrade(id: string, updates: Partial<TradeRecord>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Build dynamic UPDATE query
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.exitPrice !== undefined) {
      fields.push('exitPrice = ?');
      values.push(updates.exitPrice);
    }
    if (updates.exitTime !== undefined) {
      fields.push('exitTime = ?');
      values.push(updates.exitTime);
    }
    if (updates.exitReason !== undefined) {
      fields.push('exitReason = ?');
      values.push(updates.exitReason);
    }
    if (updates.pnl !== undefined) {
      fields.push('pnl = ?');
      values.push(updates.pnl);
    }
    if (updates.pnlPercentage !== undefined) {
      fields.push('pnlPercentage = ?');
      values.push(updates.pnlPercentage);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.slOrderId !== undefined) {
      fields.push('slOrderId = ?');
      values.push(updates.slOrderId);
    }
    if (updates.tpOrderId !== undefined) {
      fields.push('tpOrderId = ?');
      values.push(updates.tpOrderId);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }
    
    if (fields.length === 0) return;
    
    values.push(id);
    
    const stmt = this.db.prepare(`UPDATE trades SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    
    console.log(`[SqlTradeHistoryStore] Updated trade ${id}`);
  }
  
  async getTrade(id: string): Promise<TradeRecord | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare('SELECT * FROM trades WHERE id = ?');
    const row = stmt.get(id) as any;
    
    return row ? this.rowToTrade(row) : null;
  }
  
  async queryTrades(query: TradeHistoryQuery): Promise<TradeRecord[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    let sql = 'SELECT * FROM trades WHERE 1=1';
    const params: any[] = [];
    
    if (query.userId) {
      sql += ' AND user_id = ?';
      params.push(query.userId);
    }
    
    if (query.strategyName) {
      sql += ' AND strategyName = ?';
      params.push(query.strategyName);
    }
    
    if (query.instrument) {
      sql += ' AND instrument = ?';
      params.push(query.instrument);
    }
    
    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }
    
    if (query.startTime) {
      sql += ' AND entryTime >= ?';
      params.push(query.startTime);
    }
    
    if (query.endTime) {
      sql += ' AND entryTime <= ?';
      params.push(query.endTime);
    }
    
    sql += ' ORDER BY entryTime DESC';
    
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }
    
    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => this.rowToTrade(row));
  }
  
  async getAllTrades(): Promise<TradeRecord[]> {
    return this.queryTrades({});
  }
  
  async getStats(query?: TradeHistoryQuery): Promise<TradeHistoryStats> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Build WHERE clause from query
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    
    if (query?.userId) {
      whereClause += ' AND user_id = ?';
      params.push(query.userId);
    }
    
    if (query?.strategyName) {
      whereClause += ' AND strategyName = ?';
      params.push(query.strategyName);
    }
    
    if (query?.instrument) {
      whereClause += ' AND instrument = ?';
      params.push(query.instrument);
    }
    
    if (query?.startTime) {
      whereClause += ' AND entryTime >= ?';
      params.push(query.startTime);
    }
    
    if (query?.endTime) {
      whereClause += ' AND entryTime <= ?';
      params.push(query.endTime);
    }
    
    // Get aggregate stats
    const statsStmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalTrades,
        SUM(CASE WHEN status = 'closed' AND pnl > 0 THEN 1 ELSE 0 END) as winningTrades,
        SUM(CASE WHEN status = 'closed' AND pnl < 0 THEN 1 ELSE 0 END) as losingTrades,
        SUM(CASE WHEN status = 'closed' THEN pnl ELSE 0 END) as totalPnl,
        AVG(CASE WHEN status = 'closed' THEN pnl ELSE NULL END) as avgPnl,
        MAX(CASE WHEN status = 'closed' THEN pnl ELSE NULL END) as bestTrade,
        MIN(CASE WHEN status = 'closed' THEN pnl ELSE NULL END) as worstTrade,
        SUM(CASE WHEN exitReason = 'sl_hit' THEN 1 ELSE 0 END) as slHits,
        SUM(CASE WHEN exitReason = 'tp_hit' THEN 1 ELSE 0 END) as tpHits,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closedTrades
      FROM trades
      ${whereClause}
    `);
    
    const stats = statsStmt.get(...params) as any;
    
    const winRate = stats.closedTrades > 0 
      ? (stats.winningTrades / stats.closedTrades) * 100 
      : 0;
    
    return {
      totalTrades: stats.totalTrades || 0,
      winningTrades: stats.winningTrades || 0,
      losingTrades: stats.losingTrades || 0,
      winRate,
      totalPnl: stats.totalPnl || 0,
      avgPnl: stats.avgPnl || 0,
      bestTrade: stats.bestTrade || 0,
      worstTrade: stats.worstTrade || 0,
      slHits: stats.slHits || 0,
      tpHits: stats.tpHits || 0
    };
  }
  
  async deleteTrade(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare('DELETE FROM trades WHERE id = ?');
    stmt.run(id);
    
    console.log(`[SqlTradeHistoryStore] Deleted trade ${id}`);
  }
  
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    this.db.exec('DELETE FROM trades');
    console.log('[SqlTradeHistoryStore] Cleared all trades');
  }
  
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[SqlTradeHistoryStore] Database closed');
    }
  }
  
  private rowToTrade(row: any): TradeRecord {
    return {
      id: row.id,
      userId: row.user_id || undefined,
      strategyName: row.strategyName,
      instrument: row.instrument,
      side: row.side,
      entryOrderId: row.entryOrderId,
      slOrderId: row.slOrderId || undefined,
      tpOrderId: row.tpOrderId || undefined,
      entryPrice: row.entryPrice,
      exitPrice: row.exitPrice || undefined,
      amount: row.amount,
      stopLoss: row.stopLoss,
      takeProfit: row.takeProfit,
      entryTime: row.entryTime,
      exitTime: row.exitTime || undefined,
      exitReason: row.exitReason || undefined,
      pnl: row.pnl || undefined,
      pnlPercentage: row.pnlPercentage || undefined,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
}

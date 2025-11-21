/**
 * Trade History Store Interface
 * 
 * Pluggable storage interface for trade history.
 * Implementations: KvTradeHistoryStore (in-memory), SqlTradeHistoryStore (SQLite/PostgreSQL)
 */

export interface TradeRecord {
  /** Unique trade ID */
  id: string;
  
  /** User ID (for multi-user support) - FASE 3 */
  userId?: string;
  
  /** Strategy that executed this trade */
  strategyName: string;
  
  /** Instrument traded */
  instrument: string;
  
  /** Trade direction */
  side: 'buy' | 'sell';
  
  /** Entry order ID */
  entryOrderId: string;
  
  /** Stop loss order ID (if placed) */
  slOrderId?: string;
  
  /** Take profit order ID (if placed) */
  tpOrderId?: string;
  
  /** Entry price */
  entryPrice: number;
  
  /** Exit price (if closed) */
  exitPrice?: number;
  
  /** Position size in contracts */
  amount: number;
  
  /** Stop loss price */
  stopLoss: number;
  
  /** Take profit price */
  takeProfit: number;
  
  /** Entry timestamp (Unix ms) */
  entryTime: number;
  
  /** Exit timestamp (Unix ms, if closed) */
  exitTime?: number;
  
  /** Exit reason: 'sl_hit', 'tp_hit', 'manual', 'strategy_stop', 'error' */
  exitReason?: 'sl_hit' | 'tp_hit' | 'manual' | 'strategy_stop' | 'error';
  
  /** Realized PnL in USDC (if closed) */
  pnl?: number;
  
  /** PnL percentage (if closed) */
  pnlPercentage?: number;

  /** Total fees paid (entry + exit) */
  fees?: number;
  
  /** Current status */
  status: 'open' | 'closed';
  
  /** Additional metadata (JSON) */
  metadata?: Record<string, any>;
}

export interface TradeHistoryQuery {
  /** Filter by user ID (multi-user support) - FASE 3 */
  userId?: string;
  
  /** Filter by strategy name */
  strategyName?: string;
  
  /** Filter by instrument */
  instrument?: string;
  
  /** Filter by status */
  status?: 'open' | 'closed';
  
  /** Filter by time range (Unix ms) */
  startTime?: number;
  endTime?: number;
  
  /** Pagination */
  limit?: number;
  offset?: number;
}

export interface TradeHistoryStats {
  /** Total number of trades */
  totalTrades: number;
  
  /** Number of winning trades */
  winningTrades: number;
  
  /** Number of losing trades */
  losingTrades: number;
  
  /** Win rate percentage */
  winRate: number;
  
  /** Total realized PnL */
  totalPnl: number;
  
  /** Average PnL per trade */
  avgPnl: number;
  
  /** Best trade PnL */
  bestTrade: number;
  
  /** Worst trade PnL */
  worstTrade: number;
  
  /** Total number of SL hits */
  slHits: number;
  
  /** Total number of TP hits */
  tpHits: number;
}

/**
 * Pluggable trade history storage interface
 */
export interface ITradeHistoryStore {
  /**
   * Initialize the store (create tables, connect to DB, etc.)
   */
  initialize(): Promise<void>;
  
  /**
   * Add a new trade record
   */
  addTrade(trade: TradeRecord): Promise<void>;
  
  /**
   * Update an existing trade (e.g., when position closes)
   */
  updateTrade(id: string, updates: Partial<TradeRecord>): Promise<void>;
  
  /**
   * Get a specific trade by ID
   */
  getTrade(id: string): Promise<TradeRecord | null>;
  
  /**
   * Query trades with filters
   */
  queryTrades(query: TradeHistoryQuery): Promise<TradeRecord[]>;
  
  /**
   * Get all trades (for backwards compatibility)
   */
  getAllTrades(): Promise<TradeRecord[]>;
  
  /**
   * Get statistics for a time period
   */
  getStats(query?: TradeHistoryQuery): Promise<TradeHistoryStats>;
  
  /**
   * Delete a trade by ID
   */
  deleteTrade(id: string): Promise<void>;
  
  /**
   * Clear all trades (use with caution!)
   */
  clearAll(): Promise<void>;
  
  /**
   * Close the store (disconnect from DB, cleanup, etc.)
   */
  close(): Promise<void>;
}

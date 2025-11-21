-- Rollback Migration: Add user_id column to trades table
-- Database: SQLite
-- Date: 2025-11-21
-- Description: Remove user_id column from trades table

-- ============================================================================
-- IMPORTANT: SQLite Limitations
-- ============================================================================
-- SQLite does NOT support:
-- - ALTER TABLE DROP COLUMN (before version 3.35.0)
--
-- Solution: Recreate table without user_id column
-- ============================================================================

-- Step 1: Create new table without user_id
CREATE TABLE trades_backup (
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
  metadata TEXT
);

-- Step 2: Copy data (excluding user_id)
INSERT INTO trades_backup 
SELECT 
  id, strategyName, instrument, side, entryOrderId, slOrderId, tpOrderId,
  entryPrice, exitPrice, amount, stopLoss, takeProfit,
  entryTime, exitTime, exitReason, pnl, pnlPercentage, status, metadata
FROM trades;

-- Step 3: Drop old table
DROP TABLE trades;

-- Step 4: Rename backup to trades
ALTER TABLE trades_backup RENAME TO trades;

-- Step 5: Recreate original indexes
CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategyName);
CREATE INDEX IF NOT EXISTS idx_trades_instrument ON trades(instrument);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_entryTime ON trades(entryTime);
CREATE INDEX IF NOT EXISTS idx_trades_exitReason ON trades(exitReason);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Manual verification needed (SQLite doesn't support procedural checks)
-- Run: sqlite3 state/trades.db ".schema trades"
-- Verify: user_id column NOT present
-- ============================================================================

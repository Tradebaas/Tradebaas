-- Migration: Add user_id column to trades table
-- Database: SQLite
-- Date: 2025-11-21
-- Description: Extend trades table for multi-user support

-- ============================================================================
-- IMPORTANT: SQLite Limitations
-- ============================================================================
-- SQLite does NOT support:
-- - ALTER TABLE ADD COLUMN ... REFERENCES (foreign keys in ALTER)
-- - ALTER TABLE ALTER COLUMN (modify existing columns)
--
-- Solution: Add column as nullable first, migrate data, then enforce NOT NULL
-- ============================================================================

-- Add user_id column (nullable for now, NOT NULL after data migration)
ALTER TABLE trades ADD COLUMN user_id TEXT;

-- Create index for performance (user-specific queries)
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id);

-- Create composite index for common query pattern (user + strategy + time)
CREATE INDEX IF NOT EXISTS idx_trades_user_strategy_time 
  ON trades(user_id, strategyName, entryTime DESC);

-- ============================================================================
-- NOTES FOR DATA MIGRATION
-- ============================================================================
-- After running this migration:
-- 1. Run data migration script to assign user_id to existing trades
-- 2. Verify all trades have user_id populated
-- 3. Run 003_make_user_id_not_null.sql to enforce NOT NULL
-- ============================================================================

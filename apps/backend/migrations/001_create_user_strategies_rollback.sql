-- Rollback Migration: Create user_strategies table
-- Database: PostgreSQL
-- Date: 2025-11-21
-- Description: Undo creation of user_strategies table

-- ============================================================================
-- DROP TABLE: user_strategies
-- ============================================================================

-- Drop triggers first (dependent objects)
DROP TRIGGER IF EXISTS trigger_update_user_strategies_updated_at ON user_strategies;

-- Drop functions
DROP FUNCTION IF EXISTS update_user_strategies_updated_at();

-- Drop indexes (automatically dropped with table, but explicit for clarity)
DROP INDEX IF EXISTS idx_user_strategies_user;
DROP INDEX IF EXISTS idx_user_strategies_status;
DROP INDEX IF EXISTS idx_user_strategies_auto_reconnect;
DROP INDEX IF EXISTS idx_user_strategies_updated;
DROP INDEX IF EXISTS idx_user_strategies_user_status;

-- Drop table
DROP TABLE IF EXISTS user_strategies;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_strategies') THEN
    RAISE NOTICE '✅ Rollback 001: user_strategies table dropped successfully';
  ELSE
    RAISE EXCEPTION '❌ Rollback 001 FAILED: user_strategies table still exists';
  END IF;
END $$;

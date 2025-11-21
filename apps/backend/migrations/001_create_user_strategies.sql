-- Migration: Create user_strategies table
-- Database: PostgreSQL
-- Date: 2025-11-21
-- Description: Multi-user strategy state persistence (agnostic design)

-- ============================================================================
-- CREATE TABLE: user_strategies
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_strategies (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign Key (user isolation)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Strategy Identification (AGNOSTIC: works for ANY strategy)
  strategy_name VARCHAR(100) NOT NULL,  -- 'Razor', 'Thor', 'YourFutureStrategy', etc.
  instrument VARCHAR(100) NOT NULL,     -- 'BTC_USDC-PERPETUAL', 'ETH-PERPETUAL', etc.
  
  -- Broker Configuration (AGNOSTIC: works for ANY broker)
  broker VARCHAR(50) NOT NULL DEFAULT 'deribit',  -- 'deribit', 'binance', 'kraken', etc.
  environment VARCHAR(20) NOT NULL,               -- 'live', 'testnet', 'sandbox', etc.
  
  -- Strategy Configuration (AGNOSTIC: JSONB for ANY config structure)
  config JSONB NOT NULL DEFAULT '{}',
  -- Examples:
  -- Razor: {"timeframe":"1h","maxTrades":3,"riskPercent":1.5}
  -- Thor: {"volatilityThreshold":2.5,"entryDelay":60}
  -- Future strategies: ANY JSON structure
  
  -- Strategy State
  status VARCHAR(50) NOT NULL DEFAULT 'stopped',
  -- Valid values: 'active', 'stopped', 'paused', 'error'
  
  -- Manual Connect Tracking (CRITICAL for 24/7 behavior)
  last_action VARCHAR(50),
  -- Values: 'manual_start', 'manual_stop', 'manual_connect', 'manual_disconnect', 'auto_resume'
  
  auto_reconnect BOOLEAN DEFAULT true,
  -- FALSE when user manually disconnects (prevents auto-resume on restart)
  
  -- Connection Timestamps
  connected_at TIMESTAMP WITH TIME ZONE,
  disconnected_at TIMESTAMP WITH TIME ZONE,
  last_heartbeat TIMESTAMP WITH TIME ZONE,
  
  -- Error Handling
  error_message TEXT,
  error_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- ========================================================================
  -- CONSTRAINTS
  -- ========================================================================
  
  -- Unique: One active strategy per user+strategy+instrument+environment
  CONSTRAINT unique_user_strategy UNIQUE (user_id, strategy_name, instrument, environment),
  
  -- Check: Valid status values
  CONSTRAINT check_status CHECK (status IN ('active', 'stopped', 'paused', 'error')),
  
  -- Check: Valid environment values (extensible: add 'sandbox', 'paper', etc.)
  CONSTRAINT check_environment CHECK (environment IN ('live', 'testnet'))
);

-- ============================================================================
-- INDEXES (Performance optimization for multi-user queries)
-- ============================================================================

-- Index: Filter by user (most common query)
CREATE INDEX IF NOT EXISTS idx_user_strategies_user 
  ON user_strategies(user_id);

-- Index: Filter by status (for auto-resume queries)
CREATE INDEX IF NOT EXISTS idx_user_strategies_status 
  ON user_strategies(status);

-- Index: Filter by auto_reconnect (for manual disconnect checks)
CREATE INDEX IF NOT EXISTS idx_user_strategies_auto_reconnect 
  ON user_strategies(auto_reconnect);

-- Index: Sort by updated_at (for recent activity)
CREATE INDEX IF NOT EXISTS idx_user_strategies_updated 
  ON user_strategies(updated_at DESC);

-- Composite Index: user_id + status (common query pattern)
CREATE INDEX IF NOT EXISTS idx_user_strategies_user_status 
  ON user_strategies(user_id, status);

-- ============================================================================
-- TRIGGERS (Auto-update timestamps)
-- ============================================================================

-- Function: Update updated_at on row change
CREATE OR REPLACE FUNCTION update_user_strategies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at
CREATE TRIGGER trigger_update_user_strategies_updated_at
  BEFORE UPDATE ON user_strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_user_strategies_updated_at();

-- ============================================================================
-- COMMENTS (Documentation in database)
-- ============================================================================

COMMENT ON TABLE user_strategies IS 'Multi-user strategy state persistence (agnostic design for any strategy/broker)';
COMMENT ON COLUMN user_strategies.config IS 'JSONB field - works for ANY strategy config structure (Razor, Thor, future strategies)';
COMMENT ON COLUMN user_strategies.broker IS 'Broker name - works for ANY broker (deribit, binance, kraken, etc.)';
COMMENT ON COLUMN user_strategies.environment IS 'Environment - extensible (live, testnet, sandbox, paper, etc.)';
COMMENT ON COLUMN user_strategies.auto_reconnect IS 'FALSE = manual disconnect (no auto-resume on restart)';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify table created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_strategies') THEN
    RAISE NOTICE '✅ Migration 001: user_strategies table created successfully';
  ELSE
    RAISE EXCEPTION '❌ Migration 001 FAILED: user_strategies table not found';
  END IF;
END $$;

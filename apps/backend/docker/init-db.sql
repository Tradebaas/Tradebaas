-- Initialize Tradebaas database schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    apple_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Entitlements table
CREATE TABLE IF NOT EXISTS entitlements (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(50) NOT NULL DEFAULT 'free',
    expiry TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_entitlement UNIQUE(user_id)
);

-- Runner state table (for persistence)
CREATE TABLE IF NOT EXISTS runner_states (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worker_id VARCHAR(255) NOT NULL,
    strategy_id VARCHAR(255) NOT NULL,
    broker_id VARCHAR(255) NOT NULL,
    position JSONB,
    settings JSONB,
    stats JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_worker_state UNIQUE(user_id, worker_id)
);

-- Orders table (for reconciliation)
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worker_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255) NOT NULL,
    instrument VARCHAR(255) NOT NULL,
    side VARCHAR(10) NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL NOT NULL,
    price DECIMAL,
    filled DECIMAL DEFAULT 0,
    status VARCHAR(50) NOT NULL,
    label VARCHAR(255),
    oco_ref VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_order UNIQUE(user_id, order_id)
);

-- Error logs table
CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    worker_id VARCHAR(255),
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    context JSONB,
    request_details JSONB,
    api_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_expiry ON entitlements(expiry);
CREATE INDEX IF NOT EXISTS idx_runner_states_user ON runner_states(user_id);
CREATE INDEX IF NOT EXISTS idx_runner_states_worker ON runner_states(worker_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_worker ON orders(worker_id);
CREATE INDEX IF NOT EXISTS idx_orders_label ON orders(label);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entitlements_updated_at BEFORE UPDATE ON entitlements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_runner_states_updated_at BEFORE UPDATE ON runner_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (optional)
-- INSERT INTO users (id, email) VALUES ('admin', 'admin@tradebaas.com') ON CONFLICT DO NOTHING;

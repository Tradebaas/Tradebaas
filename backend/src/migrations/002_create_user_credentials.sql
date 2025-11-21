CREATE TABLE IF NOT EXISTS user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker VARCHAR(50) NOT NULL,
  environment VARCHAR(20) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_salt TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  
  CONSTRAINT unique_user_broker_env UNIQUE (user_id, broker, environment)
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_user ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_broker ON user_credentials(broker);
CREATE INDEX IF NOT EXISTS idx_user_credentials_active ON user_credentials(is_active);

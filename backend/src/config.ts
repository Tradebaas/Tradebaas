import { BROKER_WHITELIST } from './brokers/BrokerRegistry';

export const config = {
  BROKER_WHITELIST,
  
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 10000,
  
  WS_RECONNECT_DELAY_MS: 5000,
  WS_MAX_RECONNECT_ATTEMPTS: 10,
  WS_PING_INTERVAL_MS: 30000,
  
  RATE_LIMIT_REQUESTS_PER_SECOND: 10,
  RATE_LIMIT_BURST: 20,
};

export function getEnvVar(key: string, fallback?: string): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback || '';
  }
  return fallback || '';
}

export function getBrokerCredentials(brokerId: string): { apiKey: string; apiSecret: string } | null {
  const prefix = brokerId.toUpperCase();
  const apiKey = getEnvVar(`${prefix}_API_KEY`);
  const apiSecret = getEnvVar(`${prefix}_API_SECRET`);
  
  if (!apiKey || !apiSecret) {
    return null;
  }
  
  return { apiKey, apiSecret };
}

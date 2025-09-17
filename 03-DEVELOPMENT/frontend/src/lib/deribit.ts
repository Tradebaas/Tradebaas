// Lightweight Deribit JSON-RPC client over HTTP with OAuth token caching
// Docs: https://docs.deribit.com/

type DeribitEnv = 'prod' | 'test';

function getEnv(): DeribitEnv {
  const val = (process.env.DERIBIT_ENV || 'prod').toLowerCase();
  return val === 'test' || val === 'testnet' ? 'test' : 'prod';
}

function getBaseUrl() {
  const env = getEnv();
  return env === 'test' ? 'https://test.deribit.com' : 'https://www.deribit.com';
}

async function readFromFileAsync(path?: string): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    const fs = await import('fs');
    const exists = await fs.promises
      .access(path)
      .then(() => true)
      .catch(() => false);
    if (!exists) return undefined;
    const content = await fs.promises.readFile(path, 'utf8');
    return content.trim();
  } catch (_e) {
    // ignore
  }
  return undefined;
}

function getCredentialsSync() {
  const env = getEnv();
  // Support env-specific variables like DERIBIT_CLIENT_ID_PROD / _TEST
  const idKey = env === 'test' ? process.env.DERIBIT_CLIENT_ID_TEST : process.env.DERIBIT_CLIENT_ID_PROD;
  const secretKey = env === 'test' ? process.env.DERIBIT_CLIENT_SECRET_TEST : process.env.DERIBIT_CLIENT_SECRET_PROD;

  // Generic names
  const clientId = idKey || process.env.DERIBIT_CLIENT_ID;
  const clientSecret = secretKey || process.env.DERIBIT_CLIENT_SECRET;

  // Support *_FILE pattern (Docker/K8s secrets)
  // Note: we cannot use async FS in getCredentialsSync. We'll fall back to env-only here;
  // the API route could be extended to resolve *_FILE at startup if required.

  return { clientId, clientSecret };
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

type TokenInfo = {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string;
  scope?: string;
  token_type?: string; // 'bearer'
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  let delay = 250; // ms
  while (true) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          await sleep(delay);
          attempt += 1;
          delay = Math.min(delay * 2, 2000);
          continue;
        }
      }
      return res;
    } catch (e) {
      // Network error or timeout
      if (attempt < maxRetries) {
        await sleep(delay);
        attempt += 1;
        delay = Math.min(delay * 2, 2000);
        continue;
      }
      throw e;
    }
  }
}

async function jsonRpc<T = unknown>(method: string, params?: Record<string, unknown>, token?: string): Promise<T> {
  const req: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetchWithRetry(
    `${getBaseUrl()}/api/v2/`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      // Avoid Next.js fetch cache for private data
      cache: 'no-store',
    },
    3
  );

  const data = (await res.json()) as JsonRpcResponse<T>;
  if (!res.ok || data.error) {
    const code = data.error?.code ?? res.status;
    const message = data.error?.message || `HTTP ${res.status}`;
    throw new Error(`Deribit RPC error ${code}: ${message}`);
  }
  return data.result as T;
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 5_000) {
    return cachedToken.token;
  }

  const { clientId, clientSecret } = getCredentialsSync();
  let id = clientId;
  let secret = clientSecret;
  if (!id) {
    id = await readFromFileAsync(process.env.DERIBIT_CLIENT_ID_FILE);
  }
  if (!secret) {
    secret = await readFromFileAsync(process.env.DERIBIT_CLIENT_SECRET_FILE);
  }

  if (!id || !secret) {
    throw new Error('Missing DERIBIT_CLIENT_ID or DERIBIT_CLIENT_SECRET');
  }

  const result = await jsonRpc<TokenInfo>('public/auth', {
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: secret,
    // Optional scope; leaving default grants broad API access for account info
    // scope: 'session:apicontext',
  });

  const expiresAt = Date.now() + (result.expires_in - 30) * 1000; // refresh 30s early
  cachedToken = { token: result.access_token, expiresAt };
  return result.access_token;
}

export type AccountSummary = {
  equity: number;
  available_funds: number;
  balance: number;
  initial_margin: number;
  maintenance_margin: number;
  currency: string;
};

export async function getAccountSummary(currency: string): Promise<AccountSummary> {
  let token = await getToken();
  try {
    const result = await jsonRpc<AccountSummary>('private/get_account_summary', { currency, extended: true }, token);
    return result;
  } catch (e) {
    // If token might be expired/invalid, refresh once and retry
    const msg = String((e as { message?: string })?.message || '').toLowerCase();
    if (msg.includes('invalid_token') || msg.includes('invalid client') || msg.includes('invalid_client')) {
      cachedToken = null;
      token = await getToken();
      const result = await jsonRpc<AccountSummary>('private/get_account_summary', { currency, extended: true }, token);
      return result;
    }
    throw e;
  }
}

export function getDeribitEnv() {
  const env = getEnv();
  return { env, baseUrl: getBaseUrl() };
}
// Lightweight Deribit client for server-side use (Next.js API routes)

// --- Trading Helpers ---
export type Position = {
  instrument_name: string;
  size: number; // positive for long, negative for short
  direction?: 'long' | 'short';
  kind?: string;
  maintenance_margin?: number;
  initial_margin?: number;
  average_price?: number;
};

export async function getOpenPositions(currency: string): Promise<Position[]> {
  let token = await getToken();
  const params: Record<string, unknown> = { currency, kind: 'future' };
  try {
    const result = await jsonRpc<Position[]>('private/get_positions', params, token);
    return (result || []).filter((p) => Math.abs(p.size) > 0);
  } catch (e) {
    const msg = String((e as { message?: string })?.message || '').toLowerCase();
    if (msg.includes('invalid_token') || msg.includes('invalid client') || msg.includes('invalid_client')) {
      cachedToken = null;
      token = await getToken();
      const result = await jsonRpc<Position[]>('private/get_positions', params, token);
      return (result || []).filter((p) => Math.abs(p.size) > 0);
    }
    throw e;
  }
}

export type Ticker = { mark_price?: number; last_price?: number; index_price?: number };
export async function getTicker(instrumentName: string): Promise<Ticker> {
  const params: Record<string, unknown> = { instrument_name: instrumentName };
  const result = await jsonRpc<Ticker>('public/ticker', params);
  return result || {};
}

export async function closePosition(instrumentName: string, type: 'market' | 'limit' = 'market'): Promise<{ order_id?: string } | unknown> {
  let token = await getToken();
  const params: Record<string, unknown> = { instrument_name: instrumentName, type };
  try {
    return await jsonRpc('private/close_position', params, token);
  } catch (e) {
    const msg = String((e as { message?: string })?.message || '').toLowerCase();
    if (msg.includes('invalid_token') || msg.includes('invalid client') || msg.includes('invalid_client')) {
      cachedToken = null;
      token = await getToken();
      return await jsonRpc('private/close_position', params, token);
    }
    throw e;
  }
}

export async function cancelAllByCurrency(currency: string): Promise<{ cancelled?: number } | unknown> {
  let token = await getToken();
  const params: Record<string, unknown> = { currency, kind: 'future' };
  try {
    return await jsonRpc('private/cancel_all_by_currency', params, token);
  } catch (e) {
    const msg = String((e as { message?: string })?.message || '').toLowerCase();
    if (msg.includes('invalid_token') || msg.includes('invalid client') || msg.includes('invalid_client')) {
      cachedToken = null;
      token = await getToken();
      return await jsonRpc('private/cancel_all_by_currency', params, token);
    }
    throw e;
  }
}

// --- Analytics Helpers ---
export type UserTrade = {
  trade_id: string;
  instrument_name: string;
  direction: 'buy' | 'sell';
  amount: number;
  price: number;
  index_price?: number;
  fee?: number;
  timestamp: number; // ms
  // Deribit trade object has more fields; we map only the ones we need
};

export async function getUserTradesByCurrency(
  currency: string,
  startTimestamp?: number,
  endTimestamp?: number,
  count = 200
): Promise<UserTrade[]> {
  let token = await getToken();
  const params: Record<string, unknown> = {
    currency,
    kind: 'future',
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    count,
    include_old: true,
  };
  try {
    const result = await jsonRpc<{ trades: UserTrade[] }>('private/get_user_trades_by_currency', params, token);
    type TradesResp = { trades?: unknown };
    const maybe = result as unknown as TradesResp;
    const trades = Array.isArray(maybe.trades) ? (maybe.trades as UserTrade[]) : [];
    return trades;
  } catch (e) {
    const msg = String((e as { message?: string })?.message || '').toLowerCase();
    if (msg.includes('invalid_token') || msg.includes('invalid client') || msg.includes('invalid_client')) {
      cachedToken = null;
      token = await getToken();
      const result = await jsonRpc<{ trades: UserTrade[] }>('private/get_user_trades_by_currency', params, token);
      type TradesResp = { trades?: unknown };
      const maybe = result as unknown as TradesResp;
      const trades = Array.isArray(maybe.trades) ? (maybe.trades as UserTrade[]) : [];
      return trades;
    }
    throw e;
  }
}

import { getBackendUrl } from './backend-url';

const BACKEND_URL = getBackendUrl();

interface BackendCredentials {
  apiKey: string;
  apiSecret: string;
  environment?: 'live' | 'testnet';
}

interface ConnectResponse {
  success: boolean;
  brokerId: string;
  message: string;
  error?: string;
}

interface StrategyLoadResponse {
  success: boolean;
  strategyId: string;
  message?: string;
  error?: string;
}

interface StrategyStartResponse {
  success: boolean;
  runnerId: string;
  message?: string;
  error?: string;
}

interface StrategyStopResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface ConfigUpdateResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface VerifyReceiptResponse {
  valid: boolean;
  entitlement?: {
    tier: string;
    expiry: string | null;
  };
  jwt?: string;
  error?: string;
}

interface EntitlementResponse {
  tier: string;
  expiry: string | null;
  isActive: boolean;
  daysRemaining: number | null;
}

export class BackendClient {
  private entitlementJWT: string | null = null;
  private brokerId: string | null = null;

  constructor() {
    // Defer JWT loading until spark is ready
    setTimeout(() => this.loadJWT(), 100);
  }

  private async loadJWT() {
    try {
      // Wait for spark to be available
      let retries = 0;
      while (!window.spark?.kv && retries < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }

      if (!window.spark?.kv) {
        console.warn('[BackendClient] Spark KV not available, using localStorage fallback');
      }

      // LEGACY CLEANUP: Use localStorage instead of Spark KV
      const jwt = localStorage.getItem('tradebaas:entitlement_jwt');
      if (jwt) {
        this.entitlementJWT = jwt;
      }
    } catch (error) {
      console.error('Failed to load JWT:', error);
    }
  }

  private async saveJWT(jwt: string) {
    this.entitlementJWT = jwt;
    // LEGACY CLEANUP: Use localStorage instead of Spark KV
    localStorage.setItem('tradebaas:entitlement_jwt', jwt);
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.entitlementJWT) {
      headers['Authorization'] = `Bearer ${this.entitlementJWT}`;
    }

    return headers;
  }

  async connect(brokerId: string, credentials: BackendCredentials): Promise<ConnectResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/connect`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          brokerId,
          credentials,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        this.brokerId = brokerId;
        // LEGACY CLEANUP: Use localStorage instead of Spark KV
        localStorage.setItem('tradebaas:connected_broker', brokerId);
      }

      return data;
    } catch (error) {
      console.error('Backend connect failed:', error);
      return {
        success: false,
        brokerId,
        message: 'Connection failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async loadStrategy(strategyId: string): Promise<StrategyLoadResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/strategy/load`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ strategyId }),
      });

      return await response.json();
    } catch (error) {
      console.error('Strategy load failed:', error);
      return {
        success: false,
        strategyId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async startStrategy(strategyId: string, config?: Record<string, unknown>): Promise<StrategyStartResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/strategy/start`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ 
          strategyId,
          config,
        }),
      });

      return await response.json();
    } catch (error) {
      console.error('Strategy start failed:', error);
      return {
        success: false,
        runnerId: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async stopStrategy(runnerId: string): Promise<StrategyStopResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/strategy/stop`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ runnerId }),
      });

      return await response.json();
    } catch (error) {
      console.error('Strategy stop failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async updateConfig(config: {
    riskMode?: 'fixed' | 'percentage';
    riskValue?: number;
    maxLeverage?: number;
  }): Promise<ConfigUpdateResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/config`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(config),
      });

      return await response.json();
    } catch (error) {
      console.error('Config update failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verifyReceipt(receipt: string, productId: string): Promise<VerifyReceiptResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/iap/verify-receipt`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ receipt, productId }),
      });

      const data = await response.json();

      if (data.valid && data.jwt) {
        await this.saveJWT(data.jwt);
      }

      return data;
    } catch (error) {
      console.error('Receipt verification failed:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getEntitlement(): Promise<EntitlementResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${BACKEND_URL}/api/me/entitlement`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        console.warn('Rate limited on entitlement check, returning free tier');
        return {
          tier: 'free',
          expiry: null,
          isActive: true,
          daysRemaining: null,
        };
      }

      if (response.status === 404 || response.status === 500 || response.status === 503) {
        console.warn('Backend service unavailable, returning free tier');
        return {
          tier: 'free',
          expiry: null,
          isActive: true,
          daysRemaining: null,
        };
      }

      if (!response.ok) {
        console.warn(`Backend HTTP ${response.status}, returning free tier`);
        return {
          tier: 'free',
          expiry: null,
          isActive: true,
          daysRemaining: null,
        };
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Entitlement request timed out, returning free tier');
      } else {
        console.warn('Get entitlement failed (non-critical):', error);
      }
      return {
        tier: 'free',
        expiry: null,
        isActive: true,
        daysRemaining: null,
      };
    }
  }

  async getBrokerName(): Promise<string | null> {
    if (this.brokerId) {
      return this.brokerId;
    }

    try {
      // LEGACY CLEANUP: Use localStorage instead of Spark KV
      const stored = localStorage.getItem('tradebaas:connected_broker');

      if (stored) {
        this.brokerId = stored;
        return stored;
      }
    } catch (error) {
      console.error('Failed to get broker name:', error);
    }

    return null;
  }

  clearAuth() {
    this.entitlementJWT = null;
    this.brokerId = null;
  }

  // ============================================================================
  // NEW METHODS - Iteration 9 Strategy Registry
  // ============================================================================

  async getStrategies(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    tags: string[];
  }>> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/v2/strategies`, {
        headers: this.getHeaders(),
      });
      
      const data = await response.json();
      return data.success ? data.strategies : [];
    } catch (error) {
      console.error('[BackendClient] Failed to get strategies:', error);
      return [];
    }
  }

  async getStrategy(id: string): Promise<any | null> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/v2/strategies/${id}`, {
        headers: this.getHeaders(),
      });
      
      const data = await response.json();
      return data.success ? data.strategy : null;
    } catch (error) {
      console.error('[BackendClient] Failed to get strategy:', error);
      return null;
    }
  }

  async getStrategyStatus(): Promise<{
    status: 'stopped' | 'analyzing' | 'active' | 'in-position' | 'error';
    strategyId?: string;
    strategyName?: string;
    connection?: {
      connected: boolean;
      environment: 'live' | 'testnet';
    };
  }> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/strategy/status`, {
        headers: this.getHeaders(),
      });
      
      return await response.json();
    } catch (error) {
      console.error('[BackendClient] Failed to get strategy status:', error);
      return { status: 'stopped' };
    }
  }

  async saveCredentials(service: string, credentials: { apiKey: string; apiSecret: string }): Promise<boolean> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/credentials`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ service, credentials }),
      });
      
      const data = await response.json();
      return data.success || false;
    } catch (error) {
      console.error('[BackendClient] Failed to save credentials:', error);
      return false;
    }
  }

  async deleteCredentials(service: string): Promise<boolean> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/credentials/${service}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      
      const data = await response.json();
      return data.success || false;
    } catch (error) {
      console.error('[BackendClient] Failed to delete credentials:', error);
      return false;
    }
  }

  async getHealth(): Promise<{ status: string; uptime?: number }> {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      const data = await response.json();
      
      return {
        status: data.status,
        uptime: data.uptime,
      };
    } catch (error) {
      console.error('[BackendClient] Failed to get health:', error);
      return { status: 'unhealthy' };
    }
  }
}

export const backendClient = new BackendClient();

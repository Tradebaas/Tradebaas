/**
 * Backend Strategy Client
 * Communicates with backend for 24/7 strategy execution
 */

import { getBackendUrl } from './backend-url';

export interface BackendStrategyStartRequest {
  strategyName: string;
  instrument: string;
  environment: 'live' | 'testnet';
  disclaimerAccepted: boolean;
  config: {
    riskMode: string;
    riskValue: number;
    [key: string]: any;
  };
}

export interface BackendStrategyStopRequest {
  strategyId: string;
}

export interface BackendStrategyState {
  id: string;
  name: string;
  status: 'active' | 'stopped' | 'error';
  startedAt: number;
  config: Record<string, any>;
  position?: {
    instrument: string;
    direction: 'long' | 'short';
    entryPrice: number;
    amount: number;
    stopLoss: number;
    takeProfit: number;
    orderId: string;
  };
  analysisState?: {
    status: 'initializing' | 'analyzing' | 'signal_detected' | 'position_open' | 'cooldown' | 'error';
    currentPrice?: number;
    lastUpdated?: number;
    cooldownUntil?: number | null;
    [key: string]: any;
  };
  metrics?: {
    [key: string]: any;
  };
}

export interface BackendStrategyStatusResponse {
  success: boolean;
  strategies: BackendStrategyState[];
  connection: {
    connected: boolean;
    environment: string;
  };
}

export interface BackendStrategyStartResponse {
  success: boolean;
  strategyId: string;
  message: string;
}

export interface BackendStrategyStopResponse {
  success: boolean;
  message: string;
}

class BackendStrategyClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getBackendUrl();
  }

  /**
   * Get JWT token from localStorage
   * FASE 4: Per-user authentication
   */
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('tradebaas:auth-token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  /**
   * Start a strategy on the backend
   * FASE 4: Updated to use /api/user/strategy/start (per-user endpoint)
   */
  async startStrategy(request: BackendStrategyStartRequest): Promise<BackendStrategyStartResponse> {
    try {
      console.log('[BackendStrategyClient] Starting strategy on backend (per-user):', request);
      
      // FASE 4: Use per-user endpoint with JWT authentication
      const response = await fetch(`${this.baseUrl}/api/user/strategy/start`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          strategyName: request.strategyName,
          instrument: request.instrument,
          config: request.config,
          broker: 'deribit', // TODO: Make configurable from request
          environment: request.environment,
        }),
      });

      const data = await response.json();
      console.log('[BackendStrategyClient] Start response:', data);
      
      return {
        success: data.success || false,
        strategyId: data.strategyId || '',
        message: data.message || '',
      };
    } catch (error) {
      console.error('[BackendStrategyClient] Failed to start strategy:', error);
      return {
        success: false,
        strategyId: '',
        message: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Stop a strategy on the backend
   * FASE 4: Updated to use /api/user/strategy/stop (per-user endpoint)
   */
  async stopStrategy(request: BackendStrategyStopRequest): Promise<BackendStrategyStopResponse> {
    try {
      console.log('[BackendStrategyClient] Stopping strategy on backend (per-user):', request);
      
      // Extract strategyName and instrument from strategyId
      // Format: userId:strategyName:instrument:broker:environment
      const parts = request.strategyId.split(':');
      const strategyName = parts.length >= 2 ? parts[1] : parts[0];
      const instrument = parts.length >= 3 ? parts[2] : 'BTC-PERPETUAL'; // fallback
      const environment = parts.length >= 5 ? parts[4] as 'live' | 'testnet' : 'testnet';
      
      // FASE 4: Use per-user endpoint with JWT authentication
      const response = await fetch(`${this.baseUrl}/api/user/strategy/stop`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          strategyName,
          instrument,
          broker: 'deribit', // TODO: Make configurable
          environment,
        }),
      });

      const data = await response.json();
      console.log('[BackendStrategyClient] Stop response:', data);
      
      return {
        success: data.success || false,
        message: data.message || '',
      };
    } catch (error) {
      console.error('[BackendStrategyClient] Failed to stop strategy:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Get strategy status from backend
   * FASE 4: Updated to use /api/user/strategy/status (per-user endpoint)
   */
  async getStrategyStatus(strategyId?: string): Promise<BackendStrategyStatusResponse> {
    try {
      // FASE 4: Use per-user endpoint with JWT authentication
      const url = `${this.baseUrl}/api/user/strategy/status?broker=deribit&environment=testnet`;
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const text = await response.text();
      
      // Check if response is empty or invalid
      if (!text || text.trim() === '') {
        throw new Error('Empty response from backend');
      }
      
      const data = JSON.parse(text);
      
      // FASE 4: Convert per-user response format to expected format
      return {
        success: data.success || false,
        strategies: data.strategies || [],
        connection: {
          connected: data.strategies?.length > 0 || false,
          environment: 'testnet',
        },
      };
    } catch (error) {
      // Only log if it's not a timeout or network issue (those are expected occasionally)
      if (error instanceof Error && !error.message.includes('aborted') && !error.message.includes('Empty')) {
        console.error('[BackendStrategyClient] Failed to get status:', error);
      }
      
      return {
        success: false,
        strategies: [],
        connection: {
          connected: false,
          environment: 'testnet',
        },
      };
    }
  }

  /**
   * Activate kill switch on backend
   */
  async killSwitch(): Promise<BackendStrategyStopResponse> {
    try {
      console.log('[BackendStrategyClient] Activating kill switch on backend');
      
      const response = await fetch(`${this.baseUrl}/api/killswitch`, {
        method: 'POST',
      });

      const data = await response.json();
      console.log('[BackendStrategyClient] Kill switch response:', data);
      
      return data;
    } catch (error) {
      console.error('[BackendStrategyClient] Failed to activate kill switch:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Network error',
      };
    }
  }
}

export const backendStrategyClient = new BackendStrategyClient();

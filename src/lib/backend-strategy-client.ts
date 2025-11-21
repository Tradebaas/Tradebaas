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
   * Start a strategy on the backend
   */
  async startStrategy(request: BackendStrategyStartRequest): Promise<BackendStrategyStartResponse> {
    try {
      console.log('[BackendStrategyClient] Starting strategy on backend:', request);
      
      const response = await fetch(`${this.baseUrl}/api/strategy/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();
      console.log('[BackendStrategyClient] Start response:', data);
      
      return data;
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
   */
  async stopStrategy(request: BackendStrategyStopRequest): Promise<BackendStrategyStopResponse> {
    try {
      console.log('[BackendStrategyClient] Stopping strategy on backend:', request);
      
      const response = await fetch(`${this.baseUrl}/api/strategy/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();
      console.log('[BackendStrategyClient] Stop response:', data);
      
      return data;
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
   */
  async getStrategyStatus(strategyId?: string): Promise<BackendStrategyStatusResponse> {
    try {
      const url = strategyId 
        ? `${this.baseUrl}/api/strategy/status?strategyId=${strategyId}`
        : `${this.baseUrl}/api/strategy/status`;
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
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
      return data;
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

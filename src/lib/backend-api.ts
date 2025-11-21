/**
 * Backend API Client
 * Single source of truth for all backend communication
 */

import { getBackendUrl } from './backend-url';

const BACKEND_URL = getBackendUrl();

export type ConnectionState = 'Stopped' | 'Connecting' | 'Active' | 'Error' | 'Disconnected';
export type DeribitEnvironment = 'live' | 'testnet';

export interface BackendConnectionStatus {
  connected: boolean;
  environment: DeribitEnvironment;
  broker: string;
  manuallyDisconnected?: boolean; // Track if disconnection was manual
}

export interface BackendStrategyStatus {
  isRunning: boolean;
  strategyName: string | null;
  position: any | null;
  connection: BackendConnectionStatus;
}

export interface DeribitCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface BackendStrategy {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
}

class BackendAPI {
  private baseUrl: string;

  constructor(baseUrl: string = BACKEND_URL) {
    this.baseUrl = baseUrl;
  }

  // ============================================================================
  // CONNECTION & CREDENTIALS
  // ============================================================================

  async getStatus(): Promise<BackendStrategyStatus> {
    // Use V2 API which returns proper structure
    const response = await fetch(`${this.baseUrl}/api/strategy/status/v2`);
    if (!response.ok) throw new Error('Failed to fetch status');
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error('Failed to fetch strategy status');
    }
    
    // Map V2 response to BackendStrategyStatus interface
    const connectionResponse = await fetch(`${this.baseUrl}/api/connection/status`);
    const connectionData = await connectionResponse.json();
    
    return {
      isRunning: data.strategy.isActive,
      strategyName: data.strategy.name,
      position: data.strategy.position,
      connection: {
        connected: connectionData.connected || false,
        environment: connectionData.environment || 'testnet',
        broker: 'deribit',
        manuallyDisconnected: connectionData.manuallyDisconnected || false,
      },
    };
  }

  async saveCredentials(service: string, credentials: DeribitCredentials): Promise<{ success: boolean }> {
    // Convert object to array format expected by backend
    const credentialsArray = [
      { key: 'api_key', value: credentials.apiKey },
      { key: 'api_secret', value: credentials.apiSecret },
    ];
    
    const response = await fetch(`${this.baseUrl}/api/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, credentials: credentialsArray }),
    });
    return await response.json();
  }

  async getCredentials(service: string): Promise<{ success: boolean; credentials?: DeribitCredentials }> {
    const response = await fetch(`${this.baseUrl}/api/credentials/${service}`);
    return await response.json();
  }

  async deleteCredentials(service: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/credentials/${service}`, {
      method: 'DELETE',
    });
    return await response.json();
  }

  async connect(credentials: DeribitCredentials, environment: DeribitEnvironment): Promise<{ success: boolean; error?: string }> {
    // 1. Save credentials first
    const saveResult = await this.saveCredentials('deribit', credentials);
    if (!saveResult.success) {
      return { success: false, error: 'Failed to save credentials' };
    }

    // 2. Call explicit connect endpoint
    const response = await fetch(`${this.baseUrl}/api/v2/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment }),
    });

    const result = await response.json();
    
    if (!response.ok || !result.success) {
      return { success: false, error: result.error || 'Connection failed' };
    }

    return { success: true };
  }

  async disconnect(): Promise<{ success: boolean }> {
    // Call explicit disconnect endpoint - NO body, NO content-type
    const response = await fetch(`${this.baseUrl}/api/v2/disconnect`, {
      method: 'POST',
    });

    const result = await response.json();
    
    if (!response.ok || !result.success) {
      return { success: false };
    }

    // Also delete credentials
    await this.deleteCredentials('deribit');
    
    return { success: true };
  }

  // ============================================================================
  // STRATEGIES
  // ============================================================================

  async listStrategies(): Promise<{ success: boolean; strategies: BackendStrategy[] }> {
    const response = await fetch(`${this.baseUrl}/api/v2/strategies`);
    return await response.json();
  }

  async getStrategy(id: string): Promise<{ success: boolean; strategy: BackendStrategy }> {
    const response = await fetch(`${this.baseUrl}/api/v2/strategies/${id}`);
    return await response.json();
  }

  async startStrategy(params: {
    strategyId: string;
    instrument: string;
    riskSettings: { mode: string; value: number };
    maxPositions?: number;
  }): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${this.baseUrl}/api/strategy/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await response.json();
  }

  async stopStrategy(): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${this.baseUrl}/api/strategy/stop`, {
      method: 'POST',
    });
    return await response.json();
  }

  async getStrategyAnalysis(strategyId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/strategy/analysis/${strategyId}`);
    const data = await response.json();
    return data.success ? data.analysis : null;
  }

  async getStrategyMetrics(strategyId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/strategy/metrics/${strategyId}`);
    const data = await response.json();
    return data.success ? data.metrics : null;
  }

  // ============================================================================
  // KILL SWITCH
  // ============================================================================

  async killSwitch(): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/killswitch`, {
      method: 'POST',
    });
    return await response.json();
  }

  // ============================================================================
  // BALANCE
  // ============================================================================

  async getBalance(): Promise<{ balance: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/balance`);
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        console.error('[BackendAPI] Failed to fetch balance:', result.error);
        return { balance: 0 };
      }

      // Return available balance in BTC
      return { balance: result.balance?.available || 0 };
    } catch (error) {
      console.error('[BackendAPI] Balance fetch error:', error);
      return { balance: 0 };
    }
  }

  // ============================================================================
  // POSITIONS
  // ============================================================================

  async getPositions(): Promise<{ success: boolean; positions: any[]; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/positions`);
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        return { success: false, positions: [], error: result.error || 'Failed to fetch positions' };
      }

      return { success: true, positions: result.positions };
    } catch (error) {
      return { success: false, positions: [], error: 'Network error' };
    }
  }

  async closePosition(instrument: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/positions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrument }),
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        return { success: false, error: result.error || 'Failed to close position' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getTicker(instrument: string): Promise<{ success: boolean; ticker?: any; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/ticker/${encodeURIComponent(instrument)}`);
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        return { success: false, error: result.error || 'Failed to get ticker' };
      }

      return { success: true, ticker: result.ticker };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getOpenOrders(instrument: string): Promise<{ success: boolean; orders?: any[]; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/orders/${encodeURIComponent(instrument)}`);
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        return { success: false, error: result.error || 'Failed to get orders' };
      }

      return { success: true, orders: result.orders };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // ============================================================================
  // HEALTH
  // ============================================================================

  async health(): Promise<{ status: string; uptime: number }> {
    const response = await fetch(`${this.baseUrl}/health`);
    return await response.json();
  }
}

export const backendAPI = new BackendAPI();

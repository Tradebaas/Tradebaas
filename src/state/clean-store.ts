/**
 * New Clean Store - Backend API Only
 * NO client-side Deribit, NO crypto in browser
 * ONLY polls backend API
 */

import { create } from 'zustand';
import { backendClient } from '@/lib/backend-client';

// ============================================================================
// Types
// ============================================================================

interface Strategy {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
}

interface RiskSettings {
  mode: 'percent' | 'fixed';
  value: number;
}

interface CleanStoreState {
  // Connection
  connected: boolean;
  environment: 'live' | 'testnet';
  broker: string;
  
  // Strategies
  strategies: Strategy[];
  selectedStrategyId: string | null;
  strategyStatus: 'stopped' | 'analyzing' | 'active' | 'in-position' | 'error';
  strategyError: string | null;
  
  // Risk
  riskSettings: RiskSettings;
  maxPositions: number;
  
  // Loading states
  loading: boolean;
  error: string | null;
  
  // Actions
  pollBackendStatus: () => Promise<void>;
  loadStrategies: () => Promise<void>;
  selectStrategy: (id: string) => void;
  startStrategy: () => Promise<boolean>;
  stopStrategy: () => Promise<boolean>;
  updateRiskSettings: (settings: RiskSettings) => void;
  setMaxPositions: (max: number) => void;
  disconnect: () => Promise<void>;
}

// ============================================================================
// Store
// ============================================================================

export const useCleanStore = create<CleanStoreState>((set, get) => ({
  // Initial State
  connected: false,
  environment: 'testnet',
  broker: 'deribit',
  strategies: [],
  selectedStrategyId: null,
  strategyStatus: 'stopped',
  strategyError: null,
  riskSettings: { mode: 'percent', value: 5 },
  maxPositions: 1,
  loading: false,
  error: null,

  // Poll backend for connection status + strategy status
  pollBackendStatus: async () => {
    try {
      const status = await backendClient.getStrategyStatus();
      
      set({
        connected: status.connection?.connected || false,
        environment: status.connection?.environment || 'testnet',
        strategyStatus: status.status || 'stopped',
        strategyError: status.status === 'error' ? 'Strategy error occurred' : null,
      });
    } catch (error: any) {
      console.error('[CleanStore] Failed to poll status:', error);
      set({ error: error.message });
    }
  },

  // Load strategies from backend
  loadStrategies: async () => {
    set({ loading: true, error: null });
    
    try {
      const strategies = await backendClient.getStrategies();
      set({ strategies, loading: false });
    } catch (error: any) {
      console.error('[CleanStore] Failed to load strategies:', error);
      set({ error: error.message, loading: false });
    }
  },

  // Select a strategy
  selectStrategy: (id: string) => {
    set({ selectedStrategyId: id });
    
    // Persist to KV
    if (window.spark?.kv) {
      window.spark.kv.set('selected-strategy-id', id);
    }
  },

  // Start selected strategy
  startStrategy: async () => {
    const { selectedStrategyId, riskSettings, maxPositions } = get();
    
    if (!selectedStrategyId) {
      set({ error: 'No strategy selected' });
      return false;
    }

    set({ loading: true, error: null });

    try {
      const result = await backendClient.startStrategy(selectedStrategyId, {
        riskMode: riskSettings.mode,
        riskValue: riskSettings.value,
        maxPositions,
      });

      if (result.success) {
        set({ strategyStatus: 'analyzing', loading: false });
        return true;
      } else {
        set({ error: result.error || 'Failed to start strategy', loading: false });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return false;
    }
  },

  // Stop strategy
  stopStrategy: async () => {
    set({ loading: true, error: null });

    try {
      const result = await backendClient.stopStrategy('');
      
      if (result.success) {
        set({ strategyStatus: 'stopped', loading: false });
        return true;
      } else {
        set({ error: result.error || 'Failed to stop strategy', loading: false });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return false;
    }
  },

  // Update risk settings
  updateRiskSettings: (settings: RiskSettings) => {
    set({ riskSettings: settings });
    
    // Persist to KV
    if (window.spark?.kv) {
      window.spark.kv.set('risk-settings', settings);
    }
  },

  // Set max positions
  setMaxPositions: (max: number) => {
    set({ maxPositions: max });
    
    // Persist to KV
    if (window.spark?.kv) {
      window.spark.kv.set('max-positions', max);
    }
  },

  // Disconnect
  disconnect: async () => {
    await backendClient.deleteCredentials('deribit');
    set({ connected: false, strategyStatus: 'stopped' });
  },
}));

// Auto-poll backend status every 3 seconds
if (typeof window !== 'undefined') {
  setInterval(() => {
    useCleanStore.getState().pollBackendStatus();
  }, 3000);
}

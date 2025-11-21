/**
 * Backend State Manager
 * Persists strategy state, connection state, and disclaimer acceptance
 * Enables auto-resume after backend restart
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AnalysisState, PositionMetrics } from './types/analysis';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StrategyState {
  id: string;
  name: string;
  status: 'active' | 'stopped' | 'error';
  startedAt: number;
  config: Record<string, any>;
  
  // Analysis state (updated during monitoring)
  analysisState?: AnalysisState;
  
  // Position (when trade is active)
  position?: {
    instrument: string;
    direction: 'long' | 'short';
    entryPrice: number;
    amount: number;
    stopLoss: number;
    takeProfit: number;
    orderId: string;
  };
  
  // Position metrics (updated in real-time)
  metrics?: PositionMetrics;
}

export interface ConnectionState {
  broker: string;
  environment: 'live' | 'testnet';
  connected: boolean;
  connectedAt?: number;
  manuallyDisconnected?: boolean; // Track if user manually disconnected
}

export interface BackendState {
  disclaimerAccepted: boolean;
  connection?: ConnectionState;
  activeStrategies: StrategyState[];
  lastUpdated: number;
}

export class StateManager {
  private statePath: string;
  private state: BackendState;

  constructor(statePath?: string) {
    this.statePath = statePath || path.join(__dirname, '../../state/backend-state.json');
    this.state = {
      disclaimerAccepted: false,
      activeStrategies: [],
      lastUpdated: Date.now(),
    };
  }

  /**
   * Initialize state manager - loads from disk if exists
   */
  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.statePath, 'utf-8');
      this.state = JSON.parse(data);
      
      // CRITICAL: Remove all stopped strategies on restart
      // Only keep active strategies for auto-resume
      const activeBefore = this.state.activeStrategies.length;
      this.state.activeStrategies = this.state.activeStrategies.filter(s => s.status === 'active');
      const activeAfter = this.state.activeStrategies.length;
      
      console.log('[StateManager] Loaded state from disk:', {
        strategiesTotal: activeBefore,
        strategiesActive: activeAfter,
        strategiesRemoved: activeBefore - activeAfter,
        connected: this.state.connection?.connected,
        disclaimerAccepted: this.state.disclaimerAccepted,
      });
      
      if (activeAfter > 0) {
        console.error('[StateManager] 🔄 AUTO-RESUME: Found', activeAfter, 'active strategies:', 
          this.state.activeStrategies.map(s => `${s.name} (${s.id})`).join(', ')
        );
      } else {
        console.error('[StateManager] ℹ️  AUTO-RESUME: No active strategies to resume');
      }
      
      // Save cleaned state immediately
      await this.save();
    } catch (error) {
      console.log('[StateManager] No existing state found, starting fresh');
      await this.save();
    }
  }
  
  /**
   * Get strategies that should be auto-resumed after restart
   * Returns only strategies with status='active'
   */
  getStrategiesToResume(): StrategyState[] {
    return this.state.activeStrategies.filter(s => s.status === 'active');
  }

  /**
   * Save state to disk
   */
  async save(): Promise<void> {
    this.state.lastUpdated = Date.now();
    try {
      await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (error) {
      console.error('[StateManager] Failed to save state:', error);
    }
  }

  /**
   * Accept disclaimer
   */
  async acceptDisclaimer(): Promise<void> {
    this.state.disclaimerAccepted = true;
    await this.save();
    console.log('[StateManager] Disclaimer accepted');
  }

  /**
   * Check if disclaimer is accepted
   */
  isDisclaimerAccepted(): boolean {
    return this.state.disclaimerAccepted;
  }

  /**
   * Set connection state
   */
  async setConnection(connection: ConnectionState): Promise<void> {
    console.log('[StateManager] setConnection called with:', JSON.stringify(connection, null, 2));
    
    // Preserve all fields explicitly, including optional ones
    this.state.connection = {
      broker: connection.broker,
      environment: connection.environment,
      connected: connection.connected,
      connectedAt: connection.connectedAt,
      manuallyDisconnected: connection.manuallyDisconnected ?? false, // Default to false if not provided
    };
    
    await this.save();
    console.log('[StateManager] Connection state updated and saved. Final state:', JSON.stringify(this.state.connection, null, 2));
  }

  /**
   * Get connection state
   */
  getConnection(): ConnectionState | undefined {
    return this.state.connection;
  }

  /**
   * Add or update strategy
   */
  async addStrategy(strategy: StrategyState): Promise<void> {
    const index = this.state.activeStrategies.findIndex(s => s.id === strategy.id);
    if (index >= 0) {
      this.state.activeStrategies[index] = strategy;
    } else {
      this.state.activeStrategies.push(strategy);
    }
    await this.save();
    console.log('[StateManager] Strategy added/updated:', strategy.id);
  }

  /**
   * Update existing strategy
   */
  async updateStrategy(strategy: StrategyState): Promise<void> {
    await this.addStrategy(strategy);  // addStrategy already handles update
  }

  /**
   * Remove strategy
   */
  async removeStrategy(strategyId: string): Promise<void> {
    this.state.activeStrategies = this.state.activeStrategies.filter(s => s.id !== strategyId);
    await this.save();
    console.log('[StateManager] Strategy removed:', strategyId);
  }

  /**
   * Get all active strategies
   */
  getActiveStrategies(): StrategyState[] {
    return this.state.activeStrategies.filter(s => s.status === 'active');
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): StrategyState[] {
    return this.state.activeStrategies;
  }

  /**
   * Update strategy analysis state
   */
  async updateStrategyAnalysis(strategyId: string, analysisState: AnalysisState): Promise<void> {
    const strategy = this.state.activeStrategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.analysisState = analysisState;
      await this.save();
    }
  }

  /**
   * Update strategy metrics
   */
  async updateStrategyMetrics(strategyId: string, metrics: PositionMetrics): Promise<void> {
    const strategy = this.state.activeStrategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.metrics = metrics;
      await this.save();
    }
  }

  /**
   * Get strategy by ID
   */
  getStrategy(strategyId: string): StrategyState | undefined {
    return this.state.activeStrategies.find(s => s.id === strategyId);
  }

  /**
   * Update strategy position
   */
  async updateStrategyPosition(strategyId: string, position: StrategyState['position']): Promise<void> {
    const strategy = this.state.activeStrategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.position = position;
      await this.save();
      console.log('[StateManager] Strategy position updated:', strategyId);
    }
  }

  /**
   * Update strategy status
   */
  async updateStrategyStatus(strategyId: string, status: StrategyState['status']): Promise<void> {
    const strategy = this.state.activeStrategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.status = status;
      await this.save();
      console.log('[StateManager] Strategy status updated:', strategyId, status);
    }
  }

  /**
   * Clear all strategies (e.g., on disconnect)
   */
  async clearStrategies(): Promise<void> {
    this.state.activeStrategies = [];
    await this.save();
    console.log('[StateManager] All strategies cleared');
  }

  /**
   * Clean up stopped strategies (remove from state)
   * Called periodically and after manual stops
   * CRITICAL: Must check BOTH analysisState AND actual broker positions
   */
  async cleanupStoppedStrategies(): Promise<void> {
    const before = this.state.activeStrategies.length;
    
    // Remove all strategies with status === 'stopped' that have NO open position
    this.state.activeStrategies = this.state.activeStrategies.filter(s => {
      // ALWAYS keep active strategies
      if (s.status === 'active') {
        return true;
      }
      
      // Keep stopped strategies with open positions in analysisState
      if (s.status === 'stopped' && s.analysisState?.status === 'position_open') {
        console.log(`[StateManager] Keeping stopped strategy ${s.id} - analysisState shows position_open`);
        return true;
      }
      
      // Keep stopped strategies with position metadata
      if (s.status === 'stopped' && s.position) {
        console.log(`[StateManager] Keeping stopped strategy ${s.id} - has position metadata`);
        return true;
      }
      
      // Keep stopped strategies with metrics indicating open position
      if (s.status === 'stopped' && s.metrics) {
        console.log(`[StateManager] Keeping stopped strategy ${s.id} - has metrics (possible open position)`);
        return true;
      }
      
      // Remove stopped strategies without any position indicators
      console.log(`[StateManager] Removing stopped strategy ${s.id} - no position indicators`);
      return false;
    });
    
    const after = this.state.activeStrategies.length;
    
    if (before !== after) {
      console.log(`[StateManager] Cleanup: removed ${before - after} stopped strategies (${before} → ${after})`);
      await this.save();
    }
  }

  /**
   * Get full state (for debugging)
   */
  getState(): BackendState {
    return this.state;
  }
}

// Singleton instance
export const stateManager = new StateManager();

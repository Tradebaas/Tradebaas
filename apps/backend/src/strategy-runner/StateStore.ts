import { BracketState, Position } from './types';

// Conditional Spark KV access - only available in Cloudflare Workers runtime
const getSpark = (): any => {
  if (typeof globalThis !== 'undefined' && 'spark' in globalThis) {
    return (globalThis as any).spark;
  }
  return null;
};

export class StateStore {
  private userId: string;
  private workerId: string;
  private state: BracketState;
  private kv: any | null;  // Spark KV instance (any to avoid runtime dependency)
  
  constructor(userId: string, workerId: string) {
    this.userId = userId;
    this.workerId = workerId;
    const sparkInstance = getSpark();
    this.kv = sparkInstance ? sparkInstance.kv : null;
    this.state = this.getDefaultState();
    
    if (!this.kv) {
      console.warn('[StateStore] Spark KV not available - state persistence disabled');
    }
  }
  
  async init(): Promise<void> {
    this.state = await this.loadState();
  }
  
  private async loadState(): Promise<BracketState> {
    if (!this.kv) {
      return this.getDefaultState();
    }
    
    try {
      const key = this.getStorageKey();
      const stored = await this.kv.get(key);  // Remove type param for any
      if (stored) {
        console.log(`[StateStore] Loaded persisted state for worker ${this.workerId}`);
        return stored;
      }
    } catch (error) {
      console.error('[StateStore] Failed to load state:', error);
    }
    
    return this.getDefaultState();
  }
  
  private getDefaultState(): BracketState {
    return {
      position: null,
      lastExecutionTime: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnL: 0,
    };
  }
  
  private getStorageKey(): string {
    return `runner_state_${this.userId}_${this.workerId}`;
  }
  
  getState(): BracketState {
    return { ...this.state };
  }
  
  async setState(state: Partial<BracketState>): Promise<void> {
    this.state = { ...this.state, ...state };
    await this.saveState();
  }
  
  private async saveState(): Promise<void> {
    if (!this.kv) {
      return;  // Skip persistence if KV not available
    }
    
    try {
      const key = this.getStorageKey();
      await this.kv.set(key, this.state);
    } catch (error) {
      console.error('[StateStore] Failed to save state:', error);
    }
  }
  
  async setPosition(position: Position | null): Promise<void> {
    await this.setState({ position });
  }
  
  async reset(): Promise<void> {
    this.state = this.getDefaultState();
    await this.saveState();
  }
  
  async clear(): Promise<void> {
    if (!this.kv) {
      this.state = this.getDefaultState();
      return;
    }
    
    try {
      const key = this.getStorageKey();
      await this.kv.delete(key);
      this.state = this.getDefaultState();
    } catch (error) {
      console.error('[StateStore] Failed to clear state:', error);
    }
  }
}

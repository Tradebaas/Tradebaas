/**
 * StrategyRegistry.ts
 * 
 * Purpose: Central registry for all trading strategies
 * Features: Register, retrieve, list strategies with hot-reload support
 * 
 * Part of: Iteration 4 - Risk Engine + Strategy Registry
 */

import { IStrategy, StrategyNotFoundError } from './IStrategy';

// ============================================================================
// Strategy Registry
// ============================================================================

export class StrategyRegistry {
  private static instance: StrategyRegistry;
  private strategies: Map<string, IStrategy> = new Map();

  /**
   * Singleton pattern - only one registry per application
   */
  private constructor() {}

  public static getInstance(): StrategyRegistry {
    if (!StrategyRegistry.instance) {
      StrategyRegistry.instance = new StrategyRegistry();
    }
    return StrategyRegistry.instance;
  }

  /**
   * Register a strategy
   * 
   * @param strategy - Strategy instance implementing IStrategy
   * @throws Error if strategy with same name already exists
   */
  public register(strategy: IStrategy): void {
    const name = strategy.metadata.name;
    
    if (this.strategies.has(name)) {
      console.warn(`[StrategyRegistry] Overwriting existing strategy: ${name}`);
    }

    this.strategies.set(name, strategy);
    console.log(`[StrategyRegistry] Registered strategy: ${name} v${strategy.metadata.version}`);
  }

  /**
   * Unregister a strategy
   * 
   * @param strategyName - Name of strategy to unregister
   * @returns true if strategy was unregistered, false if not found
   */
  public async unregister(strategyName: string): Promise<boolean> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      return false;
    }

    // Cleanup strategy resources
    await strategy.cleanup();
    
    this.strategies.delete(strategyName);
    console.log(`[StrategyRegistry] Unregistered strategy: ${strategyName}`);
    return true;
  }

  /**
   * Get a strategy by name
   * 
   * @param strategyName - Name of strategy to retrieve
   * @returns Strategy instance
   * @throws StrategyNotFoundError if strategy not found
   */
  public get(strategyName: string): IStrategy {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new StrategyNotFoundError(strategyName);
    }
    return strategy;
  }

  /**
   * Check if strategy exists
   * 
   * @param strategyName - Name of strategy to check
   * @returns true if strategy exists
   */
  public has(strategyName: string): boolean {
    return this.strategies.has(strategyName);
  }

  /**
   * List all registered strategies
   * 
   * @returns Array of strategy names
   */
  public list(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get all strategies with metadata
   * 
   * @returns Array of strategies with metadata
   */
  public listWithMetadata(): Array<{ name: string; metadata: any }> {
    return Array.from(this.strategies.entries()).map(([name, strategy]) => ({
      name,
      metadata: strategy.metadata,
    }));
  }

  /**
   * Clear all strategies (useful for testing)
   * 
   * @returns Number of strategies cleared
   */
  public async clear(): Promise<number> {
    const count = this.strategies.size;
    
    // Cleanup all strategies
    for (const [name, strategy] of this.strategies.entries()) {
      await strategy.cleanup();
      console.log(`[StrategyRegistry] Cleared strategy: ${name}`);
    }
    
    this.strategies.clear();
    console.log(`[StrategyRegistry] Cleared ${count} strategies`);
    return count;
  }

  /**
   * Reload a strategy (useful for hot-reload during development)
   * 
   * @param strategyName - Name of strategy to reload
   * @param newStrategy - New strategy instance
   */
  public async reload(strategyName: string, newStrategy: IStrategy): Promise<void> {
    // Unregister old strategy
    await this.unregister(strategyName);
    
    // Register new strategy
    this.register(newStrategy);
    
    console.log(`[StrategyRegistry] Reloaded strategy: ${strategyName}`);
  }

  /**
   * Search strategies by tag
   * 
   * @param tag - Tag to search for (e.g., "momentum", "trend-following")
   * @returns Array of strategy names with matching tag
   */
  public searchByTag(tag: string): string[] {
    const results: string[] = [];
    
    for (const [name, strategy] of this.strategies.entries()) {
      if (strategy.metadata.tags.includes(tag)) {
        results.push(name);
      }
    }
    
    return results;
  }

  /**
   * Get statistics about registered strategies
   */
  public getStats(): {
    total: number;
    byTag: Record<string, number>;
    byAuthor: Record<string, number>;
  } {
    const stats = {
      total: this.strategies.size,
      byTag: {} as Record<string, number>,
      byAuthor: {} as Record<string, number>,
    };

    for (const strategy of this.strategies.values()) {
      // Count by tag
      for (const tag of strategy.metadata.tags) {
        stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
      }

      // Count by author
      const author = strategy.metadata.author;
      stats.byAuthor[author] = (stats.byAuthor[author] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance
export const strategyRegistry = StrategyRegistry.getInstance();

/**
 * bootstrap.ts
 * 
 * Purpose: Auto-register all strategies on backend startup
 * Called from: server.ts (main entry point)
 * 
 * Part of: Iteration 9 - Strategy Registry & Selection
 */

import { strategyRegistry } from './StrategyRegistry.js';
import { SimpleMovingAverageCrossStrategy } from './SimpleMovingAverageCrossStrategy.js';
import { log } from '../logger.js';

/**
 * Register all available strategies
 * Called once on backend startup
 */
export async function bootstrapStrategies(): Promise<void> {
  log.info('[StrategyBootstrap] Starting strategy registration...');

  try {
    // Register SimpleMovingAverageCrossStrategy
    const smaStrategy = new SimpleMovingAverageCrossStrategy();
    strategyRegistry.register(smaStrategy);
    log.info(`[StrategyBootstrap] Registered: ${smaStrategy.metadata.name} v${smaStrategy.metadata.version}`);

    // TODO: Register additional strategies here as they're created
    // Example:
    // const razorStrategy = new RazorStrategy();
    // strategyRegistry.register(razorStrategy);
    // log.info(`[StrategyBootstrap] Registered: ${razorStrategy.metadata.name}`);

    // Get registry statistics
    const stats = strategyRegistry.getStats();
    log.info('[StrategyBootstrap] Strategy registration complete', {
      totalStrategies: stats.total,
      byTag: stats.byTag,
      byAuthor: stats.byAuthor,
    });

    // Log all registered strategies
    const strategies = strategyRegistry.listWithMetadata();
    log.info('[StrategyBootstrap] Registered strategies:', {
      strategies: strategies.map(s => ({
        name: s.metadata.name,
        version: s.metadata.version,
        tags: s.metadata.tags,
      })),
    });
  } catch (error) {
    log.error('[StrategyBootstrap] Failed to bootstrap strategies', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}

/**
 * Auto-discover strategies from the strategies folder
 * Future enhancement: dynamically load all .ts files in strategies/
 * 
 * For now, we manually register strategies in bootstrapStrategies()
 */
export async function discoverStrategies(): Promise<void> {
  // TODO: Implement auto-discovery using fs.readdir + dynamic imports
  // This would enable hot-reload and plugin-style architecture
  log.info('[StrategyBootstrap] Auto-discovery not yet implemented - using manual registration');
}

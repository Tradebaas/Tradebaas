/**
 * UserStrategyService
 * 
 * Multi-user wrapper around existing StrategyService
 * Provides per-user strategy isolation without breaking existing single-user logic
 * 
 * Architecture:
 * - Uses UserBrokerRegistry for per-user broker clients
 * - Uses UserStrategyRepository for persistent strategy state
 * - Delegates execution to existing strategy executors (RazorExecutor, ThorExecutor)
 * - Maintains backward compatibility with existing StrategyService
 */

import { userBrokerRegistry } from './user-broker-registry';
import { userStrategyRepository, type UserStrategy, type CreateUserStrategyParams } from './services/user-strategy-repository';
import { RazorExecutor, type RazorConfig } from './strategies/razor-executor';
import { ThorExecutor, type ThorConfig } from './strategies/thor-executor';
import type { DeribitEnvironment } from './deribit-client';
import type { AnalysisState, PositionMetrics } from './types/analysis';

export interface UserStartStrategyRequest {
  userId: string;
  strategyName: string;
  instrument: string;
  config: Record<string, any>;
  broker?: string; // default: 'deribit'
  environment: DeribitEnvironment;
}

export interface UserStopStrategyRequest {
  userId: string;
  strategyName: string;
  instrument: string;
  broker?: string; // default: 'deribit'
  environment: DeribitEnvironment;
}

export interface UserGetStrategyStatusRequest {
  userId: string;
  strategyName?: string;
  instrument?: string;
  broker?: string;
  environment?: DeribitEnvironment;
}

/**
 * Per-user strategy instance
 * Maps to a running strategy executor for a specific user
 */
interface UserStrategyInstance {
  userId: string;
  strategyName: string;
  instrument: string;
  broker: string;
  environment: DeribitEnvironment;
  executor: RazorExecutor | ThorExecutor;
  intervalId?: NodeJS.Timeout;
  startedAt: Date;
}

export class UserStrategyService {
  // Map: userId:strategyName:instrument:broker:environment -> UserStrategyInstance
  private runningStrategies = new Map<string, UserStrategyInstance>();

  constructor() {}

  /**
   * Initialize service - load and auto-resume strategies for all users
   * Called once during server startup
   * 
   * Auto-Resume Logic:
   * 1. Query database for ALL strategies with status='active' AND autoReconnect=true
   * 2. For each strategy:
   *    - Check if user has active broker connection
   *    - If connected: Resume strategy with stored config
   *    - If disconnected: Skip (log warning)
   * 3. Update database: lastAction='auto_resume', lastHeartbeat=NOW()
   * 4. Track failures: errorCount, errorMessage
   * 
   * Design: Agnostic (works for ANY user, ANY strategy, ANY broker, ANY environment)
   */
  async initialize(): Promise<void> {
    console.log('[UserStrategyService] 🔄 Initializing with auto-resume...');
    
    try {
      // Find ALL strategies across ALL users that need auto-resume
      // Query both testnet and live environments
      const testnetStrategies = await userStrategyRepository.findAllStrategiesToResume('deribit', 'testnet');
      const liveStrategies = await userStrategyRepository.findAllStrategiesToResume('deribit', 'live');
      
      const allStrategies = [...testnetStrategies, ...liveStrategies];
      
      if (allStrategies.length === 0) {
        console.log('[UserStrategyService] ℹ️  No strategies to auto-resume');
        return;
      }
      
      console.log(`[UserStrategyService] 📋 Found ${allStrategies.length} strategies to auto-resume`);
      console.log(`[UserStrategyService]    - Testnet: ${testnetStrategies.length}`);
      console.log(`[UserStrategyService]    - Live: ${liveStrategies.length}`);
      
      let resumedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      
      // Process each strategy
      for (const strategy of allStrategies) {
        const { userId, strategyName, instrument, broker, environment, config } = strategy;
        const strategyKey = this.getStrategyKey(userId, strategyName, instrument, broker, environment);
        
        try {
          // Check if user has active broker connection
          const client = userBrokerRegistry.getClient(userId, broker, environment);
          
          if (!client || !client.isConnected()) {
            console.log(`[UserStrategyService] ⚠️  Skipping ${strategyKey}: User not connected to broker`);
            skippedCount++;
            
            // Mark as paused (not stopped, can resume when user connects)
            await userStrategyRepository.updateStatus(userId, strategyName, instrument, {
              status: 'paused',
              lastAction: 'auto_resume_skipped',
            }, broker, environment);
            
            continue;
          }
          
          // Check if strategy is already running (shouldn't happen, but defensive)
          if (this.runningStrategies.has(strategyKey)) {
            console.log(`[UserStrategyService] ⚠️  Skipping ${strategyKey}: Already running`);
            skippedCount++;
            continue;
          }
          
          // Create strategy executor
          let executor: RazorExecutor | ThorExecutor;
          
          if (strategyName.toLowerCase() === 'razor') {
            executor = new RazorExecutor(client, strategyKey, strategyName, config as RazorConfig, userId);
          } else if (strategyName.toLowerCase() === 'thor') {
            executor = new ThorExecutor(client, strategyKey, strategyName, config as ThorConfig, userId);
          } else {
            console.log(`[UserStrategyService] ❌ Skipping ${strategyKey}: Unknown strategy type`);
            failedCount++;
            
            await userStrategyRepository.updateStatus(userId, strategyName, instrument, {
              status: 'error',
              lastAction: 'auto_resume_failed',
              errorMessage: 'Unknown strategy type',
              errorCount: 1,
            }, broker, environment);
            
            continue;
          }
          
          // Store running strategy instance
          const instance: UserStrategyInstance = {
            userId,
            strategyName,
            instrument,
            broker,
            environment,
            executor,
            startedAt: new Date(),
          };
          
          this.runningStrategies.set(strategyKey, instance);
          
          // Start strategy execution loop
          await this.runStrategyLoop(instance);
          
          // Update database: auto-resumed successfully
          await userStrategyRepository.updateStatus(userId, strategyName, instrument, {
            status: 'active',
            lastAction: 'auto_resume',
            connectedAt: new Date(),
            lastHeartbeat: new Date(),
            errorMessage: undefined, // Clear previous errors
            errorCount: 0,
          }, broker, environment);
          
          console.log(`[UserStrategyService] ✅ Auto-resumed: ${strategyKey}`);
          resumedCount++;
          
        } catch (error: any) {
          console.error(`[UserStrategyService] ❌ Failed to auto-resume ${strategyKey}:`, error.message);
          failedCount++;
          
          // Update database with error
          await userStrategyRepository.updateStatus(userId, strategyName, instrument, {
            status: 'error',
            lastAction: 'auto_resume_failed',
            errorMessage: error.message,
            errorCount: (strategy.errorCount || 0) + 1,
          }, broker, environment);
        }
      }
      
      console.log('[UserStrategyService] ✅ Auto-resume complete:');
      console.log(`[UserStrategyService]    - Resumed: ${resumedCount}`);
      console.log(`[UserStrategyService]    - Skipped: ${skippedCount} (user not connected)`);
      console.log(`[UserStrategyService]    - Failed: ${failedCount}`);
      
    } catch (error: any) {
      console.error('[UserStrategyService] ❌ Initialize failed:', error);
      // Don't throw - server should start even if auto-resume fails
    }
  }

  /**
   * Start a strategy for a specific user
   */
  async startStrategy(request: UserStartStrategyRequest): Promise<{ success: boolean; message: string }> {
    const {
      userId,
      strategyName,
      instrument,
      config,
      broker = 'deribit',
      environment,
    } = request;

    const strategyKey = this.getStrategyKey(userId, strategyName, instrument, broker, environment);

    try {
      // Check if strategy is already running
      if (this.runningStrategies.has(strategyKey)) {
        return {
          success: false,
          message: 'Strategy is already running',
        };
      }

      // Get user's broker client
      const client = userBrokerRegistry.getClient(userId, broker, environment);
      if (!client || !client.isConnected()) {
        return {
          success: false,
          message: 'User is not connected to broker. Please connect first.',
        };
      }

      // Validate strategy name
      const validStrategies = ['razor', 'thor'];
      if (!validStrategies.includes(strategyName.toLowerCase())) {
        return {
          success: false,
          message: `Invalid strategy name. Valid strategies: ${validStrategies.join(', ')}`,
        };
      }

      // Create strategy executor based on strategy name
      let executor: RazorExecutor | ThorExecutor;
      const executorStrategyId = strategyKey; // Use composite key as strategyId
      
      if (strategyName.toLowerCase() === 'razor') {
        executor = new RazorExecutor(client, executorStrategyId, strategyName, config as RazorConfig, userId); // FASE 3: Pass userId
      } else if (strategyName.toLowerCase() === 'thor') {
        executor = new ThorExecutor(client, executorStrategyId, strategyName, config as ThorConfig, userId); // FASE 3: Pass userId
      } else {
        return {
          success: false,
          message: 'Strategy not implemented yet',
        };
      }

      // Save strategy to database
      await userStrategyRepository.save({
        userId,
        strategyName,
        instrument,
        broker,
        environment,
        config,
        status: 'active',
        lastAction: 'manual_start',
        autoReconnect: true,
      });

      // Update connected timestamp
      await userStrategyRepository.updateStatus(userId, strategyName, instrument, {
        connectedAt: new Date(),
      }, broker, environment);

      // Store running strategy instance
      const instance: UserStrategyInstance = {
        userId,
        strategyName,
        instrument,
        broker,
        environment,
        executor,
        startedAt: new Date(),
      };

      this.runningStrategies.set(strategyKey, instance);

      // Start strategy execution loop
      await this.runStrategyLoop(instance);

      console.log(`[UserStrategyService] ✅ Strategy started: ${strategyKey}`);

      return {
        success: true,
        message: `Strategy ${strategyName} started successfully for ${instrument}`,
      };
    } catch (error: any) {
      console.error(`[UserStrategyService] ❌ Failed to start strategy: ${strategyKey}`, error);

      // Save error to database
      await userStrategyRepository.updateStatus(userId, strategyName, instrument, {
        status: 'error',
        errorMessage: error.message,
        errorCount: 1,
      }, broker, environment);

      return {
        success: false,
        message: error.message || 'Failed to start strategy',
      };
    }
  }

  /**
   * Stop a strategy for a specific user
   */
  async stopStrategy(request: UserStopStrategyRequest): Promise<{ success: boolean; message: string }> {
    const {
      userId,
      strategyName,
      instrument,
      broker = 'deribit',
      environment,
    } = request;

    const strategyKey = this.getStrategyKey(userId, strategyName, instrument, broker, environment);

    try {
      const instance = this.runningStrategies.get(strategyKey);
      
      if (!instance) {
        return {
          success: false,
          message: 'Strategy is not running',
        };
      }

      // Stop the execution loop
      if (instance.intervalId) {
        clearInterval(instance.intervalId);
      }

      // Remove from running strategies
      this.runningStrategies.delete(strategyKey);

      // Update database - mark as manually disconnected (autoReconnect = false)
      await userStrategyRepository.markDisconnected(
        userId,
        strategyName,
        instrument,
        true, // manualDisconnect = true
        broker,
        environment
      );

      console.log(`[UserStrategyService] ✅ Strategy stopped: ${strategyKey}`);

      return {
        success: true,
        message: `Strategy ${strategyName} stopped successfully`,
      };
    } catch (error: any) {
      console.error(`[UserStrategyService] ❌ Failed to stop strategy: ${strategyKey}`, error);

      return {
        success: false,
        message: error.message || 'Failed to stop strategy',
      };
    }
  }

  /**
   * Get strategy status for a user
   */
  async getStrategyStatus(request: UserGetStrategyStatusRequest): Promise<UserStrategy[]> {
    const { userId, strategyName, instrument, broker, environment } = request;

    // If specific strategy requested
    if (strategyName && instrument && broker && environment) {
      const strategy = await userStrategyRepository.findByUserAndStrategy(
        userId,
        strategyName,
        instrument,
        broker,
        environment
      );
      return strategy ? [strategy] : [];
    }

    // Otherwise, get all strategies for user
    return await userStrategyRepository.findByUser(userId, broker, environment);
  }

  /**
   * Get strategy analysis state
   */
  async getStrategyAnalysis(
    userId: string,
    strategyName: string,
    instrument: string,
    broker: string = 'deribit',
    environment: DeribitEnvironment = 'testnet'
  ): Promise<AnalysisState | null> {
    const strategyKey = this.getStrategyKey(userId, strategyName, instrument, broker, environment);
    const instance = this.runningStrategies.get(strategyKey);

    if (!instance) {
      return null;
    }

    // Get analysis state from executor
    // TODO: Executors need to expose getAnalysisState() method
    return null; // Placeholder
  }

  /**
   * Get strategy position metrics
   */
  async getStrategyMetrics(
    userId: string,
    strategyName: string,
    instrument: string,
    broker: string = 'deribit',
    environment: DeribitEnvironment = 'testnet'
  ): Promise<PositionMetrics | null> {
    const strategyKey = this.getStrategyKey(userId, strategyName, instrument, broker, environment);
    const instance = this.runningStrategies.get(strategyKey);

    if (!instance) {
      return null;
    }

    // Get metrics from executor
    // TODO: Executors need to expose getMetrics() method
    return null; // Placeholder
  }

  /**
   * Shutdown service - stop all running strategies
   */
  async shutdown(): Promise<void> {
    console.log('[UserStrategyService] Shutting down...');

    const strategies = Array.from(this.runningStrategies.entries());
    
    for (const [strategyKey, instance] of strategies) {
      console.log(`[UserStrategyService] Stopping strategy: ${strategyKey}`);
      
      // Stop execution loop
      if (instance.intervalId) {
        clearInterval(instance.intervalId);
      }

      // Mark as disconnected (auto_reconnect = true for auto-resume on restart)
      await userStrategyRepository.markDisconnected(
        instance.userId,
        instance.strategyName,
        instance.instrument,
        false, // manualDisconnect = false (allow auto-resume)
        instance.broker,
        instance.environment
      );
    }

    this.runningStrategies.clear();
    console.log('[UserStrategyService] Shutdown complete');
  }

  /**
   * PRIVATE METHODS
   */

  /**
   * Generate unique strategy key
   */
  private getStrategyKey(
    userId: string,
    strategyName: string,
    instrument: string,
    broker: string,
    environment: DeribitEnvironment
  ): string {
    return `${userId}:${strategyName}:${instrument}:${broker}:${environment}`;
  }

  /**
   * Run strategy execution loop
   */
  private async runStrategyLoop(instance: UserStrategyInstance): Promise<void> {
    const { userId, strategyName, instrument, broker, environment, executor } = instance;
    const strategyKey = this.getStrategyKey(userId, strategyName, instrument, broker, environment);

    console.log(`[UserStrategyService] Starting execution loop: ${strategyKey}`);

    // TODO: Implement actual execution loop
    // This will call executor.analyze() periodically and handle position management
    // For now, this is a placeholder

    // Update heartbeat every 30 seconds
    instance.intervalId = setInterval(async () => {
      try {
        await userStrategyRepository.updateHeartbeat(
          userId,
          strategyName,
          instrument,
          broker,
          environment
        );
      } catch (error) {
        console.error(`[UserStrategyService] Failed to update heartbeat: ${strategyKey}`, error);
      }
    }, 30000);
  }
}

// Export singleton instance
export const userStrategyService = new UserStrategyService();

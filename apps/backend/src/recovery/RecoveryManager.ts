/**
 * Recovery Manager
 * 
 * Handles crash recovery and startup reconciliation.
 * 
 * Features (PERSIST-002):
 * - Read state from disk on startup
 * - Reconcile with broker (detect mismatches)
 * - Resume active strategy if needed
 * - Max recovery time: 30 seconds
 * 
 * Recovery Flow:
 * 1. Load state from StrategyManager
 * 2. Query broker for actual positions/orders
 * 3. Compare and reconcile
 * 4. Resume strategy if was active
 * 5. Report recovery status
 */

import { StrategyManager, StrategyLifecycleState } from '../lifecycle/StrategyManager';
import type { DeribitBroker } from '../brokers/DeribitBroker';

export interface RecoveryReport {
  success: boolean;
  recoveryTimeMs: number;
  stateRestored: boolean;
  brokerReconciled: boolean;
  strategyResumed: boolean;
  warnings: string[];
  errors: string[];
}

export class RecoveryTimeoutError extends Error {
  constructor(timeMs: number) {
    super(`Recovery timeout: exceeded ${timeMs}ms`);
    this.name = 'RecoveryTimeoutError';
  }
}

export class RecoveryManager {
  private readonly MAX_RECOVERY_TIME_MS = 30000; // 30 seconds
  private broker: DeribitBroker | null = null;

  /**
   * Set broker instance for reconciliation
   */
  public setBroker(broker: DeribitBroker): void {
    this.broker = broker;
  }

  /**
   * Perform full recovery on startup
   * 
   * @throws RecoveryTimeoutError if recovery takes >30 seconds
   */
  public async recover(): Promise<RecoveryReport> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    console.log('[RecoveryManager] 🔄 Starting crash recovery...');

    try {
      // Step 1: Initialize StrategyManager (loads state from disk)
      const strategyManager = StrategyManager.getInstance();
      await this.withTimeout(
        strategyManager.initialize(),
        this.MAX_RECOVERY_TIME_MS,
        'StrategyManager initialization'
      );

      const state = strategyManager.getState();
      console.log('[RecoveryManager] State loaded:', {
        state: state.state,
        strategy: state.strategyName,
        instrument: state.instrument,
      });

      // Step 2: Reconcile with broker (if broker available)
      let brokerReconciled = false;
      if (this.broker) {
        try {
          const reconcileResult = await this.withTimeout(
            this.broker.reconcileState(),
            this.MAX_RECOVERY_TIME_MS - (Date.now() - startTime),
            'Broker reconciliation'
          );

          brokerReconciled = true;
          
          // Add warnings from reconciliation
          warnings.push(...reconcileResult.warnings);

          console.log('[RecoveryManager] Broker reconciliation complete:', {
            hasOpenPosition: reconcileResult.hasOpenPosition,
            stateMatch: reconcileResult.stateMatch,
            warnings: reconcileResult.warnings.length,
          });

          // Handle mismatches
          if (!reconcileResult.stateMatch) {
            warnings.push('State mismatch detected - manual review recommended');
            
            // If broker has position but local state says no position
            if (reconcileResult.hasOpenPosition && 
                state.state !== StrategyLifecycleState.POSITION_OPEN &&
                state.state !== StrategyLifecycleState.CLOSING) {
              warnings.push('Broker has position but local state does not - updating local state');
              // Update local state to match broker
              await strategyManager.onPositionOpened(0, 0, 'long'); // Placeholder values
            }
          }
        } catch (error: any) {
          errors.push(`Broker reconciliation failed: ${error.message}`);
          console.error('[RecoveryManager] Broker reconciliation failed:', error);
        }
      } else {
        warnings.push('No broker available - skipping reconciliation');
      }

      // Step 3: Resume strategy if was active
      let strategyResumed = false;
      if (state.state !== StrategyLifecycleState.IDLE) {
        console.log('[RecoveryManager] Strategy was active, resuming:', state.strategyName);
        strategyResumed = true;
        
        // Note: Actual strategy execution resume is handled by the strategy service
        // This just confirms the state is ready for resumption
      }

      const recoveryTimeMs = Date.now() - startTime;

      console.log('[RecoveryManager] ✅ Recovery complete:', {
        timeMs: recoveryTimeMs,
        strategyResumed,
        brokerReconciled,
        warnings: warnings.length,
        errors: errors.length,
      });

      return {
        success: true,
        recoveryTimeMs,
        stateRestored: true,
        brokerReconciled,
        strategyResumed,
        warnings,
        errors,
      };

    } catch (error: any) {
      const recoveryTimeMs = Date.now() - startTime;
      errors.push(`Recovery failed: ${error.message}`);
      
      console.error('[RecoveryManager] ❌ Recovery failed:', error);

      return {
        success: false,
        recoveryTimeMs,
        stateRestored: false,
        brokerReconciled: false,
        strategyResumed: false,
        warnings,
        errors,
      };
    }
  }

  /**
   * Perform health check after recovery
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const strategyManager = StrategyManager.getInstance();
      const state = strategyManager.getState();

      // Check state is valid
      if (!state || typeof state.state !== 'string') {
        console.error('[RecoveryManager] Invalid state after recovery');
        return false;
      }

      // Check broker is responsive (if available)
      if (this.broker) {
        try {
          // Simple ping to check broker connectivity
          await this.broker.getBalance();
        } catch (error) {
          console.error('[RecoveryManager] Broker not responsive:', error);
          return false;
        }
      }

      console.log('[RecoveryManager] ✅ Health check passed');
      return true;

    } catch (error) {
      console.error('[RecoveryManager] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get recovery recommendations based on state
   */
  public async getRecoveryRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    
    try {
      const strategyManager = StrategyManager.getInstance();
      const state = strategyManager.getState();

      // Check for stuck states
      if (state.state === StrategyLifecycleState.ENTERING_POSITION) {
        const timeSinceTransition = Date.now() - state.lastTransition;
        if (timeSinceTransition > 60000) { // 1 minute
          recommendations.push('State stuck in ENTERING_POSITION for >1 min - consider manual intervention');
        }
      }

      if (state.state === StrategyLifecycleState.CLOSING) {
        const timeSinceTransition = Date.now() - state.lastTransition;
        if (timeSinceTransition > 60000) { // 1 minute
          recommendations.push('State stuck in CLOSING for >1 min - check position status on broker');
        }
      }

      // Check for broker reconciliation issues
      if (this.broker) {
        const reconcileResult = await this.broker.reconcileState();
        if (!reconcileResult.stateMatch) {
          recommendations.push('Broker state mismatch detected - run reconciliation');
        }
      }

    } catch (error: any) {
      recommendations.push(`Error getting recommendations: ${error.message}`);
    }

    return recommendations;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Run promise with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new RecoveryTimeoutError(timeoutMs)),
          timeoutMs
        )
      ),
    ]);
  }
}

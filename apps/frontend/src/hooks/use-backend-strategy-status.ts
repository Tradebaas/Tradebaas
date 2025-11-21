import { useEffect, useState } from 'react';
import { backendStrategyClient, type BackendStrategyState } from '@/lib/backend-strategy-client';

export type DerivedBackendStrategyStatus = 
  | 'idle'           // No strategies running
  | 'analyzing'      // Strategy running, analyzing market
  | 'position_open'  // Strategy has open position
  | 'cooldown'       // Strategy in cooldown after position close
  | 'stopped'        // Strategy explicitly stopped
  | 'error';         // Strategy in error state

interface BackendStrategyStatus {
  isRunning: boolean;
  strategies: BackendStrategyState[];
  isConnected: boolean;
  environment: string;
  derivedStatus: DerivedBackendStrategyStatus;
  hasOpenPosition: boolean;
  // The primary strategy (either with open position or first active), used by analysis UI
  primaryStrategyId: string | null;
}

/**
 * Hook to poll backend strategy status and keep UI in sync
 * Polls every 3 seconds when enabled
 */
export function useBackendStrategyStatus(enabled: boolean = true): BackendStrategyStatus {
  const [status, setStatus] = useState<BackendStrategyStatus>({
    isRunning: false,
    strategies: [],
    isConnected: false,
    environment: 'testnet',
    derivedStatus: 'idle',
    hasOpenPosition: false,
  primaryStrategyId: null,
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    console.log('[useBackendStrategyStatus] Starting backend status polling...');

    const pollStatus = async () => {
      try {
        const response = await backendStrategyClient.getStrategyStatus();
        
        if (response.success) {
          // Get ALL strategies (active + stopped)
          const strategies = response.strategies;
          const activeStrategies = strategies.filter(s => s.status === 'active');
          
          // CRITICAL: Check for open positions in ANY strategy (active OR stopped)
          // A stopped strategy with open position should still show position_open status!
          let hasOpenPosition = false;
          let primaryStrategy: BackendStrategyState | undefined;
          
          // CRITICAL: Only trust analysisState.status - NOT metrics or position fields!
          // Metrics can be stale and persist after position close
          const strategyWithPosition = strategies.find(s => 
            s.analysisState?.status === 'position_open'
          );
          
          if (strategyWithPosition) {
            hasOpenPosition = true;
            primaryStrategy = strategyWithPosition;
            console.log('[useBackendStrategyStatus] ⚠️ Found strategy with open position:', {
              id: strategyWithPosition.id,
              status: strategyWithPosition.status,
              analysisState: strategyWithPosition.analysisState?.status,
            });
          } else {
            // No position - use first active strategy
            primaryStrategy = activeStrategies[0];
          }
          
          const analysisState = primaryStrategy?.analysisState;
          
          let derivedStatus: DerivedBackendStrategyStatus = 'idle';
          
          // CRITICAL: hasOpenPosition overrides everything
          if (hasOpenPosition) {
            derivedStatus = 'position_open';
          } else if (!primaryStrategy) {
            // No active strategies, no positions
            derivedStatus = 'idle';
          } else if (primaryStrategy.status === 'error') {
            derivedStatus = 'error';
          } else if (primaryStrategy.status === 'stopped') {
            derivedStatus = 'stopped';
          } else {
            // Strategy is active - check analysis state
            const analysisStatus = analysisState?.status;
            
            if (analysisStatus === 'position_open') {
              derivedStatus = 'position_open';
              hasOpenPosition = true;
            } else if (analysisStatus === 'cooldown') {
              derivedStatus = 'cooldown';
            } else if (analysisStatus === 'analyzing' || analysisStatus === 'initializing' || !analysisStatus) {
              derivedStatus = 'analyzing';
            } else {
              // Fallback for signal_detected, error, etc.
              derivedStatus = 'analyzing';
            }
          }
          
          setStatus({
            isRunning: activeStrategies.length > 0,
            strategies: strategies, // Keep all for debugging
            isConnected: response.connection.connected,
            environment: response.connection.environment,
            derivedStatus,
            hasOpenPosition,
            primaryStrategyId: primaryStrategy?.id ?? null,
          });
          
          if (activeStrategies.length > 0 || hasOpenPosition) {
            console.log('[useBackendStrategyStatus] Active:', activeStrategies.length, 'Status:', derivedStatus, 'Position:', hasOpenPosition);
          }
        }
      } catch (error) {
        console.error('[useBackendStrategyStatus] Failed to poll backend status:', error);
        // Keep last known state on error
      }
    };

    // Initial poll
    pollStatus();

    // Poll every 1 second for faster UI updates (especially important during position close/open)
    const intervalId = setInterval(pollStatus, 1000);

    return () => {
      console.log('[useBackendStrategyStatus] Stopping backend status polling');
      clearInterval(intervalId);
    };
  }, [enabled]);

  return status;
}

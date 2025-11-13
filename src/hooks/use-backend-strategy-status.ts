import { useEffect, useState } from 'react';
import { backendStrategyClient, type BackendStrategyState } from '@/lib/backend-strategy-client';

interface BackendStrategyStatus {
  isRunning: boolean;
  strategies: BackendStrategyState[];
  isConnected: boolean;
  environment: string;
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
          const activeStrategies = response.strategies.filter(s => s.status === 'active');
          
          setStatus({
            isRunning: activeStrategies.length > 0,
            strategies: response.strategies,
            isConnected: response.connection.connected,
            environment: response.connection.environment,
          });
          
          if (activeStrategies.length > 0) {
            console.log('[useBackendStrategyStatus] Active strategies on backend:', activeStrategies.length);
          }
        }
      } catch (error) {
        console.error('[useBackendStrategyStatus] Failed to poll backend status:', error);
        // Keep last known state on error
      }
    };

    // Initial poll
    pollStatus();

    // Poll every 3 seconds
    const intervalId = setInterval(pollStatus, 3000);

    return () => {
      console.log('[useBackendStrategyStatus] Stopping backend status polling');
      clearInterval(intervalId);
    };
  }, [enabled]);

  return status;
}

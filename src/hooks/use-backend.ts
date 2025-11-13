import { useState, useEffect, useCallback } from 'react';
import { backendClient } from '@/lib/backend-client';

interface UseBackendReturn {
  brokerName: string | null;
  entitlementTier: string;
  isLoading: boolean;
  error: string | null;
  refreshBrokerName: () => Promise<void>;
  refreshEntitlement: () => Promise<void>;
}

export function useBackend(): UseBackendReturn {
  const [brokerName, setBrokerName] = useState<string | null>(null);
  const [entitlementTier, setEntitlementTier] = useState<string>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshBrokerName = useCallback(async () => {
    try {
      const name = await backendClient.getBrokerName();
      setBrokerName(name);
    } catch (err) {
      console.error('Failed to refresh broker name:', err);
    }
  }, []);

  const refreshEntitlement = useCallback(async () => {
    try {
      const entitlement = await backendClient.getEntitlement();
      setEntitlementTier(entitlement.tier);
      setError(null);
    } catch (err) {
      console.error('Failed to refresh entitlement:', err);
      setEntitlementTier('free');
      setError(null);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      try {
        await Promise.race([
          (async () => {
            await refreshBrokerName();
            await new Promise(resolve => setTimeout(resolve, 100));
            await refreshEntitlement();
          })(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Backend timeout')), 3000)
          )
        ]);
      } catch (err) {
        console.warn('Backend initialization error (non-critical):', err);
        setError(null);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [refreshBrokerName, refreshEntitlement]);

  return {
    brokerName,
    entitlementTier,
    isLoading,
    error,
    refreshBrokerName,
    refreshEntitlement,
  };
}

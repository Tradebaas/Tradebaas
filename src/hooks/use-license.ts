import { useState, useEffect } from 'react';
import { licenseService, EntitlementStatus } from '@/lib/license-service';

export function useLicense() {
  const [entitlement, setEntitlement] = useState<EntitlementStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEntitlement = async () => {
      try {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 200));
        await licenseService.initialize();
        const status = await licenseService.getEntitlement();
        setEntitlement(status);
        setError(null);
      } catch (err) {
        console.warn('License entitlement load failed (non-critical):', err);
        setError(null);
        setEntitlement({
          tier: 'free',
          expiry: null,
          isActive: true,
          daysRemaining: null,
        });
      } finally {
        setLoading(false);
      }
    };

    loadEntitlement();
  }, []);

  const refreshEntitlement = async () => {
    try {
      const status = await licenseService.getEntitlement();
      setEntitlement(status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh entitlement');
    }
  };

  return {
    entitlement,
    loading,
    error,
    refreshEntitlement,
  };
}

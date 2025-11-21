import { getBackendUrl } from '@/lib/backend-url';
/**
 * Hook to fetch backend strategy position metrics
 */

import { useState, useEffect } from 'react';

export interface PositionMetrics {
  strategyId: string;
  instrument: string;
  direction: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  amount: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  entryOrderId: string;
  slOrderId?: string;
  tpOrderId?: string;
  enteredAt: number;
  duration: number;
  marketAnalysis?: {
    successProbability: number;
    riskLevel: 'low' | 'medium' | 'high';
    recommendation: string;
  };
}

export function useBackendMetrics(strategyId: string | null) {
  const [metrics, setMetrics] = useState<PositionMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!strategyId) {
      setMetrics(null);
      return;
    }

    const fetchMetrics = async () => {
      setLoading(true);
      setError(null);

      try {
        // Use backend on port 3000, not frontend origin
        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/strategy/metrics/${strategyId}`);
        const data = await response.json();

        if (data.success && data.metrics) {
          setMetrics(data.metrics);
        } else {
          // No metrics available (e.g., no position open)
          setMetrics(null);
          setError(null); // Don't treat this as an error
        }
      } catch (err) {
        console.error('[useBackendMetrics] Failed to fetch:', err);
        setError('Failed to fetch metrics');
        setMetrics(null);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchMetrics();

    // Poll every 2 seconds for real-time P&L updates
    const interval = setInterval(fetchMetrics, 2000);

    return () => clearInterval(interval);
  }, [strategyId]);

  return { metrics, loading, error };
}

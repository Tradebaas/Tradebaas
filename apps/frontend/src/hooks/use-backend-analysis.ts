import { getBackendUrl } from '@/lib/backend-url';
/**
 * Hook to fetch backend strategy analysis state
 */

import { useState, useEffect } from 'react';

export interface Checkpoint {
  id: string;
  label: string;
  status: 'met' | 'pending' | 'failed';
  value?: string;
  description?: string;
  timestamp: number;
}

export interface IndicatorState {
  emaFast: number | null;
  emaSlow: number | null;
  rsi: number | null;
  volume: number | null;
  volatility: number | null;
}

export interface SignalState {
  type: 'long' | 'short' | 'none';
  strength: number;
  confidence: number;
  reasons: string[];
}

export interface AnalysisState {
  strategyId: string;
  strategyName: string;
  status: 'analyzing' | 'signal_detected' | 'position_open' | 'stopped';
  instrument: string;
  currentPrice: number | null;
  lastUpdated: number;
  indicators: IndicatorState;
  signal: SignalState;
  checkpoints: Checkpoint[];
  dataPoints: number;
  requiredDataPoints: number;
  cooldownUntil: number | null;
  nextCheckAt: number | null;
}

export function useBackendAnalysis(strategyId: string | null) {
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  useEffect(() => {
    if (!strategyId) {
      setAnalysis(null);
      setConsecutiveErrors(0);
      return;
    }

    let isCancelled = false;

    const fetchAnalysis = async () => {
      // Silently skip if too many consecutive errors (reduce log spam)
      if (consecutiveErrors > 5) {
        return;
      }

      setLoading(true);

      try {
        // Use backend on port 3000, not frontend origin
        const backendUrl = getBackendUrl();
        
        // Get JWT token for authenticated requests
        const token = localStorage.getItem('tradebaas:auth-token');
        const headers: HeadersInit = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        // Check if this is a per-user strategy ID (UUID format) or legacy global ID
        const isPerUserStrategy = strategyId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strategyId);
        const endpoint = isPerUserStrategy 
          ? `${backendUrl}/api/user/strategy/analysis/${strategyId}`
          : `${backendUrl}/api/strategy/analysis/${strategyId}`;
        
        const response = await fetch(endpoint, { 
          signal: AbortSignal.timeout(5000),
          headers,
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        if (!text || text.trim() === '') {
          throw new Error('Empty response');
        }
        
        const data = JSON.parse(text);

        if (isCancelled) return;

        if (data.success && data.analysis) {
          setAnalysis(data.analysis);
          setError(null);
          setConsecutiveErrors(0); // Reset error counter on success
        } else {
          setError(data.error || 'No analysis data available');
          setAnalysis(null);
          setConsecutiveErrors(prev => prev + 1);
        }
      } catch (err) {
        if (isCancelled) return;
        
        // Silently handle errors after first few failures
        if (consecutiveErrors < 3) {
          console.warn('[useBackendAnalysis] Failed to fetch:', err instanceof Error ? err.message : err);
        }
        setError('Analysis temporarily unavailable');
        // Don't clear analysis on error - keep showing last known state
        setConsecutiveErrors(prev => prev + 1);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchAnalysis();

    // Poll every 3 seconds
    const interval = setInterval(fetchAnalysis, 3000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [strategyId, consecutiveErrors]);

  return { analysis, loading, error };
}

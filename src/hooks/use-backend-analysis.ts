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
  status: 'initializing' | 'analyzing' | 'signal_detected' | 'position_open' | 'stopped';
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

  useEffect(() => {
    if (!strategyId) {
      setAnalysis(null);
      return;
    }

    const fetchAnalysis = async () => {
      setLoading(true);
      setError(null);

      try {
        // Use backend on port 3000, not frontend origin
        const backendUrl = `http://${window.location.hostname}:3000`;
        const response = await fetch(
          `${backendUrl}/api/strategy/analysis/${strategyId}`,
          { signal: AbortSignal.timeout(5000) }
        );
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        if (!text || text.trim() === '') {
          throw new Error('Empty response');
        }
        
        const data = JSON.parse(text);

        if (data.success && data.analysis) {
          setAnalysis(data.analysis);
        } else {
          setError(data.error || 'No analysis data available');
          setAnalysis(null);
        }
      } catch (err) {
        // Only log non-network errors
        if (err instanceof Error && !err.message.includes('aborted') && !err.message.includes('Empty')) {
          console.error('[useBackendAnalysis] Failed to fetch:', err);
        }
        setError('Failed to fetch analysis data');
        setAnalysis(null);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchAnalysis();

    // Poll every 3 seconds
    const interval = setInterval(fetchAnalysis, 3000);

    return () => clearInterval(interval);
  }, [strategyId]);

  return { analysis, loading, error };
}

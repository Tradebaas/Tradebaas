import { getBackendUrl } from '@/lib/backend-url';
/**
 * Database-First Position Hook
 * 
 * Single Source of Truth: SQLite database
 * - Polls /api/trades/history?status=open
 * - Returns strategy name, position data, entry/SL/TP from TradeRecord
 * - Replaces legacy localStorage + Deribit polling
 */

import { useState, useEffect } from 'react';
import { backendAPI } from '@/lib/backend-api';

export interface OpenPositionFromDB {
  // Trade identification
  tradeId: string;
  strategyName: string;
  
  // Position details
  instrument: string;
  side: 'buy' | 'sell';
  amount: number;
  
  // Entry data
  entryPrice: number;
  entryOrderId: string;
  entryTime: number;
  
  // Risk management
  stopLossPrice?: number;
  takeProfitPrice?: number;
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
  
  // Current status
  currentPnl?: number;
  currentPnlPercent?: number;
}

interface UseOpenPositionResult {
  openPosition: OpenPositionFromDB | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to get open position from SQLite database
 * Polls every 3 seconds for real-time updates
 */
export function useOpenPositionFromDB(): UseOpenPositionResult {
  const [openPosition, setOpenPosition] = useState<OpenPositionFromDB | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOpenPosition = async () => {
    try {
      // Query database for open trades via backend API
      // Use same hostname as current page to avoid CORS issues
      const backendUrl = getBackendUrl();
      
      const response = await fetch(`${backendUrl}/api/trades/history?status=open&limit=1`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch open trades');
      }
      
      if (data.trades && data.trades.length > 0) {
        const trade = data.trades[0];
        
        setOpenPosition({
          tradeId: trade.id,
          strategyName: trade.strategyName,
          instrument: trade.instrument,
          side: trade.side,
          amount: trade.amount,
          entryPrice: trade.entryPrice,
          entryOrderId: trade.entryOrderId,
          entryTime: trade.entryTime,
          stopLossPrice: trade.stopLossPrice,
          takeProfitPrice: trade.takeProfitPrice,
          stopLossOrderId: trade.stopLossOrderId,
          takeProfitOrderId: trade.takeProfitOrderId,
          currentPnl: trade.pnl,
          currentPnlPercent: trade.pnlPercent,
        });
        
        console.log('[useOpenPositionFromDB] Open position found:', {
          strategy: trade.strategyName,
          instrument: trade.instrument,
          entry: trade.entryPrice,
        });
      } else {
        // No open position
        setOpenPosition(null);
      }
      
      setError(null);
    } catch (err) {
      console.error('[useOpenPositionFromDB] Error fetching open position:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchOpenPosition();
  }, []);

  // Poll every 3 seconds
  useEffect(() => {
    const interval = setInterval(fetchOpenPosition, 3000);
    return () => clearInterval(interval);
  }, []);

  return {
    openPosition,
    isLoading,
    error,
    refresh: fetchOpenPosition,
  };
}

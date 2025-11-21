/**
 * Notion integration hook
 * Uses server-side proxy to avoid CORS issues
 */

import { useState, useEffect, useCallback } from 'react';
import { useKV } from '@/hooks/use-kv-polyfill';
import { proxyClient, type NotionTestResult } from '@/lib/proxy-client';

export interface NotionConfig {
  secret: string;
  databaseId: string;
  enabled: boolean;
}

export function useNotion() {
  const [notionSecret] = useKV('notion-secret', '');
  const [notionDatabaseId] = useKV('notion-database-id', '');
  const [notionEnabledRaw] = useKV('notion-enabled', 'false');
  
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = notionEnabledRaw === 'true';

  const testConnection = useCallback(async (): Promise<NotionTestResult> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await proxyClient.testNotionConnection(notionSecret);
      setIsConnected(result.success);
      
      if (!result.success) {
        setError(result.description);
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setIsConnected(false);
      
      return {
        title: 'Notion Verbinding Test',
        description: 'Test kon niet worden uitgevoerd',
        success: false,
        steps: [{
          id: 'error',
          label: 'Test uitvoeren',
          status: 'error',
          message: errorMsg,
          timestamp: Date.now(),
        }],
        suggestions: [
          'Controleer je internetverbinding',
          'Controleer of de backend server draait',
        ],
      };
    } finally {
      setIsLoading(false);
    }
  }, [notionSecret]);

  const searchDatabase = useCallback(async (query?: string) => {
    if (!enabled || !notionSecret) {
      return { success: false, error: 'Notion niet geconfigureerd' };
    }

    try {
      const response = await proxyClient.searchNotion(notionSecret, query);
      return response;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [enabled, notionSecret]);

  const logTrade = useCallback(async (trade: {
    strategy: string;
    instrument: string;
    side: 'buy' | 'sell';
    entry: number;
    exit?: number;
    stopLoss: number;
    takeProfit: number;
    amount: number;
    pnl?: number;
    pnlPercent?: number;
    status: 'open' | 'closed';
    reason?: string;
  }) => {
    if (!enabled || !notionSecret || !notionDatabaseId) {
      return { success: false, error: 'Notion niet volledig geconfigureerd' };
    }

    try {
      const properties = {
        'Strategie': {
          title: [{ text: { content: trade.strategy } }],
        },
        'Instrument': {
          rich_text: [{ text: { content: trade.instrument } }],
        },
        'Richting': {
          select: { name: trade.side === 'buy' ? 'LONG' : 'SHORT' },
        },
        'Entry': {
          number: trade.entry,
        },
        'Stop Loss': {
          number: trade.stopLoss,
        },
        'Take Profit': {
          number: trade.takeProfit,
        },
        'Hoeveelheid': {
          number: trade.amount,
        },
        'Status': {
          select: { name: trade.status === 'open' ? 'Open' : 'Gesloten' },
        },
      };

      // Add exit, pnl if trade is closed
      if (trade.status === 'closed' && trade.exit) {
        (properties as any)['Exit'] = { number: trade.exit };
      }
      if (trade.pnl !== undefined) {
        (properties as any)['PnL'] = { number: trade.pnl };
      }
      if (trade.pnlPercent !== undefined) {
        (properties as any)['PnL %'] = { number: trade.pnlPercent };
      }

      const response = await proxyClient.createNotionPage(
        notionSecret,
        notionDatabaseId,
        properties
      );

      return response;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [enabled, notionSecret, notionDatabaseId]);

  return {
    enabled,
    isConnected,
    isLoading,
    error,
    hasCredentials: !!notionSecret && !!notionDatabaseId,
    testConnection,
    searchDatabase,
    logTrade,
  };
}

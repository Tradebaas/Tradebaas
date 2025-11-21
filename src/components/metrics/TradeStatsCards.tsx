import { getBackendUrl } from '@/lib/backend-url';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
  slHits: number;
  tpHits: number;
}

interface TradeStatsProps {
  strategyName?: string;
}

export function TradeStatsCards({ strategyName }: TradeStatsProps) {
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [strategyName]);

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (strategyName && strategyName !== 'all') {
        params.append('strategyName', strategyName);
      }

      // Use same hostname as current page to avoid CORS issues
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/trades/stats?${params}`);
      const data = await response.json();

      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch trade stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getPnlColor = (value: number) => {
    if (value > 0) return 'text-green-500';
    if (value < 0) return 'text-red-500';
    return 'text-muted-foreground';
  };

  const metrics = [
    {
      label: 'Total Trades',
      value: stats.totalTrades.toString(),
      color: 'text-foreground',
    },
    {
      label: 'Win Rate',
      value: formatPercentage(stats.winRate),
      color: stats.winRate >= 50 ? 'text-green-500' : 'text-red-500',
    },
    {
      label: 'Total P&L',
      value: formatCurrency(stats.totalPnl),
      color: getPnlColor(stats.totalPnl),
    },
    {
      label: 'Avg P&L',
      value: formatCurrency(stats.avgPnl),
      color: getPnlColor(stats.avgPnl),
    },
    {
      label: 'Best Trade',
      value: formatCurrency(stats.bestTrade),
      color: 'text-green-500',
    },
    {
      label: 'Worst Trade',
      value: formatCurrency(stats.worstTrade),
      color: 'text-red-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {metrics.map((metric) => (
        <div key={metric.label} className="p-4 rounded-xl bg-muted/20 border border-border/20">
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">{metric.label}</p>
          <p className={`text-xl font-semibold ${metric.color}`}>{metric.value}</p>
        </div>
      ))}
    </div>
  );
}

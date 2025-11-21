import { getBackendUrl } from '@/lib/backend-url';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, AlertTriangle, Trash2, Download, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';

interface TradeRecord {
  id: string;
  strategyName: string;
  instrument: string;
  side: 'buy' | 'sell';
  entryOrderId: string;
  slOrderId?: string;
  tpOrderId?: string;
  entryPrice: number;
  exitPrice?: number;
  amount: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
  exitTime?: number;
  exitReason?: 'sl_hit' | 'tp_hit' | 'manual' | 'strategy_stop' | 'error';
  pnl?: number;
  pnlPercentage?: number;
  status: 'open' | 'closed';
}

interface TradeHistoryTableProps {
  strategyName?: string;
}

export function TradeHistoryTable({ strategyName }: TradeHistoryTableProps) {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphanDetected, setOrphanDetected] = useState(false);
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchTrades();
    checkForOrphans();
    // Refresh every 10 seconds
    const interval = setInterval(() => {
      fetchTrades();
      checkForOrphans();
    }, 10000);
    return () => clearInterval(interval);
  }, [strategyName]);

  const fetchTrades = async () => {
    try {
      const params = new URLSearchParams();
      if (strategyName && strategyName !== 'all') {
        params.append('strategyName', strategyName);
      }
      params.append('limit', '50');

      // Use same hostname as current page to avoid CORS issues
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/trades/history?${params}`);
      const data = await response.json();

      if (data.success) {
        setTrades(data.trades);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch trades');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const checkForOrphans = async () => {
    try {
      const backendUrl = getBackendUrl();
      
      // Get open positions from Deribit
      const positionsResponse = await fetch(`${backendUrl}/api/v2/positions?currency=USDC`);
      const positionsData = await positionsResponse.json();
      
      // Get open trades from database
      const tradesResponse = await fetch(`${backendUrl}/api/trades/history?status=open`);
      const tradesData = await tradesResponse.json();
      
      if (positionsData.success && tradesData.success) {
        const openPositions = positionsData.positions?.filter((p: any) => p.size !== 0) || [];
        const openTrades = tradesData.trades || [];
        
        // If we have positions but no matching trades, we have orphans
        const hasOrphans = openPositions.length > openTrades.length;
        setOrphanDetected(hasOrphans);
        
        if (hasOrphans && !orphanDetected) {
          toast.warning('Orphan positie gedetecteerd', {
            description: 'Er is een open positie die niet in de database staat. Klik op "Sync Posities" om te synchroniseren.',
            duration: 10000,
          });
        }
      }
    } catch (err) {
      // Silent fail - orphan check is not critical
      console.warn('Orphan check failed:', err);
    }
  };

  const syncPositions = async () => {
    setSyncing(true);
    try {
      const backendUrl = getBackendUrl();
      
      // Sync for Razor strategy with BTC_USDC-PERPETUAL
      const response = await fetch(`${backendUrl}/api/trades/sync-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyName: 'razor',
          instrument: 'BTC_USDC-PERPETUAL',
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Posities gesynchroniseerd', {
          description: `Trade ${data.tradeId} toegevoegd aan database`,
        });
        
        // Refresh trades
        await fetchTrades();
        await checkForOrphans();
      } else {
        toast.error('Sync mislukt', {
          description: data.error || 'Kon posities niet synchroniseren',
        });
      }
    } catch (err) {
      toast.error('Sync fout', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Bulk selection handlers
  const toggleSelectAll = () => {
    if (selectedTrades.size === trades.length) {
      setSelectedTrades(new Set());
    } else {
      setSelectedTrades(new Set(trades.map(t => t.id)));
    }
  };

  const toggleSelectTrade = (tradeId: string) => {
    const newSelected = new Set(selectedTrades);
    if (newSelected.has(tradeId)) {
      newSelected.delete(tradeId);
    } else {
      newSelected.add(tradeId);
    }
    setSelectedTrades(newSelected);
  };

  // Bulk delete selected trades
  const deleteSelectedTrades = async () => {
    if (selectedTrades.size === 0) {
      toast.error('Geen trades geselecteerd');
      return;
    }

    if (!confirm(`Weet je zeker dat je ${selectedTrades.size} trade(s) wilt verwijderen? Dit kan niet ongedaan gemaakt worden.`)) {
      return;
    }

    setIsDeleting(true);
    const backendUrl = getBackendUrl();
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const tradeId of selectedTrades) {
        try {
          const response = await fetch(`${backendUrl}/api/trades/${tradeId}`, {
            method: 'DELETE',
          });
          const data = await response.json();
          if (data.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch {
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} trade(s) verwijderd`);
        setSelectedTrades(new Set());
        await fetchTrades();
      }

      if (errorCount > 0) {
        toast.error(`${errorCount} trade(s) konden niet verwijderd worden`);
      }
    } catch (err) {
      toast.error('Bulk delete fout', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Export selected trades to JSON
  const exportSelectedTrades = () => {
    if (selectedTrades.size === 0) {
      toast.error('Geen trades geselecteerd');
      return;
    }

    const selectedTradesData = trades.filter(t => selectedTrades.has(t.id));
    
    // Create export object with metadata
    const exportData = {
      exportedAt: new Date().toISOString(),
      strategyName: strategyName || 'all',
      totalTrades: selectedTradesData.length,
      trades: selectedTradesData,
      summary: {
        totalPnl: selectedTradesData.reduce((sum, t) => sum + (t.pnl || 0), 0),
        winningTrades: selectedTradesData.filter(t => (t.pnl || 0) > 0).length,
        losingTrades: selectedTradesData.filter(t => (t.pnl || 0) < 0).length,
        openTrades: selectedTradesData.filter(t => t.status === 'open').length,
        closedTrades: selectedTradesData.filter(t => t.status === 'closed').length,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradebaas-export-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Export succesvol', {
      description: `${selectedTradesData.length} trade(s) geëxporteerd naar JSON`,
    });
  };

  // Export to CSV format
  const exportSelectedTradesCSV = () => {
    if (selectedTrades.size === 0) {
      toast.error('Geen trades geselecteerd');
      return;
    }

    const selectedTradesData = trades.filter(t => selectedTrades.has(t.id));
    
    // CSV headers
    const headers = [
      'ID',
      'Strategy',
      'Instrument',
      'Side',
      'Entry Price',
      'Exit Price',
      'Amount',
      'Entry Time',
      'Exit Time',
      'Exit Reason',
      'PnL',
      'PnL %',
      'Status',
    ];

    // CSV rows
    const rows = selectedTradesData.map(trade => [
      trade.id,
      trade.strategyName,
      trade.instrument,
      trade.side,
      trade.entryPrice,
      trade.exitPrice || '',
      trade.amount,
      format(new Date(trade.entryTime), 'yyyy-MM-dd HH:mm:ss'),
      trade.exitTime ? format(new Date(trade.exitTime), 'yyyy-MM-dd HH:mm:ss') : '',
      trade.exitReason || '',
      trade.pnl || '',
      trade.pnlPercentage || '',
      trade.status,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradebaas-export-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Export succesvol', {
      description: `${selectedTradesData.length} trade(s) geëxporteerd naar CSV`,
    });
  };

  const getExitReasonBadge = (exitReason?: string) => {
    if (!exitReason) return null;

    const variants: Record<string, { variant: any; label: string }> = {
      tp_hit: { variant: 'default', label: 'TP Hit' },
      sl_hit: { variant: 'destructive', label: 'SL Hit' },
      manual: { variant: 'secondary', label: 'Manual' },
      strategy_stop: { variant: 'secondary', label: 'Strategy Stop' },
      error: { variant: 'destructive', label: 'Error' },
    };

    const config = variants[exitReason] || { variant: 'secondary', label: exitReason };

    return (
      <Badge variant={config.variant as any} className="text-xs">
        {config.label}
      </Badge>
    );
  };

  const getPnlColor = (pnl?: number) => {
    if (!pnl) return 'text-muted-foreground';
    return pnl > 0 ? 'text-green-500' : 'text-red-500';
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30">
        <p className="text-sm text-destructive">Error loading trades: {error}</p>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-sm text-muted-foreground">Geen trades uitgevoerd</p>
        {orphanDetected && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <p className="text-xs text-yellow-500">
              Er is een open positie die niet in de database staat
            </p>
          </div>
        )}
        <Button
          onClick={syncPositions}
          disabled={syncing}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchroniseren...' : 'Sync Posities'}
        </Button>
      </div>
    );
  }

  const bulkActionsPortal = selectedTrades.size > 0 ? createPortal(
    <>
      <div className="flex items-center gap-2 mr-3">
        <CheckSquare className="w-4 h-4 text-primary" />
        <p className="text-xs font-medium text-primary">
          {selectedTrades.size} geselecteerd
        </p>
      </div>
      <Button
        onClick={exportSelectedTradesCSV}
        variant="outline"
        size="sm"
        className="gap-2 h-7 text-xs"
      >
        <Download className="w-3 h-3" />
        CSV
      </Button>
      <Button
        onClick={exportSelectedTrades}
        variant="outline"
        size="sm"
        className="gap-2 h-7 text-xs"
      >
        <Download className="w-3 h-3" />
        JSON
      </Button>
      <Button
        onClick={deleteSelectedTrades}
        disabled={isDeleting}
        variant="destructive"
        size="sm"
        className="gap-2 h-7 text-xs"
      >
        <Trash2 className="w-3 h-3" />
        {isDeleting ? 'Verwijderen...' : `Verwijder (${selectedTrades.size})`}
      </Button>
    </>,
    document.getElementById('bulk-actions-portal') || document.body
  ) : null;

  return (
    <div className="flex flex-col gap-3 flex-1 overflow-hidden">
      {bulkActionsPortal}
      
      {orphanDetected && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <p className="text-xs text-yellow-500">
              Orphan positie gedetecteerd - Database niet gesynchroniseerd met Deribit
            </p>
          </div>
          <Button
            onClick={syncPositions}
            disabled={syncing}
            variant="ghost"
            size="sm"
            className="gap-2 h-7 text-xs"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Nu'}
          </Button>
        </div>
      )}
      
      <div className="rounded-xl border border-border/20 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow className="bg-muted/20">
                <TableHead className="w-10 text-center">
                  <Checkbox
                    checked={selectedTrades.size === trades.length && trades.length > 0}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all trades"
                  />
                </TableHead>
                <TableHead className="text-xs font-medium">Tijd</TableHead>
                <TableHead className="text-xs font-medium">Strategie</TableHead>
                <TableHead className="text-xs font-medium">Instrument</TableHead>
                <TableHead className="text-xs font-medium">Side</TableHead>
                <TableHead className="text-xs font-medium text-right">Entry</TableHead>
                <TableHead className="text-xs font-medium text-right">Exit</TableHead>
                <TableHead className="text-xs font-medium text-right">Amount</TableHead>
                <TableHead className="text-xs font-medium">Exit Reason</TableHead>
                <TableHead className="text-xs font-medium text-right">PnL</TableHead>
                <TableHead className="text-xs font-medium">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <TableRow key={trade.id} className="hover:bg-muted/10">
                  <TableCell className="text-center">
                    <Checkbox
                      checked={selectedTrades.has(trade.id)}
                      onCheckedChange={() => toggleSelectTrade(trade.id)}
                      aria-label={`Select trade ${trade.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    {format(new Date(trade.entryTime), 'dd/MM HH:mm')}
                  </TableCell>
                  <TableCell className="text-xs font-medium">{trade.strategyName}</TableCell>
                  <TableCell className="text-xs">{trade.instrument}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={trade.side === 'buy' ? 'default' : 'destructive'} className="text-xs">
                      {trade.side.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    ${trade.entryPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    {trade.amount.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {getExitReasonBadge(trade.exitReason)}
                  </TableCell>
                  <TableCell className={`text-xs text-right font-semibold ${getPnlColor(trade.pnl)}`}>
                    {trade.pnl !== undefined ? (
                      <>
                        ${trade.pnl.toFixed(2)}
                        <span className="text-muted-foreground ml-1 font-normal">
                          ({trade.pnlPercentage?.toFixed(2)}%)
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={trade.status === 'open' ? 'secondary' : 'outline'} className="text-xs">
                      {trade.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

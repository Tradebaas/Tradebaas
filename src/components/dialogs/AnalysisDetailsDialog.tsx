import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTradingStore } from '@/state/store';
import { useBackendStrategyStatus } from '@/hooks/use-backend-strategy-status';
import { useBackendAnalysis } from '@/hooks/use-backend-analysis';
import { Check, X, Clock, TrendUp, TrendDown, Minus, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import type { VortexConfig } from '@/lib/strategies/vortexStrategy';

interface PositionInfo {
  instrument: string;
  direction: 'buy' | 'sell';
  entry: number;
  current: number;
  stopLoss: number | null;
  takeProfit: number | null;
  pnl: number;
  pnlPercent: number;
}

interface AnalysisDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis?: string;
  probability?: number;
  position?: PositionInfo;
}

interface Checkpoint {
  id: string;
  label: string;
  description: string;
  status: 'met' | 'not-met' | 'pending';
  value?: string;
  details?: string;
}

export function AnalysisDetailsDialog({ open, onOpenChange, analysis, probability, position }: AnalysisDetailsDialogProps) {
  const { getAnalysisState, selectedStrategy } = useTradingStore();
  const [analysisState, setAnalysisState] = useState(getAnalysisState());
  
  // Check if backend strategy is running
  const { isRunning: isBackendRunning, strategies } = useBackendStrategyStatus();
  
  // Get active strategy ID
  const activeStrategy = strategies.find(s => s.status === 'active');
  const backendStrategyId = activeStrategy?.id || null;
  
  console.log('[AnalysisDetailsDialog] Backend strategy ID:', backendStrategyId, 'Active:', isBackendRunning);
  
  // Fetch backend analysis data
  const { analysis: backendAnalysis } = useBackendAnalysis(backendStrategyId);

  const isPositionAnalysis = !!position;

  useEffect(() => {
    if (!open || isPositionAnalysis) return;

    const updateState = () => {
      const state = getAnalysisState();
      setAnalysisState(state);
    };

    updateState();
    const interval = setInterval(updateState, 10000);

    return () => clearInterval(interval);
  }, [open, getAnalysisState, isPositionAnalysis]);

  if (isPositionAnalysis && position) {
    const isProfitable = position.pnl >= 0;
    const isLong = position.direction === 'buy';
    const rr = position.stopLoss && position.takeProfit 
      ? Math.abs(position.takeProfit - position.entry) / Math.abs(position.entry - position.stopLoss)
      : null;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg h-auto max-h-[85vh] flex flex-col rounded-2xl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-lg flex items-center gap-2">
              Live Marktanalyse
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse-glow"></div>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Real-time analyse van je positie en marktcondities
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="p-4 rounded-xl border bg-card/50 border-border/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${isLong ? 'bg-success/20' : 'bg-destructive/20'}`}>
                    {isLong ? (
                      <ArrowUp className="w-5 h-5 text-success" weight="bold" />
                    ) : (
                      <ArrowDown className="w-5 h-5 text-destructive" weight="bold" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-base">{position.instrument}</h3>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {isLong ? 'LONG' : 'SHORT'} POSITIE
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${isProfitable ? 'text-success' : 'text-destructive'}`}>
                    {isProfitable ? '+' : ''}${position.pnl.toFixed(2)}
                  </p>
                  <p className={`text-sm ${isProfitable ? 'text-success' : 'text-destructive'}`}>
                    {isProfitable ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Entry Prijs</p>
                  <p className="font-bold">${position.entry.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Huidige Prijs</p>
                  <p className="font-bold">${position.current.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Stop Loss</p>
                  <p className="font-bold text-destructive">
                    {position.stopLoss ? `$${position.stopLoss.toFixed(2)}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Take Profit</p>
                  <p className="font-bold text-success">
                    {position.takeProfit ? `$${position.takeProfit.toFixed(2)}` : '—'}
                  </p>
                </div>
              </div>

              {rr && (
                <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Risk:Reward Ratio</span>
                  <span className="text-base font-bold text-accent">1:{rr.toFixed(2)}</span>
                </div>
              )}
            </div>

            {probability !== undefined && (
              <div className={`p-4 rounded-xl border ${
                probability >= 70 ? 'bg-success/10 border-success/30' : 
                probability >= 40 ? 'bg-warning/10 border-warning/30' : 
                'bg-destructive/10 border-destructive/30'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Succeskans</h3>
                  <span className={`text-3xl font-bold ${
                    probability >= 70 ? 'text-success' : 
                    probability >= 40 ? 'text-warning' : 
                    'text-destructive'
                  }`}>
                    {probability}%
                  </span>
                </div>
                {analysis && (
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {analysis}
                  </p>
                )}
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted/10 border border-border/20">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Hoe wordt dit berekend?
              </h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>• Huidige prijs momentum (beweegt de markt mee met je positie?)</p>
                <p>• Afstand tot Stop Loss en Take Profit</p>
                <p>• Current P&L status en trend</p>
                <p>• Risico dat de Stop Loss getriggerd wordt</p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20 text-center">
              <p className="text-xs text-muted-foreground">
                Updates automatisch elke 30 seconden
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Show backend analysis (ALWAYS - no fallback)
  if (backendAnalysis && !isPositionAnalysis) {
    const checkpoints = backendAnalysis.checkpoints.map(cp => ({
      id: cp.id,
      label: cp.label,
      description: cp.description || cp.value || '',
      status: cp.status === 'met' ? 'met' as const : cp.status === 'failed' ? 'not-met' as const : 'pending' as const,
      value: cp.value,
      details: cp.description,
    }));

    const signalStrength = backendAnalysis.signal?.strength || 0;
    const signalType = backendAnalysis.signal?.type || 'none';
    const signalConfidence = backendAnalysis.signal?.confidence || 0;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md h-[600px] max-h-[85vh] flex flex-col rounded-2xl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-lg flex items-center gap-2">
              Live Analyse
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse-glow"></div>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              {backendAnalysis.strategyName} - {backendAnalysis.instrument}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1">
            <div className="space-y-3">
              {/* Status & Price - Combined */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/20">
                  <div className="text-[10px] font-medium text-muted-foreground mb-1">Status</div>
                  <div className="text-xs font-semibold">
                    {backendAnalysis.status === 'initializing' && 'Initialiseren...'}
                    {backendAnalysis.status === 'analyzing' && 'Analyseren'}
                    {backendAnalysis.status === 'signal_detected' && 'Signaal!'}
                    {backendAnalysis.status === 'position_open' && 'Positie open'}
                    {backendAnalysis.status === 'stopped' && 'Gestopt'}
                  </div>
                </div>
                
                {backendAnalysis.currentPrice && (
                  <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
                    <div className="text-[10px] font-medium text-muted-foreground mb-1">Prijs</div>
                    <div className="text-xs font-bold">${backendAnalysis.currentPrice.toFixed(2)}</div>
                  </div>
                )}
              </div>

              {/* Signal - Always show */}
              <div className={`p-2.5 rounded-lg border ${
                signalType === 'long' 
                  ? 'bg-green-500/10 border-green-500/30' 
                  : signalType === 'short'
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-muted/10 border-border/20'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-semibold">
                    {signalType === 'long' && '🟢 Long Signal'}
                    {signalType === 'short' && '🔴 Short Signal'}
                    {signalType === 'none' && 'Geen Signal'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Vertrouwen: {Math.round(signalConfidence)}%
                  </div>
                </div>
                {backendAnalysis.signal?.reasons && backendAnalysis.signal.reasons.length > 0 && (
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {backendAnalysis.signal.reasons.join(', ')}
                  </div>
                )}
              </div>

              {/* Checkpoints - Compact */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Entry Voorwaarden</div>
                {checkpoints.map((checkpoint) => (
                  <div
                    key={checkpoint.id}
                    className="p-2 rounded-lg border border-border/20 bg-muted/5"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        {checkpoint.status === 'met' && <Check weight="bold" className="w-3.5 h-3.5 text-green-500" />}
                        {checkpoint.status === 'not-met' && <X weight="bold" className="w-3.5 h-3.5 text-red-500" />}
                        {checkpoint.status === 'pending' && <Clock weight="bold" className="w-3.5 h-3.5 text-yellow-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium">{checkpoint.label}</div>
                          {checkpoint.value && (
                            <div className="text-[10px] text-muted-foreground font-medium">{checkpoint.value}</div>
                          )}
                        </div>
                        {checkpoint.details && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{checkpoint.details}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Cooldown - Only if active */}
              {backendAnalysis.cooldownUntil && Date.now() < backendAnalysis.cooldownUntil && (
                <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <div className="text-[10px] font-medium text-muted-foreground mb-0.5">Cooldown</div>
                  <div className="text-xs font-semibold">
                    {Math.ceil((backendAnalysis.cooldownUntil - Date.now()) / 1000 / 60)} min
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  
  // No backend analysis - show error
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md h-[600px] max-h-[85vh] flex flex-col rounded-2xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-base">Live Analyse</DialogTitle>
        </DialogHeader>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Geen actieve strategie - start eerst een strategy</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

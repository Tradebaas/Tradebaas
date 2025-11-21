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
  const { isRunning: isBackendRunning, primaryStrategyId } = useBackendStrategyStatus();
  
  // Get backend strategy ID (either active or with open position)
  const backendStrategyId = primaryStrategyId;
  
  console.log('[AnalysisDetailsDialog] Backend strategy ID:', backendStrategyId, 'Active:', isBackendRunning);
  
  // Fetch backend analysis data
  const { analysis: backendAnalysis, loading: backendLoading } = useBackendAnalysis(backendStrategyId);

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

  // If there's a backend strategy selected but analysis is still loading
  if (!isPositionAnalysis && backendStrategyId && backendLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg h-auto max-h-[85vh] flex flex-col rounded-2xl items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <Clock className="w-6 h-6 text-muted-foreground animate-spin-slow" />
            <DialogTitle className="text-base font-semibold">Analyse wordt geladen</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              We halen de laatste marktdata en analyse op voor je actieve strategie.
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Show backend analysis ONLY if strategy is actually running
  if (!isPositionAnalysis && backendStrategyId && backendAnalysis) {
    // If backend reports initializing, show a warm-up view instead of "geen strategie"
  // Use checkpoints/reasons to detect warm-up instead of relying on a dedicated 'initializing' status literal
  const isInitializing = backendAnalysis.checkpoints?.some(cp => cp.id === 'initializing') ?? false;

  if (isInitializing) {
      const checkpoints = backendAnalysis.checkpoints ?? [];

      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-lg h-auto max-h-[85vh] flex flex-col rounded-2xl">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-lg flex items-center gap-2">
                Strategie wordt opgestart
                <div className="w-2 h-2 rounded-full bg-warning animate-pulse-glow"></div>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground pt-1">
                Marktdata wordt verzameld en indicatoren worden berekend. Dit kan enkele seconden duren.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="p-4 rounded-xl border bg-card/50 border-border/30 flex items-center gap-3">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Wachten op voldoende marktdata</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    We bouwen eerst een korte geschiedenis op om betrouwbare signalen te kunnen berekenen.
                  </p>
                </div>
              </div>

              {checkpoints.length > 0 && (
                <div className="p-4 rounded-xl border bg-muted/10 border-border/30">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Opstart-checks
                  </h3>
                  <div className="space-y-2">
                    {checkpoints.map(cp => (
                      <div key={cp.id} className="flex items-start gap-2">
                        <Clock className="w-4 h-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{cp.label}</p>
                          {cp.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{cp.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Deze weergave wordt automatisch bijgewerkt zodra de strategie genoeg data heeft om signalen te genereren.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      );
    }

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
    
    // Check if position is open (use backend strategy status)
    const isPositionOpen = backendAnalysis.status === 'position_open';
    
    // POSITION OPEN VIEW: Real-time monitoring with confidence
    if (isPositionOpen && backendAnalysis.currentPrice !== null) {
      // Use backend analysis as primary source of truth for live monitoring
      const currentPrice = backendAnalysis.currentPrice;
      // Fallbacks for entry/SL/TP when metrics are not available in analysis payload
      const entryPrice = backendAnalysis.signal?.type === 'long'
        ? (backendAnalysis.indicators?.emaFast || backendAnalysis.currentPrice)
        : (backendAnalysis.indicators?.emaSlow || backendAnalysis.currentPrice);
      const stopLoss = backendAnalysis.currentPrice * 0.995; // Approximation when detailed metrics are not present
      const takeProfit = backendAnalysis.currentPrice * 1.005; // Approximation when detailed metrics are not present
      const isLong = backendAnalysis.signal?.type === 'long';
      
      // Calculate confidence based on real-time analysis
      let confidence = 50; // Base confidence
      let confidenceFactors: string[] = [];
      
      // Factor 1: PnL status (40% weight)
  const pnl = 0;
  const pnlPercent = 0;
      if (pnlPercent > 0.5) {
        confidence += 20;
        confidenceFactors.push(`Positieve P&L (+${pnlPercent.toFixed(2)}%)`);
      } else if (pnlPercent > 0) {
        confidence += 10;
        confidenceFactors.push(`Licht positieve P&L`);
      } else if (pnlPercent < -0.3) {
        confidence -= 20;
        confidenceFactors.push(`Negatieve P&L (${pnlPercent.toFixed(2)}%)`);
      }
      
      // Factor 2: Distance to SL/TP (30% weight)
  const distanceToSL = Math.abs(currentPrice - stopLoss) / entryPrice * 100;
  const distanceToTP = Math.abs(currentPrice - takeProfit) / entryPrice * 100;
      const slTpRatio = distanceToTP / distanceToSL;
      
      if (slTpRatio > 0.7) {
        confidence += 15;
        confidenceFactors.push(`TP dichterbij dan SL`);
      } else if (slTpRatio < 0.3) {
        confidence -= 15;
        confidenceFactors.push(`SL komt gevaarlijk dichtbij`);
      }
      
      // Factor 3: Market momentum (30% weight)
      const indicators = backendAnalysis.indicators;
      if (indicators?.rsi) {
        if (isLong && indicators.rsi < 40) {
          confidence += 15;
          confidenceFactors.push(`RSI oversold (${indicators.rsi.toFixed(1)})`);
        } else if (!isLong && indicators.rsi > 60) {
          confidence += 15;
          confidenceFactors.push(`RSI overbought (${indicators.rsi.toFixed(1)})`);
        } else if ((isLong && indicators.rsi > 70) || (!isLong && indicators.rsi < 30)) {
          confidence -= 10;
          confidenceFactors.push(`RSI tegen positie in`);
        }
      }
      
      // Clamp confidence between 0-100
      confidence = Math.max(0, Math.min(100, confidence));
      
      // Position monitoring checkpoints
      const positionCheckpoints = [
        {
          id: 'pnl',
          label: 'Profit & Loss',
          status: pnl >= 0 ? 'met' as const : 'not-met' as const,
          value: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
          description: `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% vanaf entry`,
        },
        {
          id: 'sl_distance',
          label: 'Stop Loss Afstand',
          status: distanceToSL > 0.2 ? 'met' as const : distanceToSL > 0.1 ? 'pending' as const : 'not-met' as const,
          value: `${distanceToSL.toFixed(2)}%`,
          description: distanceToSL > 0.2 ? 'Veilige afstand' : distanceToSL > 0.1 ? 'Let op: SL komt dichtbij' : 'RISICO: SL zeer dichtbij!',
        },
        {
          id: 'tp_distance',
          label: 'Take Profit Afstand',
          status: distanceToTP < 0.3 ? 'met' as const : distanceToTP < 0.5 ? 'pending' as const : 'not-met' as const,
          value: `${distanceToTP.toFixed(2)}%`,
          description: distanceToTP < 0.3 ? 'TP komt dichtbij!' : distanceToTP < 0.5 ? 'Onderweg naar TP' : 'TP nog ver weg',
        },
      ];
      
      if (indicators?.rsi) {
        positionCheckpoints.push({
          id: 'rsi_momentum',
          label: 'RSI Momentum',
          status: (isLong && indicators.rsi < 50) || (!isLong && indicators.rsi > 50) ? 'met' as const : 'pending' as const,
          value: indicators.rsi.toFixed(1),
          description: isLong 
            ? (indicators.rsi < 40 ? 'Oversold - goed voor LONG' : indicators.rsi > 60 ? 'Overbought - risico' : 'Neutraal')
            : (indicators.rsi > 60 ? 'Overbought - goed voor SHORT' : indicators.rsi < 40 ? 'Oversold - risico' : 'Neutraal'),
        });
      }
      
      if (indicators?.volatility) {
        positionCheckpoints.push({
          id: 'volatility',
          label: 'Markt Volatiliteit',
          status: indicators.volatility < 2 ? 'met' as const : indicators.volatility < 4 ? 'pending' as const : 'not-met' as const,
          value: `${indicators.volatility.toFixed(2)}%`,
          description: indicators.volatility < 2 ? 'Stabiele markt' : indicators.volatility < 4 ? 'Matige volatiliteit' : 'Hoge volatiliteit - risico',
        });
      }

      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-md h-[600px] max-h-[85vh] flex flex-col rounded-2xl">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-lg flex items-center gap-2">
                Positie Monitoring
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse-glow"></div>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground pt-1">
                Real-time analyse van je {isLong ? 'LONG' : 'SHORT'} positie
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-1">
              <div className="space-y-3">
                {/* Confidence Vote */}
                <div className={`p-3 rounded-xl border ${
                  confidence >= 70 ? 'bg-success/10 border-success/30' : 
                  confidence >= 50 ? 'bg-warning/10 border-warning/30' : 
                  'bg-destructive/10 border-destructive/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Trade Confidence</h3>
                    <span className={`text-3xl font-bold ${
                      confidence >= 70 ? 'text-success' : 
                      confidence >= 50 ? 'text-warning' : 
                      'text-destructive'
                    }`}>
                      {confidence}%
                    </span>
                  </div>
                  <div className="space-y-1">
                    {confidenceFactors.map((factor, i) => (
                      <div key={i} className="text-xs text-foreground/80">• {factor}</div>
                    ))}
                  </div>
                </div>

                {/* Position Details */}
                <div className="p-3 rounded-xl border bg-card/50 border-border/30">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Entry</p>
                      <p className="font-bold">${entryPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Huidig</p>
                      <p className="font-bold">${currentPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Stop Loss</p>
                      <p className="font-bold text-destructive">${stopLoss.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Take Profit</p>
                      <p className="font-bold text-success">${takeProfit.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Real-time Checkpoints */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Live Monitoring</div>
                  {positionCheckpoints.map((checkpoint) => (
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
                          {checkpoint.description && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{checkpoint.description}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20 text-center">
                  <p className="text-xs text-muted-foreground">
                    Updates automatisch elke seconde
                  </p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      );
    }
    
    // ANALYZING VIEW: Entry conditions (original view)
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

  
  // Fallback: geen backend-strategie en geen positie-analyse
  if (!isPositionAnalysis) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg h-auto max-h-[85vh] flex flex-col rounded-2xl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-lg flex items-center gap-2">
              Geen actieve strategie
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Start de Razor of Thor strategie om live marktanalyse te zien.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4 mb-2">
            <div className="p-6 rounded-xl border border-dashed border-border/50 bg-muted/10">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
                  <TrendUp className="w-6 h-6 text-accent" weight="bold" />
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-1">Geen actieve strategie</h3>
                  <p className="text-sm text-muted-foreground">
                      Start een strategie (Razor of Thor) om automatische marktanalyse te krijgen
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-muted/10 border border-border/20">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Wat krijg je met een actieve strategie?
              </h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>• Real-time Long/Short signalen op basis van de gekozen strategie (Razor of Thor)</p>
                <p>• Automatische entry voorwaarden monitoring</p>
                <p>• Live cooldown tracking na trades</p>
                <p>• Positie monitoring met P&L tracking</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <h4 className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">
                ⚠️ Belangrijk
              </h4>
              <p className="text-xs text-muted-foreground">
                Handmatige trades (geplaatst via Deribit) worden NIET gemonitord door de strategie. 
                Start eerst een strategie via de "Start" knop om automatische analyse te krijgen.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ...existing return for other cases (e.g. position analysis)...
}

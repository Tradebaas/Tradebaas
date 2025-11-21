import { Strategy } from '@/components/metrics/StrategiesPage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Info, CheckCircle, Wind, Zap, ArrowUpRight, BarChart3 } from 'lucide-react';

interface StrategyDetailsDialogProps {
  strategy: Strategy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StrategyDetailsDialog({
  strategy,
  open,
  onOpenChange,
}: StrategyDetailsDialogProps) {
  if (!strategy) return null;

  const StrategyIcon = strategy.id === 'razor' 
    ? Wind 
    : strategy.id === 'thor' 
    ? Zap 
    : Info;

  const getTypeColor = (type: Strategy['type']) => {
    switch (type) {
      case 'momentum':
        return 'bg-accent/20 text-accent border-accent/30';
      case 'mean-reversion':
        return 'bg-success/20 text-success border-success/30';
      case 'breakout':
        return 'bg-warning/20 text-warning-foreground border-warning/30';
      case 'scalping':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getTypeLabel = (type: Strategy['type']) => {
    switch (type) {
      case 'momentum':
        return 'Momentum';
      case 'mean-reversion':
        return 'Mean Reversion';
      case 'breakout':
        return 'Breakout';
      case 'scalping':
        return 'Scalping';
      default:
        return 'Custom';
    }
  };

  // Separate features and entry rules from other parameters
  const { features, entryRules, indicators, timeframe, riskReward, winRate, ...otherParams } = strategy.parameters;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] flex flex-col rounded-2xl p-0 overflow-hidden">
        {/* Header - Fixed */}
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-border/30">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Icon */}
              <div className={`p-3 rounded-xl flex-shrink-0 ${
              strategy.id === 'razor' 
                ? 'bg-destructive/10 text-destructive' 
                : strategy.id === 'thor'
                ? 'bg-accent/10 text-accent'
                : 'bg-muted text-muted-foreground'
              }`}>
                <StrategyIcon className="w-6 h-6" />
              </div>

              {/* Title & Built-in badge in same row for baseline alignment */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <DialogTitle className="text-xl font-bold truncate">
                  {strategy.name}
                </DialogTitle>
                {strategy.isBuiltIn && (
                  <Badge
                    variant="outline"
                    className="text-[11px] h-5 px-2 bg-primary/10 text-primary border-primary/30 flex items-center gap-1 flex-shrink-0"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Built-in
                  </Badge>
                )}
              </div>
            </div>

            {/* Type badge - same baseline, right-aligned */}
            <Badge
              variant="outline"
              className={`text-[11px] h-6 px-3 flex items-center justify-center flex-shrink-0 ${getTypeColor(strategy.type)}`}
            >
              {getTypeLabel(strategy.type)}
            </Badge>
          </div>
        </DialogHeader>

  {/* Content - Scrollable: eenvoudige overflow-y-auto container */}
  <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6 pb-6">
              {/* Description */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-accent" />
                  <h4 className="text-sm font-semibold">Beschrijving</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {strategy.description}
                </p>
              </div>

            {/* Key Stats Grid */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-accent" />
                <h4 className="text-sm font-semibold">Prestatie Kengetallen</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/20">
                  <div className="text-xs text-muted-foreground mb-1">Timeframe</div>
                  <div className="text-sm font-semibold">{timeframe || 'N/A'}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/20">
                  <div className="text-xs text-muted-foreground mb-1">Risk/Reward</div>
                  <div className="text-sm font-semibold">{riskReward}:1</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/20">
                  <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
                  <div className="text-sm font-semibold text-success">{winRate || 'TBD'}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/20">
                  <div className="text-xs text-muted-foreground mb-1">Indicators</div>
                  <div className="text-sm font-semibold">{Array.isArray(indicators) ? indicators.length : 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Features */}
            {features && Array.isArray(features) && features.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUpRight className="w-4 h-4 text-accent" />
                  <h4 className="text-sm font-semibold">Key Features</h4>
                </div>
                <div className="grid gap-2">
                  {features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-3 rounded-lg bg-success/5 border border-success/20"
                    >
                      <ArrowUpRight className="w-4 h-4 flex-shrink-0 text-success mt-0.5" />
                      <span className="text-sm text-foreground leading-relaxed">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Entry Rules */}
            {entryRules && Array.isArray(entryRules) && entryRules.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-accent" />
                  <h4 className="text-sm font-semibold">Entry Criteria</h4>
                </div>
                <div className="grid gap-2">
                  {entryRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20"
                    >
                      <CheckCircle className="w-4 h-4 flex-shrink-0 text-accent mt-0.5" />
                      <span className="text-sm text-foreground leading-relaxed">{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Technical Indicators */}
            {indicators && Array.isArray(indicators) && indicators.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Technische Indicatoren</h4>
                <div className="flex flex-wrap gap-2">
                  {indicators.map((indicator, idx) => (
                    <Badge
                      key={idx}
                      variant="outline"
                      className="text-xs bg-muted/50 border-border/30"
                    >
                      {indicator}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Other Parameters */}
            {Object.keys(otherParams).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Overige Parameters</h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {Object.entries(otherParams).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/20"
                    >
                      <span className="text-xs font-medium capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="text-xs text-muted-foreground truncate ml-2">
                        {Array.isArray(value) ? value.join(', ') : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

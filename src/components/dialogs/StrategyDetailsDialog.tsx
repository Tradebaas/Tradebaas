import { Strategy } from '@/components/metrics/StrategiesPage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Info, CheckCircle } from '@phosphor-icons/react';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md h-[600px] max-h-[85vh] flex flex-col rounded-2xl">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">
              {strategy.name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs ${getTypeColor(strategy.type)} px-2 py-0.5`}
              >
                {getTypeLabel(strategy.type)}
              </Badge>
              {strategy.isBuiltIn && (
                <Badge
                  variant="outline"
                  className="text-xs bg-primary/10 text-primary border-primary/30 px-2 py-0.5"
                >
                  <CheckCircle className="w-3 h-3" />
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 mt-4">
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-accent" />
              Beschrijving
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {strategy.description}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Parameters</h4>
            <div className="space-y-2">
              {Object.entries(strategy.parameters).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 border border-border/20"
                >
                  <span className="text-sm capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from '@phosphor-icons/react';
import { AlertTriangle } from 'lucide-react';
import type { Position } from '@/lib/deribitClient';

interface ClosePositionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  position: Position | null;
  estimatedCost?: {
    grossPnL: number;
    totalFees: number;
    netPnL: number;
  };
  loading?: boolean;
}

export function ClosePositionConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  position,
  estimatedCost,
  loading = false,
}: ClosePositionConfirmDialogProps) {
  if (!position) return null;

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Positie Sluiten
          </DialogTitle>
          <DialogDescription>
            Je staat op het punt om je positie te sluiten. Deze actie kan niet ongedaan worden gemaakt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Instrument</span>
              <span className="text-sm font-medium">{position.instrument_name}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Richting</span>
              <span className={`text-sm font-bold uppercase ${
                position.direction === 'buy' ? 'text-success' : 'text-destructive'
              }`}>
                {position.direction === 'buy' ? 'LONG' : 'SHORT'}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Grootte</span>
              <span className="text-sm font-medium">{position.size.toFixed(4)} @ {position.leverage.toFixed(0)}x</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Entry Prijs</span>
              <span className="text-sm font-medium">${position.average_price.toFixed(2)}</span>
            </div>
          </div>

          {estimatedCost && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Bruto P&L</span>
                  <span className={`text-sm font-bold ${
                    estimatedCost.grossPnL >= 0 ? 'text-success' : 'text-destructive'
                  }`}>
                    ${estimatedCost.grossPnL.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Kosten (Fees)</span>
                  <span className="text-sm font-medium text-destructive">
                    -${estimatedCost.totalFees.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Netto P&L</span>
                  <span className={`text-lg font-bold ${
                    estimatedCost.netPnL >= 0 ? 'text-success' : 'text-destructive'
                  }`}>
                    ${estimatedCost.netPnL.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Dit bedrag ontvang je na sluiting
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Na sluiting worden alle gerelateerde orders (Stop Loss en Take Profit) automatisch geannuleerd.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Annuleren
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
            className="gap-2"
          >
            <X className="w-4 h-4" weight="bold" />
            {loading ? 'Sluiten...' : 'Sluit Positie'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Power } from '@phosphor-icons/react';
import { AlertTriangle } from 'lucide-react';

interface KillSwitchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  hasOpenPositions: boolean;
  openPositionsCount?: number;
  loading?: boolean;
}

export function KillSwitchConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  hasOpenPositions,
  openPositionsCount = 0,
  loading = false,
}: KillSwitchConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Power className="w-5 h-5" weight="bold" />
            Systeem Stoppen
          </DialogTitle>
          <DialogDescription>
            Je staat op het punt om het hele systeem te stoppen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {hasOpenPositions ? (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-destructive">
                    Let op: Je hebt {openPositionsCount} open positie{openPositionsCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Alle open posities worden automatisch gesloten met een market order. Alle gerelateerde orders (Stop Loss en Take Profit) worden geannuleerd.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-sm text-muted-foreground">
                Er zijn momenteel geen open posities. Het systeem wordt gestopt en alle monitoring wordt gepauzeerd.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Dit betekent:</p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li>Alle actieve strategieën worden gestopt</li>
              <li>Marktmonitoring wordt gepauzeerd</li>
              {hasOpenPositions && (
                <>
                  <li className="text-destructive font-medium">Alle open posities worden gesloten</li>
                  <li className="text-destructive font-medium">Alle open orders worden geannuleerd</li>
                </>
              )}
              <li>De verbinding met de broker blijft actief</li>
            </ul>
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
            <Power className="w-4 h-4" weight="bold" />
            {loading ? 'Stoppen...' : 'Stop Systeem'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

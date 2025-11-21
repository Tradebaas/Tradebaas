import { useState } from 'react';
import { useTradingStore } from '@/state/store';
import { Button } from '@/components/ui/button';
import { ErrorDetailsDialog, type ErrorLog } from '@/components/dialogs/ErrorDetailsDialog';
import { X } from '@phosphor-icons/react';
import { toast } from 'sonner';

interface TestTradeResult {
  orderId: string;
  instrumentName: string;
  entryPrice: number;
  amount: number;
  timestamp: number;
}

export function TestTradeCard() {
  const { connectionState, placeTestMicroOrder, errorLogs } = useTradingStore();
  const [isPlacing, setIsPlacing] = useState(false);
  const [lastTest, setLastTest] = useState<TestTradeResult | null>(null);
  const [lastError, setLastError] = useState<ErrorLog | null>(null);
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false);

  const isConnected = connectionState === 'Active';

  const handlePlaceTestOrder = async () => {
    setIsPlacing(true);
    setLastError(null);

    try {
      const result = await placeTestMicroOrder();
      setLastTest({
        orderId: result.orderId,
        instrumentName: result.instrumentName,
        entryPrice: result.entryPrice,
        amount: result.amount,
        timestamp: Date.now(),
      });

      toast.success('Test order placed', {
        description: `Entry: $${result.entryPrice.toFixed(2)} | Amount: ${result.amount} USD`,
      });
    } catch (err) {
      const errorWithLog = err as Error & { errorLog?: ErrorLog };
      const errorLog = errorWithLog.errorLog;

      if (errorLog) {
        setLastError(errorLog);
        
        toast.error('Test order failed', {
          description: errorLog.message,
        });
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to place test order';
        toast.error('Test order failed', {
          description: errorMessage,
        });
      }
    } finally {
      setIsPlacing(false);
    }
  };

  const handleViewErrorDetails = () => {
    if (lastError) {
      setErrorDetailsOpen(true);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <>
      <div className="space-y-4">
        {lastError && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30">
            <p className="text-xs text-destructive mb-2.5">{lastError.message}</p>
            <Button
              onClick={handleViewErrorDetails}
              size="sm"
              className="h-9 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground w-full rounded-lg"
            >
              Bekijk Details
            </Button>
          </div>
        )}

        <div className="p-3 rounded-xl bg-muted/20 border border-border/20">
          <p className="text-xs text-muted-foreground">
            Plaatst een kleine BTC_USDC-PERPETUAL order met stop loss en take profit. Sluit automatisch na 30 seconden.
          </p>
        </div>

        <Button
          onClick={handlePlaceTestOrder}
          disabled={!isConnected || isPlacing}
          className="w-full h-11 bg-accent hover:bg-accent/90 text-accent-foreground font-medium rounded-lg"
        >
          {isPlacing ? 'Order plaatsen...' : 'Test Order Plaatsen'}
        </Button>

        {lastTest && (
          <div className="p-3.5 rounded-xl bg-success/10 border border-success/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-success uppercase tracking-wide">Laatste Test</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-lg"
                onClick={() => setLastTest(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center p-2 rounded-lg bg-background/50">
                <span className="text-muted-foreground">Entry Prijs</span>
                <span className="font-semibold">${lastTest.entryPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg bg-background/50">
                <span className="text-muted-foreground">Hoeveelheid</span>
                <span className="font-semibold">{lastTest.amount} USD</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg bg-background/50">
                <span className="text-muted-foreground">Tijdstip</span>
                <span className="font-semibold">{formatTimestamp(lastTest.timestamp)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <ErrorDetailsDialog
        open={errorDetailsOpen}
        onOpenChange={setErrorDetailsOpen}
        error={lastError}
      />
    </>
  );
}

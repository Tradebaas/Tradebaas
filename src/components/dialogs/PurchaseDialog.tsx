import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { backendClient } from '@/lib/backend-client';
import { ShoppingCart, CheckCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

interface PurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  onSuccess?: () => void;
}

export function PurchaseDialog({ 
  open, 
  onOpenChange, 
  productId, 
  productName,
  onSuccess 
}: PurchaseDialogProps) {
  const [receipt, setReceipt] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleVerify = async () => {
    if (!receipt.trim()) {
      setError('Please enter a receipt');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const response = await backendClient.verifyReceipt(receipt, productId);

      if (response.valid) {
        setSuccess(true);
        toast.success('Purchase verified successfully!');
        
        if (onSuccess) {
          onSuccess();
        }

        setTimeout(() => {
          onOpenChange(false);
          setSuccess(false);
          setReceipt('');
        }, 2000);
      } else {
        setError(response.error || 'Receipt verification failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    if (!isVerifying) {
      onOpenChange(false);
      setReceipt('');
      setError(null);
      setSuccess(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Purchase {productName}
          </DialogTitle>
          <DialogDescription>
            Enter your App Store receipt to verify your purchase
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {error && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/30 rounded-xl">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-success/10 border-success/30 rounded-xl">
              <AlertDescription className="text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Purchase verified! Entitlement granted.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="receipt" className="text-xs text-muted-foreground">
              App Store Receipt
            </Label>
            <Input
              id="receipt"
              type="text"
              placeholder="receipt_..."
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
              disabled={isVerifying || success}
              className="bg-muted/30 border-border/50 rounded-lg"
            />
            <p className="text-xs text-muted-foreground">
              For testing, use format: receipt_test_basic_20240101
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1 rounded-lg"
              disabled={isVerifying}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerify}
              className="flex-1 rounded-lg"
              disabled={isVerifying || success || !receipt.trim()}
            >
              {isVerifying ? 'Verifying...' : success ? 'Verified!' : 'Verify Purchase'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

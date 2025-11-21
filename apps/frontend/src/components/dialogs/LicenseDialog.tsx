import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { licenseService, Tier, Product } from '@/lib/license-service';
import { useLicense } from '@/hooks/use-license';
import { PurchaseDialog } from '@/components/dialogs/PurchaseDialog';
import { PrivacyPolicyDialog } from '@/components/dialogs/PrivacyPolicyDialog';
import { CreditCard, ShieldCheck, Clock, Crown, ArrowCounterClockwise, ShieldStar } from '@phosphor-icons/react';
import { toast } from 'sonner';

interface LicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LicenseDialog({ open, onOpenChange }: LicenseDialogProps) {
  const { entitlement, refreshEntitlement } = useLicense();
  const [isOwner, setIsOwner] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantTier, setGrantTier] = useState<Tier>('basic');
  const [grantDuration, setGrantDuration] = useState('30');
  const [verifyReceipt, setVerifyReceipt] = useState('');
  const [verifyProductId, setVerifyProductId] = useState('');
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    const checkOwner = async () => {
      const user = await window.spark.user();
      if (user && typeof user.isOwner === 'boolean') {
        setIsOwner(user.isOwner);
      } else {
        setIsOwner(false);
      }
    };
    checkOwner();
    setProducts(licenseService.getProducts());
  }, []);

  const handleGrantEntitlement = async () => {
    try {
      const duration = grantDuration === 'lifetime' ? null : parseInt(grantDuration);
      await licenseService.grantEntitlement(grantUserId, grantTier, duration);
      toast.success('Entitlement granted successfully');
      setGrantUserId('');
      await refreshEntitlement();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to grant entitlement');
    }
  };

  const handleVerifyReceipt = async () => {
    try {
      const result = await licenseService.verifyReceipt({
        receipt: verifyReceipt,
        productId: verifyProductId,
      });

      if (result.valid) {
        toast.success('Receipt verified successfully');
        await refreshEntitlement();
      } else {
        toast.error(result.error || 'Receipt verification failed');
      }
      setVerifyReceipt('');
      setVerifyProductId('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to verify receipt');
    }
  };

  const handlePurchase = (product: Product) => {
    setSelectedProduct(product);
    setPurchaseDialogOpen(true);
  };

  const handleRestorePurchases = async () => {
    try {
      setIsRestoring(true);
      await licenseService.restorePurchases();
      await refreshEntitlement();
      toast.success('Aankopen hersteld');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kon aankopen niet herstellen');
    } finally {
      setIsRestoring(false);
    }
  };

  const getTierColor = (tier: Tier) => {
    switch (tier) {
      case 'free':
        return 'bg-muted text-muted-foreground';
      case 'basic':
        return 'bg-accent text-accent-foreground';
      case 'premium':
        return 'bg-warning text-warning-foreground';
      case 'enterprise':
        return 'bg-success text-success-foreground';
    }
  };

  const getTierIcon = (tier: Tier) => {
    switch (tier) {
      case 'free':
        return <ShieldCheck className="w-4 h-4" />;
      case 'basic':
        return <CreditCard className="w-4 h-4" />;
      case 'premium':
        return <Clock className="w-4 h-4" />;
      case 'enterprise':
        return <Crown className="w-4 h-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md h-[600px] max-h-[85vh] flex flex-col rounded-2xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>License & Entitlements</DialogTitle>
          <DialogDescription>
            Manage your subscription tier and access level
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="status" className="w-full flex-1 flex flex-col overflow-hidden">
          <TabsList className={`grid w-full ${isOwner ? 'grid-cols-3' : 'grid-cols-2'} bg-muted/30 p-1 gap-1 flex-shrink-0 rounded-xl`}>
            <TabsTrigger value="status" className="rounded-lg">Status</TabsTrigger>
            <TabsTrigger value="products" className="rounded-lg">Products</TabsTrigger>
            {isOwner && <TabsTrigger value="admin" className="rounded-lg">Admin</TabsTrigger>}
          </TabsList>

          <TabsContent value="status" className="space-y-4 mt-4 overflow-y-auto flex-1">
            <Card className="rounded-xl border-border/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {entitlement && getTierIcon(entitlement.tier)}
                  Current Entitlement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Tier</span>
                  {entitlement && (
                    <Badge className={`${getTierColor(entitlement.tier)} px-2.5 py-0.5`}>
                      {entitlement.tier.toUpperCase()}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={entitlement?.isActive ? 'default' : 'destructive'} className="px-2.5 py-0.5">
                    {entitlement?.isActive ? 'Active' : 'Expired'}
                  </Badge>
                </div>

                {entitlement?.expiry && (
                  <>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">Expires</span>
                      <span className="text-sm font-medium">
                        {new Date(entitlement.expiry).toLocaleDateString()}
                      </span>
                    </div>

                    {entitlement.daysRemaining !== null && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-muted-foreground">Days remaining</span>
                        <span className="text-sm font-medium">{entitlement.daysRemaining}</span>
                      </div>
                    )}
                  </>
                )}

                {!entitlement?.expiry && entitlement?.tier !== 'free' && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">Duration</span>
                    <span className="text-sm font-medium">Lifetime</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-4 mt-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-2 mb-4 flex-shrink-0">
              <Button
                onClick={handleRestorePurchases}
                disabled={isRestoring}
                size="sm"
                variant="outline"
                className="rounded-lg h-9"
              >
                <ArrowCounterClockwise className="w-4 h-4 mr-2" />
                {isRestoring ? 'Restoring...' : 'Restore'}
              </Button>
              <Button
                onClick={() => setPrivacyDialogOpen(true)}
                size="sm"
                variant="outline"
                className="rounded-lg h-9"
              >
                <ShieldStar className="w-4 h-4 mr-2" />
                Privacy
              </Button>
            </div>

            {products.map((product) => (
              <Card key={product.id} className="rounded-xl border-border/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {getTierIcon(product.tier)}
                      {product.name}
                    </CardTitle>
                    <Badge className={`${getTierColor(product.tier)} px-2.5 py-0.5 text-xs`}>
                      {product.tier.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    ${product.price} / {product.duration} days
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    onClick={() => handlePurchase(product)}
                    size="sm"
                    variant="default"
                    className="w-full rounded-lg h-9"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Purchase
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {isOwner && (
            <TabsContent value="admin" className="space-y-4 mt-4 overflow-y-auto flex-1">
              <Card className="rounded-xl border-border/20">
                <CardHeader>
                  <CardTitle className="text-base">Grant Entitlement</CardTitle>
                  <CardDescription className="text-xs">Manually grant access to a user</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="userId" className="text-xs text-muted-foreground">User ID</Label>
                    <Input
                      id="userId"
                      value={grantUserId}
                      onChange={(e) => setGrantUserId(e.target.value)}
                      placeholder="Enter user ID"
                      className="h-9 rounded-lg bg-muted/30 border-border/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tier" className="text-xs text-muted-foreground">Tier</Label>
                    <Select value={grantTier} onValueChange={(value) => setGrantTier(value as Tier)}>
                      <SelectTrigger id="tier" className="h-9 rounded-lg bg-muted/30 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="premium">Premium</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration" className="text-xs text-muted-foreground">Duration (days)</Label>
                    <Select value={grantDuration} onValueChange={setGrantDuration}>
                      <SelectTrigger id="duration" className="h-9 rounded-lg bg-muted/30 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="365">365 days</SelectItem>
                        <SelectItem value="lifetime">Lifetime</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleGrantEntitlement} className="w-full h-9 rounded-lg">
                    Grant Entitlement
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-border/20">
                <CardHeader>
                  <CardTitle className="text-base">Verify Receipt</CardTitle>
                  <CardDescription className="text-xs">Verify an Apple IAP receipt</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="receipt" className="text-xs text-muted-foreground">Receipt Data</Label>
                    <Input
                      id="receipt"
                      value={verifyReceipt}
                      onChange={(e) => setVerifyReceipt(e.target.value)}
                      placeholder="receipt_..."
                      className="h-9 rounded-lg bg-muted/30 border-border/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="productId" className="text-xs text-muted-foreground">Product ID</Label>
                    <Select value={verifyProductId} onValueChange={setVerifyProductId}>
                      <SelectTrigger id="productId" className="h-9 rounded-lg bg-muted/30 border-border/50">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleVerifyReceipt} className="w-full h-9 rounded-lg">
                    Verify Receipt
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>

      {selectedProduct && (
        <PurchaseDialog
          open={purchaseDialogOpen}
          onOpenChange={setPurchaseDialogOpen}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          onSuccess={refreshEntitlement}
        />
      )}

      <PrivacyPolicyDialog
        open={privacyDialogOpen}
        onOpenChange={setPrivacyDialogOpen}
      />
    </Dialog>
  );
}

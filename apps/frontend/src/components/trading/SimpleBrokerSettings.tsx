import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, EyeSlash, CheckCircle, XCircle } from '@phosphor-icons/react';
import { getBackendStatus, connectBackend, disconnectBackend, type BackendStatus } from '@/lib/backend-status';
import { toast } from 'sonner';

interface SimpleBrokerSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SimpleBrokerSettings({ open, onOpenChange }: SimpleBrokerSettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [environment, setEnvironment] = useState<'live' | 'testnet'>('testnet');
  const [status, setStatus] = useState<BackendStatus>({ connected: false, environment: 'testnet' });

  // Poll backend status
  useEffect(() => {
    if (!open) return;

    const fetchStatus = async () => {
      const backendStatus = await getBackendStatus();
      setStatus(backendStatus);
      setEnvironment(backendStatus.environment);
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    return () => clearInterval(interval);
  }, [open]);

  const handleConnect = async () => {
    if (!apiKey || !apiSecret) {
      toast.error('Voer API key en secret in');
      return;
    }

    setIsConnecting(true);

    try {
      const result = await connectBackend(apiKey, apiSecret, environment);
      
      if (result.success) {
        toast.success('Verbonden met Deribit!');
        const newStatus = await getBackendStatus();
        setStatus(newStatus);
      } else {
        toast.error(result.error || 'Verbinding mislukt');
      }
    } catch (error: any) {
      toast.error(error.message || 'Onbekende fout');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectBackend();
    toast.success('Verbinding verbroken');
    const newStatus = await getBackendStatus();
    setStatus(newStatus);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Broker Instellingen</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Connection Status */}
          <Alert className={status.connected ? 'bg-green-500/10 border-green-500/20' : 'bg-gray-500/10'}>
            <div className="flex items-center gap-2">
              {status.connected ? (
                <CheckCircle className="h-5 w-5 text-green-500" weight="fill" />
              ) : (
                <XCircle className="h-5 w-5 text-gray-500" />
              )}
              <AlertDescription>
                {status.connected ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Verbonden met Deribit ({status.environment})
                  </span>
                ) : (
                  <span className="text-gray-600 dark:text-gray-400">
                    Niet verbonden
                  </span>
                )}
              </AlertDescription>
            </div>
          </Alert>

          {/* API Credentials */}
          {!status.connected && (
            <>
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Voer je Deribit API key in"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <div className="relative">
                  <Input
                    id="apiSecret"
                    type={showSecret ? 'text' : 'password'}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="Voer je Deribit API secret in"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {showSecret ? <EyeSlash className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Environment Toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="environment">Omgeving</Label>
                <div className="flex items-center gap-2">
                  <span className={environment === 'testnet' ? 'font-medium' : 'text-gray-500'}>
                    Testnet
                  </span>
                  <Switch
                    id="environment"
                    checked={environment === 'live'}
                    onCheckedChange={(checked) => setEnvironment(checked ? 'live' : 'testnet')}
                  />
                  <span className={environment === 'live' ? 'font-medium text-red-500' : 'text-gray-500'}>
                    Live
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {status.connected ? (
              <Button
                onClick={handleDisconnect}
                variant="destructive"
                className="flex-1"
              >
                Verbreek Verbinding
              </Button>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={isConnecting || !apiKey || !apiSecret}
                className="flex-1"
              >
                {isConnecting ? 'Verbinden...' : 'Verbinden'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

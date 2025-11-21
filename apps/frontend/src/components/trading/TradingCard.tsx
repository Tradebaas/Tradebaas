import { useState, useEffect } from 'react';
import { useTradingStore } from '@/state/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusPill } from '@/components/layout/StatusPill';
import { Eye, EyeSlash } from '@phosphor-icons/react';

interface TradingCardProps {
  onStatusClick: () => void;
}

export function TradingCard({ onStatusClick }: TradingCardProps) {
  const {
    connectionState,
    environment,
    credentials,
    error,
    setEnvironment,
    connect,
    disconnect,
    loadSavedCredentials,
    clearError,
  } = useTradingStore();

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    loadSavedCredentials();
  }, [loadSavedCredentials]);

  useEffect(() => {
    if (credentials) {
      setApiKey(credentials.apiKey);
      setApiSecret(credentials.apiSecret);
    }
  }, [credentials]);

  const handleConnect = async () => {
    if (!apiKey || !apiSecret) {
      return;
    }

    setIsConnecting(true);
    clearError();

    try {
      await connect({ apiKey, apiSecret });
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const handleEnvironmentToggle = (checked: boolean) => {
    setEnvironment(checked ? 'testnet' : 'live');
  };

  const isConnected = connectionState === 'Analyzing' || connectionState === 'Active';

  return (
    <div className="glass-card rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">Verbinding</h2>
        <button
          onClick={onStatusClick}
          className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted/30 transition-colors"
        >
          <StatusPill state={connectionState} />
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/50 py-2">
          <AlertDescription className="text-xs">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="api-key" className="text-xs">
            API key
          </Label>
          <Input
            id="api-key"
            type="text"
            placeholder="Voer je Deribit API key in"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isConnected}
            className="text-sm bg-background/50 border-input"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="api-secret" className="text-xs">
            API secret
          </Label>
          <div className="relative">
            <Input
              id="api-secret"
              type={showSecret ? 'text' : 'password'}
              placeholder="Voer je Deribit API secret in"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              disabled={isConnected}
              className="text-sm bg-background/50 border-input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              disabled={isConnected}
            >
              {showSecret ? (
                <EyeSlash className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between py-1">
          <Label htmlFor="testnet-toggle" className="text-xs cursor-pointer">
            Gebruik testnet
          </Label>
          <Switch
            id="testnet-toggle"
            checked={environment === 'testnet'}
            onCheckedChange={handleEnvironmentToggle}
            disabled={isConnected}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        {!isConnected ? (
          <Button
            onClick={handleConnect}
            disabled={!apiKey || !apiSecret || isConnecting}
            className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
            size="sm"
          >
            {isConnecting ? 'Verbinden...' : 'Verbinden'}
          </Button>
        ) : (
          <Button
            onClick={handleDisconnect}
            variant="outline"
            className="flex-1"
            size="sm"
          >
            Verbreek verbinding
          </Button>
        )}
      </div>
    </div>
  );
}
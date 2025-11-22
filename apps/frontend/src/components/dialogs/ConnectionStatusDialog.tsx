import { getBackendUrl } from '@/lib/backend-url';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, Clock } from '@phosphor-icons/react';

interface ConnectionStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RealTimeConnectionStatus {
  connected: boolean;
  environment: 'live' | 'testnet';
  broker: string;
  connectedAt?: number;
  uptime: number;
  websocket: {
    connected: boolean;
    authenticated: boolean;
    lastPing: number;
  };
  health: {
    strategies: number;
    errors: number;
  };
  timestamp: number;
}

export function ConnectionStatusDialog({ open, onOpenChange }: ConnectionStatusDialogProps) {
  const [status, setStatus] = useState<RealTimeConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    console.log('[ConnectionStatusDialog] Starting real-time status polling...');
    
    const pollStatus = async () => {
      try {
        // Dynamic backend URL - uses same host as frontend
        const backendUrl = getBackendUrl();
        
        // Get JWT token for authenticated requests
        const token = localStorage.getItem('tradebaas:auth-token');
        const headers: HeadersInit = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`${backendUrl}/api/connection/status`, {
          headers,
        });
        const data = await response.json();
        
        if (data.success) {
          setStatus(data);
          setError(null);
        } else {
          setError(data.error || 'Failed to get status');
        }
        setLoading(false);
      } catch (err) {
        console.error('[ConnectionStatusDialog] Status poll failed:', err);
        setError(err instanceof Error ? err.message : 'Network error');
        setLoading(false);
      }
    };

    // Poll immediately, then every second for real-time updates
    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    
    return () => {
      clearInterval(interval);
      console.log('[ConnectionStatusDialog] Stopped real-time status polling');
    };
  }, [open]);

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Verbindingsstatus</DialogTitle>
          </DialogHeader>
          <div className="p-4 text-center">
            <Clock className="w-6 h-6 mx-auto mb-2 animate-spin" />
            <div className="text-sm text-muted-foreground">Status wordt geladen...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isHealthy = status?.connected && status?.websocket?.connected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Verbindingsstatus</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-xs text-muted-foreground leading-relaxed">
            Dit overzicht toont de status van de verbinding met de Deribit exchange. 
            De WebSocket is de real-time dataverbinding voor prijzen en orders. 
            Uptime geeft aan hoe lang de huidige verbinding actief is.
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center p-2 rounded-lg bg-muted/20">
              <span className="text-muted-foreground">Omgeving</span>
              <span className="font-medium capitalize">{status?.environment || 'Unknown'}</span>
            </div>

            <div className="flex justify-between items-center p-2 rounded-lg bg-muted/20">
              <span className="text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                {isHealthy ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="font-medium">{isHealthy ? 'Actief' : 'Gesloten'}</span>
              </div>
            </div>

            <div className="flex justify-between items-center p-2 rounded-lg bg-muted/20">
              <span className="text-muted-foreground">WebSocket</span>
              <div className="flex items-center gap-2">
                {status?.websocket?.connected ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="font-medium">{status?.websocket?.connected ? 'Open' : 'Gesloten'}</span>
              </div>
            </div>

            <div className="flex justify-between items-center p-2 rounded-lg bg-muted/20">
              <span className="text-muted-foreground">Authenticatie</span>
              <div className="flex items-center gap-2">
                {status?.websocket?.authenticated ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="font-medium">{status?.websocket?.authenticated ? 'Ja' : 'Nee'}</span>
              </div>
            </div>

            {isHealthy && status?.uptime !== undefined && (
              <div className="flex justify-between items-center p-2 rounded-lg bg-muted/20">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Uptime
                </span>
                <span className="font-medium">{formatUptime(status.uptime)}</span>
              </div>
            )}

            {status?.health && (
              <div className="flex justify-between items-center p-2 rounded-lg bg-muted/20">
                <span className="text-muted-foreground">Actieve Strategieën</span>
                <span className="font-medium">{status.health.strategies}</span>
              </div>
            )}
          </div>

          {status && (
            <div className="text-xs text-muted-foreground text-center">
              Laatste update: {new Date(status.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

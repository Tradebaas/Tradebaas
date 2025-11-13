import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Copy, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { ErrorLog } from '@/types/shared';

// Re-export for backward compatibility
export type { ErrorLog };

interface ErrorDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error: ErrorLog | null;
}

export function ErrorDetailsDialog({ open, onOpenChange, error }: ErrorDetailsDialogProps) {
  if (!error) return null;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Gekopieerd naar klembord');
    } catch (err) {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Gekopieerd naar klembord');
    }
  };

  const copyFullError = () => {
    const fullError = JSON.stringify(error, null, 2);
    copyToClipboard(fullError);
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10 flex-shrink-0">
              <Warning className="w-5 h-5 text-destructive" weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-medium">Error Details</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Debugging informatie en context
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
                <Badge variant="destructive" className="font-mono text-xs">
                  {error.errorType}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatTimestamp(error.timestamp)}
                </span>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Error Melding</h3>
                <div className="rounded-xl p-4 bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive font-medium leading-relaxed">{error.message}</p>
                </div>
              </div>

              {error.context && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Context</h3>
                  <div className="rounded-xl p-4 bg-card border border-border/50 space-y-3">
                    {Object.entries(error.context).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <span className="text-xs text-muted-foreground capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <div className="text-sm font-medium font-mono">{String(value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error.requestDetails && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Request Details</h3>
                  <div className="rounded-xl p-4 bg-card border border-border/50 space-y-3">
                    {error.requestDetails.method && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Methode</span>
                        <div className="text-sm font-medium font-mono">{error.requestDetails.method}</div>
                      </div>
                    )}
                    {error.requestDetails.params && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Parameters</span>
                        <pre className="text-xs bg-muted/30 p-3 rounded-lg font-mono whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(error.requestDetails.params, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {error.apiResponse && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">API Response</h3>
                  <div className="rounded-xl p-4 bg-card border border-border/50 space-y-3">
                    {error.apiResponse.statusCode && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Statuscode</span>
                        <Badge variant="outline" className="font-mono">
                          {error.apiResponse.statusCode}
                        </Badge>
                      </div>
                    )}
                    {error.apiResponse.errorCode && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Errorcode</span>
                        <Badge variant="outline" className="font-mono">
                          {error.apiResponse.errorCode}
                        </Badge>
                      </div>
                    )}
                    {error.apiResponse.data && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Response Data</span>
                        <pre className="text-xs bg-muted/30 p-3 rounded-lg font-mono whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(error.apiResponse.data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {error.stack && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Stack Trace</h3>
                  <div className="rounded-xl p-4 bg-card border border-border/50">
                    <pre className="text-xs bg-muted/30 p-3 rounded-lg font-mono whitespace-pre-wrap overflow-x-auto">
                      {error.stack}
                    </pre>
                  </div>
                </div>
              )}

              <Separator className="my-3" />

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Volledig Error Object</h3>
                <div className="rounded-xl p-4 bg-card border border-border/50">
                  <pre className="text-xs bg-muted/30 p-3 rounded-lg font-mono whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(error, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border/30 flex-shrink-0 bg-background/95 backdrop-blur-sm">
          <Button
            onClick={copyFullError}
            variant="default"
            size="sm"
            className="flex-1"
          >
            <Copy className="w-4 h-4 mr-2" />
            Kopieer Error
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            Sluiten
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

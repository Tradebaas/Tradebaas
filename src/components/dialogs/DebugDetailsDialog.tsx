import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Copy, CheckCircle, XCircle, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';

export interface DebugStep {
  id: string;
  label: string;
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  message?: string;
  details?: Record<string, unknown>;
  timestamp?: number;
}

export interface DebugInfo {
  title: string;
  description?: string;
  success: boolean;
  steps: DebugStep[];
  rawResponse?: unknown;
  suggestions?: string[];
}

interface DebugDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debugInfo: DebugInfo | null;
}

export function DebugDetailsDialog({ open, onOpenChange, debugInfo }: DebugDetailsDialogProps) {
  if (!debugInfo) return null;

  const handleCopyDetails = () => {
    const debugText = JSON.stringify(debugInfo, null, 2);
    navigator.clipboard.writeText(debugText);
    toast.success('Debug informatie gekopieerd naar klembord');
  };

  const getStatusIcon = (status: DebugStep['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-success" weight="fill" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-destructive" weight="fill" />;
      case 'warning':
        return <Warning className="w-5 h-5 text-warning" weight="fill" />;
      case 'pending':
        return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 animate-pulse" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-accent" />;
    }
  };

  const getStatusColor = (status: DebugStep['status']) => {
    switch (status) {
      case 'success':
        return 'border-success/20 bg-success/5';
      case 'error':
        return 'border-destructive/20 bg-destructive/5';
      case 'warning':
        return 'border-warning/20 bg-warning/5';
      default:
        return 'border-border/20 bg-muted/10';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl h-[85vh] p-0 gap-0 rounded-2xl flex flex-col">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-border/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span className="flex-shrink-0">
                  {debugInfo.success ? (
                    <CheckCircle className="w-5 h-5 text-success" weight="fill" />
                  ) : (
                    <XCircle className="w-5 h-5 text-destructive" weight="fill" />
                  )}
                </span>
                <span className="break-words">{debugInfo.title}</span>
              </DialogTitle>
              {debugInfo.description && (
                <DialogDescription className="mt-2 break-words">
                  {debugInfo.description}
                </DialogDescription>
              )}
            </div>
            <Badge 
              variant={debugInfo.success ? 'default' : 'destructive'}
              className="flex-shrink-0"
            >
              {debugInfo.success ? 'Geslaagd' : 'Mislukt'}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
          <div className="space-y-4 p-6">
            {/* Steps */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Verbindingsstappen</h3>
              {debugInfo.steps.map((step, index) => (
                <div
                  key={step.id}
                  className={`p-4 rounded-xl border ${getStatusColor(step.status)} transition-colors`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getStatusIcon(step.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium">
                          {index + 1}. {step.label}
                        </h4>
                        {step.timestamp && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(step.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      {step.message && (
                        <p className="text-sm text-muted-foreground mt-1 break-words whitespace-pre-wrap overflow-wrap-anywhere">
                          {step.message}
                        </p>
                      )}
                      {step.details && Object.keys(step.details).length > 0 && (
                        <div className="mt-3 p-3 rounded-lg bg-background/50 border border-border/10 overflow-hidden">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Details:</p>
                          <div className="space-y-2">
                            {Object.entries(step.details).map(([key, value]) => (
                              <div key={key} className="flex flex-col gap-1 text-xs min-w-0">
                                <span className="text-muted-foreground font-medium break-words">
                                  {key}:
                                </span>
                                <span className="text-foreground font-mono text-[11px] break-all pl-3 overflow-wrap-anywhere whitespace-pre-wrap">
                                  {typeof value === 'object' 
                                    ? JSON.stringify(value, null, 2)
                                    : String(value)
                                  }
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Suggestions */}
            {debugInfo.suggestions && debugInfo.suggestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Suggesties</h3>
                <Alert className="bg-accent/10 border-accent/20">
                  <AlertDescription>
                    <ul className="space-y-2 text-sm">
                      {debugInfo.suggestions.map((suggestion, index) => (
                        <li key={index} className="flex items-start gap-2 min-w-0">
                          {suggestion.trim() !== '' && (
                            <>
                              <span className="text-accent font-bold mt-0.5 flex-shrink-0">•</span>
                              <span className="break-words overflow-wrap-anywhere whitespace-pre-wrap flex-1 min-w-0">
                                {suggestion}
                              </span>
                            </>
                          )}
                          {suggestion.trim() === '' && (
                            <span className="h-2 w-full" />
                          )}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Raw Response (for advanced debugging) */}
            {debugInfo.rawResponse && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Technische Details</h3>
                <div className="p-4 rounded-xl bg-muted/10 border border-border/20 overflow-auto max-w-full">
                  <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all overflow-wrap-anywhere max-w-full">
                    {JSON.stringify(debugInfo.rawResponse, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-border/20 flex-shrink-0">
          <Button
            onClick={handleCopyDetails}
            variant="outline"
            className="flex-1 rounded-lg"
          >
            <Copy className="w-4 h-4 mr-2" />
            Kopieer Details
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="flex-1 bg-accent hover:bg-accent/90 rounded-lg"
          >
            Sluiten
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

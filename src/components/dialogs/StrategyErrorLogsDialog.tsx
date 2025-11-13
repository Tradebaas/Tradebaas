import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Warning, Trash, Eye } from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { ErrorLog } from '@/components/dialogs/ErrorDetailsDialog';
import { useState } from 'react';
import { ErrorDetailsDialog } from '@/components/dialogs/ErrorDetailsDialog';

interface StrategyErrorLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorLogs: ErrorLog[];
  onClearLogs: () => void;
}

export function StrategyErrorLogsDialog({ 
  open, 
  onOpenChange, 
  errorLogs,
  onClearLogs,
}: StrategyErrorLogsDialogProps) {
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleViewDetails = (error: ErrorLog) => {
    setSelectedError(error);
    setDetailsDialogOpen(true);
  };

  const handleClearLogs = () => {
    onClearLogs();
    toast.success('Error logs gewist');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} modal>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 flex-shrink-0 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Warning className="w-4 h-4 sm:w-5 sm:h-5 text-destructive flex-shrink-0" weight="fill" />
                <DialogTitle className="text-sm sm:text-base">Strategy Error Logs</DialogTitle>
                <Badge variant="outline" className="ml-2">
                  {errorLogs.length}
                </Badge>
              </div>
              {errorLogs.length > 0 && (
                <Button
                  onClick={handleClearLogs}
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash className="w-4 h-4 mr-2" />
                  Wis alle logs
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Alle errors tijdens strategy uitvoering met details voor debugging
            </p>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4 sm:px-6 py-4">
              {errorLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 rounded-full bg-muted/30 mb-4">
                    <Warning className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Geen errors gevonden
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Alle strategy errors verschijnen hier
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {errorLogs.map((error) => (
                    <div
                      key={error.id}
                      className="glass-card rounded-lg p-4 hover:bg-card/60 transition-colors border border-border/30"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="destructive" className="font-mono text-xs">
                              {error.errorType}
                            </Badge>
                            {error.context?.action && (
                              <Badge variant="outline" className="text-xs">
                                {error.context.action}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatTimestamp(error.timestamp)}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleViewDetails(error)}
                          variant="ghost"
                          size="sm"
                          className="flex-shrink-0"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Details
                        </Button>
                      </div>

                      <p className="text-sm text-destructive font-medium break-words overflow-wrap-anywhere mb-3">
                        {error.message}
                      </p>

                      {error.context && Object.keys(error.context).length > 0 && (
                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/20">
                          {Object.entries(error.context)
                            .filter(([key]) => key !== 'action')
                            .slice(0, 4)
                            .map(([key, value]) => (
                              <div key={key} className="flex flex-col gap-0.5">
                                <span className="text-xs text-muted-foreground capitalize">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                                <span className="text-xs font-medium font-mono truncate">
                                  {String(value)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-border flex-shrink-0">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              size="sm"
              className="w-full"
            >
              Sluiten
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ErrorDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        error={selectedError}
      />
    </>
  );
}

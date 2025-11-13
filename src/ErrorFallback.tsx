import { Button } from "./components/ui/button";
import { Warning, ArrowsClockwise } from "@phosphor-icons/react";

export const ErrorFallback = ({ error, resetErrorBoundary }) => {
  if (import.meta.env.DEV) throw error;

  const is429 = error?.message?.includes('429') || error?.message?.includes('rate limit');
  const isBackendError = error?.message?.includes('Backend') || error?.message?.includes('fetch');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="relative overflow-hidden rounded-xl border-2 border-destructive/60 bg-gradient-to-br from-destructive/15 via-destructive/10 to-destructive/5 shadow-2xl mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-destructive/5 to-transparent animate-pulse-glow" />
          
          <div className="relative p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0">
                <div className="relative">
                  <div className="absolute inset-0 bg-destructive/30 rounded-full blur-lg animate-pulse" />
                  <Warning className="relative w-8 h-8 text-destructive" weight="fill" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-destructive mb-2">
                  {is429 ? 'Te veel verzoeken' : isBackendError ? 'Verbindingsfout' : 'Runtime Error'}
                </h2>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  {is429 
                    ? 'De app heeft tijdelijk te veel verzoeken gedaan. Wacht enkele seconden en probeer opnieuw.'
                    : isBackendError
                    ? 'Kan geen verbinding maken met de backend service. Controleer je internetverbinding en probeer opnieuw.'
                    : 'Er is een onverwachte fout opgetreden. Probeer de app opnieuw te starten.'
                  }
                </p>
              </div>
            </div>

            {!is429 && !isBackendError && (
              <div className="bg-background/60 backdrop-blur-sm border border-destructive/30 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-xs text-muted-foreground mb-2 uppercase tracking-wide">Error Details</h3>
                <pre className="text-xs text-destructive bg-muted/30 p-3 rounded-md border border-destructive/20 overflow-auto max-h-32 font-mono">
                  {error.message}
                </pre>
              </div>
            )}
          </div>
        </div>
        
        <Button 
          onClick={resetErrorBoundary} 
          className="w-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
          size="lg"
        >
          <ArrowsClockwise className="w-5 h-5" />
          {is429 ? 'Probeer opnieuw (wacht 5 sec)' : 'Probeer opnieuw'}
        </Button>
      </div>
    </div>
  );
}

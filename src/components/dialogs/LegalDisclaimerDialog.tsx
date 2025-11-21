import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WarningCircle, CaretDown, CaretUp } from '@phosphor-icons/react';

interface LegalDisclaimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  onDecline?: () => void;
}

export function LegalDisclaimerDialog({ open, onOpenChange, onAccept, onDecline }: LegalDisclaimerDialogProps) {
  const [expanded, setExpanded] = useState(false);

  const handleAccept = () => {
    onAccept();
    onOpenChange(false);
  };

  const handleDecline = () => {
    if (onDecline) {
      onDecline();
    }
    onOpenChange(false);
  };

  const handleClose = () => {
    handleDecline();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose} modal={true}>
      <DialogContent className="max-w-md flex flex-col gap-4" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg flex items-center gap-2">
            <WarningCircle className="w-5 h-5 text-destructive" />
            Risicowaarschuwing
          </DialogTitle>
          <DialogDescription className="text-xs">
            U moet akkoord gaan om de trade functionaliteit te gebruiken
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
            <WarningCircle className="h-4 w-4" />
            <AlertDescription className="text-xs font-medium">
              Handelen in crypto-derivaten houdt aanzienlijke risico's in. U kunt uw volledige investering verliezen.
            </AlertDescription>
          </Alert>

          <p className="text-muted-foreground text-xs">
            Deze applicatie gebruikt geautomatiseerde handelsstrategieën met externe API's. 
            Er worden geen garanties gegeven over prestaties of winstgevendheid. 
            Gebruik is volledig op eigen risico.
          </p>

          {expanded && (
            <ScrollArea className="h-[300px] -mx-6 px-6">
              <div className="space-y-3 text-xs pr-4">
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Handelsrisico's</h3>
                  <p className="text-muted-foreground">
                    Handelen in cryptocurrencies, futures, opties en andere derivaten is speculatief en brengt een hoog risico met zich mee. 
                    Deze applicatie is bedoeld voor ervaren handelaren die de risico's begrijpen.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-1">Geen Financieel Advies</h3>
                  <p className="text-muted-foreground">
                    Tradebaas biedt geen beleggingsadvies, aanbevelingen of suggesties over het kopen, verkopen of aanhouden van 
                    financiële instrumenten. Alle handelsbeslissingen worden op eigen risico genomen.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-1">Technische Risico's</h3>
                  <p className="text-muted-foreground">
                    Deze applicatie maakt gebruik van API-verbindingen met externe handelsbeurzen. Netwerkproblemen, API-uitval, 
                    softwarefouten of onverwacht gedrag kunnen leiden tot onbedoelde handelstransacties of verlies van kapitaal.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-1">Automatische Handel</h3>
                  <p className="text-muted-foreground">
                    Geautomatiseerde handelsstrategieën werken zonder menselijke tussenkomst. Hoewel deze strategieën zijn ontworpen 
                    met risicobeheer, kunnen marktomstandigheden leiden tot onverwachte verliezen. Monitor uw posities actief.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-1">API Beveiliging</h3>
                  <p className="text-muted-foreground">
                    Uw API-sleutels geven toegang tot uw handelsrekening. Bewaar deze veilig en gebruik alleen API-sleutels met 
                    beperkte rechten (geen withdrawal rechten). De ontwikkelaars hebben nooit toegang tot uw API-sleutels.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-1">Geen Garanties</h3>
                  <p className="text-muted-foreground">
                    Deze software wordt geleverd "as is" zonder enige garantie. Er is geen garantie op prestaties, uptime, 
                    winstgevendheid of geschiktheid voor een bepaald doel.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-1">Testnet Aanbeveling</h3>
                  <p className="text-muted-foreground">
                    Wij raden u sterk aan om eerst de applicatie te testen met een testnet-account voordat u echte fondsen gebruikt. 
                    Test alle strategieën en functies grondig in een risicovrije omgeving.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-1">Privacy & Gegevens</h3>
                  <p className="text-muted-foreground">
                    Deze applicatie verzamelt minimale gebruikersgegevens. API-sleutels worden versleuteld opgeslagen op uw apparaat. 
                    Handelsgegevens kunnen worden gelogd voor debugging-doeleinden.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-1">Aansprakelijkheid</h3>
                  <p className="text-muted-foreground">
                    De ontwikkelaars en distributeurs van Tradebaas zijn niet aansprakelijk voor enig verlies, schade of kosten 
                    die voortvloeien uit het gebruik van deze applicatie. Door door te gaan accepteert u volledige verantwoordelijkheid 
                    voor uw handelsbeslissingen.
                  </p>
                </div>
              </div>
            </ScrollArea>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors py-1.5"
          >
            {expanded ? (
              <>
                <CaretUp className="w-3 h-3" />
                Toon minder
              </>
            ) : (
              <>
                <CaretDown className="w-3 h-3" />
                Lees volledige disclaimer
              </>
            )}
          </button>
        </div>

        <DialogFooter className="flex-row gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={handleDecline}
            className="flex-1 h-9 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            Weigeren
          </Button>
          <Button
            onClick={handleAccept}
            className="flex-1 h-9 text-xs bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            Ik ga akkoord
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

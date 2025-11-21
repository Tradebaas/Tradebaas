import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PrivacyPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrivacyPolicyDialog({ open, onOpenChange }: PrivacyPolicyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle>Privacybeleid</DialogTitle>
          <DialogDescription>
            Hoe Tradebaas uw gegevens verzamelt en gebruikt
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-6 pb-6">
          <div className="space-y-4 text-sm pr-4">
            <div className="space-y-3">
              <p className="text-muted-foreground">
                <strong>Laatst bijgewerkt:</strong> {new Date().toLocaleDateString('nl-NL')}
              </p>

              <h3 className="font-semibold text-foreground">1. Gegevensverzameling</h3>
              <p className="text-muted-foreground">
                Tradebaas verzamelt minimale gegevens die nodig zijn om de applicatie te laten functioneren:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                <li>GitHub account informatie (gebruikers-ID, e-mailadres, avatar) voor authenticatie</li>
                <li>API-sleutels voor handelsbeurzen (versleuteld opgeslagen op uw apparaat)</li>
                <li>Handelsinstellingen en strategieconfiguraties (lokaal opgeslagen)</li>
                <li>Foutlogs en diagnostische gegevens (optioneel, zie Telemetrie)</li>
              </ul>

              <h3 className="font-semibold text-foreground">2. Gegevensopslag</h3>
              <p className="text-muted-foreground">
                <strong>Lokale opslag:</strong> API-sleutels, handelsinstellingen en sessieinformatie worden versleuteld opgeslagen 
                op uw apparaat met behulp van de Spark KV API. Deze gegevens verlaten uw apparaat niet tenzij u expliciet 
                toestemming geeft.
              </p>
              <p className="text-muted-foreground">
                <strong>Server opslag:</strong> Gebruikersprofielen en licentie-informatie worden opgeslagen op beveiligde GitHub-servers.
              </p>

              <h3 className="font-semibold text-foreground">3. Telemetrie</h3>
              <p className="text-muted-foreground">
                Telemetrie is <strong>standaard uitgeschakeld</strong>. Wanneer ingeschakeld, verzamelen we:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                <li>API-aanroepduur en succes/faal status (zonder gevoelige parameters)</li>
                <li>WebSocket verbindingsstatus en -gebeurtenissen</li>
                <li>Orderstatus updates (zonder specifieke prijzen of bedragen)</li>
                <li>Foutmeldingen en stack traces voor debugging</li>
              </ul>
              <p className="text-muted-foreground">
                U kunt telemetrie te allen tijde in- of uitschakelen in de instellingen.
              </p>

              <h3 className="font-semibold text-foreground">4. API-sleutels</h3>
              <p className="text-muted-foreground">
                Uw handelsplatform API-sleutels zijn extreem gevoelig. Tradebaas:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                <li>Versleutelt API-sleutels met AES-256 encryptie voordat ze worden opgeslagen</li>
                <li>Bewaart sleutels alleen op uw lokale apparaat</li>
                <li>Stuurt sleutels nooit naar onze servers</li>
                <li>Geeft ontwikkelaars nooit toegang tot uw sleutels</li>
              </ul>

              <h3 className="font-semibold text-foreground">5. Delen met Derden</h3>
              <p className="text-muted-foreground">
                Tradebaas deelt geen persoonlijke gegevens met derden, behalve:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                <li><strong>Deribit API:</strong> Uw API-sleutels worden direct van uw apparaat naar Deribit gestuurd voor authenticatie</li>
                <li><strong>GitHub:</strong> Voor authenticatie en licentievalidatie</li>
                <li><strong>Apple:</strong> Voor in-app aankoop verificatie (indien van toepassing)</li>
              </ul>

              <h3 className="font-semibold text-foreground">6. Gegevensbeveiliging</h3>
              <p className="text-muted-foreground">
                Wij implementeren industry-standaard beveiligingsmaatregelen:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                <li>End-to-end encryptie voor API-sleutels</li>
                <li>Beveiligde WebSocket verbindingen (WSS)</li>
                <li>Geen logging van gevoelige gegevens</li>
                <li>Regelmatige beveiligingsaudits van dependencies</li>
              </ul>

              <h3 className="font-semibold text-foreground">7. Uw Rechten</h3>
              <p className="text-muted-foreground">
                U heeft het recht om:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                <li>Toegang te vragen tot uw opgeslagen gegevens</li>
                <li>Correctie van onjuiste gegevens te verzoeken</li>
                <li>Verwijdering van uw account en alle bijbehorende gegevens te vragen</li>
                <li>Bezwaar te maken tegen gegevensverwerking</li>
                <li>Een kopie van uw gegevens te exporteren</li>
              </ul>

              <h3 className="font-semibold text-foreground">8. Data Retentie</h3>
              <p className="text-muted-foreground">
                Lokale gegevens blijven op uw apparaat totdat u de app verwijdert of de data handmatig wist. 
                Server-side gebruikersgegevens worden bewaard zolang uw account actief is.
              </p>

              <h3 className="font-semibold text-foreground">9. Kinderen</h3>
              <p className="text-muted-foreground">
                Tradebaas is niet bedoeld voor gebruik door personen jonger dan 18 jaar. Wij verzamelen niet bewust 
                gegevens van minderjarigen.
              </p>

              <h3 className="font-semibold text-foreground">10. Wijzigingen in dit Beleid</h3>
              <p className="text-muted-foreground">
                Wij kunnen dit privacybeleid bijwerken. Wijzigingen worden gecommuniceerd via de applicatie. 
                Voortgezet gebruik na wijzigingen betekent acceptatie van het nieuwe beleid.
              </p>

              <h3 className="font-semibold text-foreground">11. Contact</h3>
              <p className="text-muted-foreground">
                Voor vragen over dit privacybeleid, neem contact op via:{' '}
                <a href="mailto:privacy@tradebaas.app" className="text-accent hover:underline">
                  privacy@tradebaas.app
                </a>
              </p>

              <h3 className="font-semibold text-foreground">12. GDPR Naleving</h3>
              <p className="text-muted-foreground">
                Voor gebruikers in de EU: Tradebaas voldoet aan de Algemene Verordening Gegevensbescherming (AVG). 
                Uw gegevens worden verwerkt op basis van uw toestemming en voor het uitvoeren van het contract 
                (gebruik van de applicatie).
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

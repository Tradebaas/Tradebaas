import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileJs, FileText } from '@phosphor-icons/react';

interface ExampleFormatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExampleFormatDialog({ open, onOpenChange }: ExampleFormatDialogProps) {
  const jsonExample = `{
  "name": "Mijn Custom Momentum Strategie",
  "description": "Deze strategie volgt sterke markt trends met RSI en EMA indicators. Opent posities wanneer de momentum sterk is en sluit ze bij trendwisselingen.",
  "type": "momentum",
  "canRunLive": true,
  "parameters": {
    "timeframe": "5m",
    "indicators": ["RSI", "EMA 20", "EMA 50"],
    "riskReward": 2.0,
    "maxPositions": 3,
    "rsiThreshold": 65,
    "emaSpacing": 25
  }
}`;

  const yamlExample = `name: Mijn Custom Momentum Strategie
description: Deze strategie volgt sterke markt trends met RSI en EMA indicators. Opent posities wanneer de momentum sterk is en sluit ze bij trendwisselingen.
type: momentum
canRunLive: true
parameters:
  timeframe: 5m
  indicators:
    - RSI
    - EMA 20
    - EMA 50
  riskReward: 2.0
  maxPositions: 3
  rsiThreshold: 65
  emaSpacing: 25`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md h-[600px] max-h-[85vh] flex flex-col rounded-2xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-base">
            Voorbeeld Strategie Bestanden
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Gebruik een van deze formaten om je eigen strategie te uploaden
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4">
          <Tabs defaultValue="json" className="w-full h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 bg-muted/30 p-1 gap-1 flex-shrink-0 rounded-xl mb-4">
              <TabsTrigger value="json" className="gap-2 rounded-lg">
                <FileJs className="w-4 h-4" />
                JSON
              </TabsTrigger>
              <TabsTrigger value="yaml" className="gap-2 rounded-lg">
                <FileText className="w-4 h-4" />
                YAML
              </TabsTrigger>
            </TabsList>

            <TabsContent value="json" className="space-y-4 flex-1 mt-0">
              <div>
                <h4 className="text-sm font-medium mb-2">JSON voorbeeld</h4>
                <pre className="text-[10px] bg-muted/30 p-3 rounded-lg overflow-x-auto border border-border/20 leading-relaxed">
                  {jsonExample}
                </pre>
              </div>

              <div className="space-y-2 text-xs">
                <h4 className="font-medium">Vereiste velden:</h4>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li><span className="text-foreground font-medium">name</span> - Naam van je strategie</li>
                  <li><span className="text-foreground font-medium">description</span> - Uitleg over wat de strategie doet</li>
                  <li><span className="text-foreground font-medium">type</span> - momentum, mean-reversion, breakout, scalping, of custom</li>
                  <li><span className="text-foreground font-medium">canRunLive</span> - Boolean (true voor live gebruik)</li>
                  <li><span className="text-foreground font-medium">parameters</span> - Strategie instellingen (optioneel)</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="yaml" className="space-y-4 flex-1 mt-0">
              <div>
                <h4 className="text-sm font-medium mb-2">YAML voorbeeld</h4>
                <pre className="text-[10px] bg-muted/30 p-3 rounded-lg overflow-x-auto border border-border/20 leading-relaxed">
                  {yamlExample}
                </pre>
              </div>

              <div className="space-y-2 text-xs">
                <h4 className="font-medium">Vereiste velden:</h4>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li><span className="text-foreground font-medium">name</span> - Naam van je strategie</li>
                  <li><span className="text-foreground font-medium">description</span> - Uitleg over wat de strategie doet</li>
                  <li><span className="text-foreground font-medium">type</span> - momentum, mean-reversion, breakout, scalping, of custom</li>
                  <li><span className="text-foreground font-medium">canRunLive</span> - Boolean (true voor live gebruik)</li>
                  <li><span className="text-foreground font-medium">parameters</span> - Strategie instellingen (optioneel)</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

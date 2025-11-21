import { useState } from 'react';
import { useKV } from '@/hooks/use-kv-polyfill';
import { useBackendStrategyStatus } from '@/hooks/use-backend-strategy-status';
import { useTradingStore } from '@/state/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Upload, File, Trash, CheckCircle, Info, Eye } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { StrategyDetailsDialog } from '@/components/dialogs/StrategyDetailsDialog';
import { ExampleFormatDialog } from '@/components/dialogs/ExampleFormatDialog';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  type: 'momentum' | 'mean-reversion' | 'breakout' | 'scalping' | 'custom';
  parameters: {
    timeframe?: string;
    indicators?: string[];
    riskReward?: number;
    maxPositions?: number;
    [key: string]: any;
  };
  isBuiltIn: boolean;
  canRunLive: boolean;
}

// Only strategies that are actually implemented and selectable in StrategyTradingCard
const BUILT_IN_STRATEGIES: Strategy[] = [
  {
    id: 'razor',
    name: 'Razor',
    description: '🔥 HIGH-FREQUENCY SCALPING: 50-150 trades/dag, 80%+ winrate. Mean-reversion met EMA(9/21) + RSI(40/60) + Volatility + Momentum. Tight SL 0.5%, aggressive TP 1.0% (2:1 R:R). Optimized voor micro-moves met 5min cooldown. Automated 24/7 backend execution.',
    type: 'scalping',
    parameters: {
      timeframe: '1m',
      indicators: ['EMA 9/21', 'RSI 14', 'Volatility', 'Momentum'],
      riskReward: 2.0,
      maxPositions: 1,
      takeProfitPercent: 1.0,
      stopLossPercent: 0.5,
      maxDailyTrades: 150,
      cooldownMinutes: 5,
      rsiOversold: 40,
      rsiOverbought: 60,
      minVolatility: 0.01,
      maxVolatility: 5.0,
    },
    isBuiltIn: true,
    canRunLive: true,
  },
  {
    id: 'thor',
    name: 'Thor',
    description: '⚡ COMING SOON: Advanced momentum-based strategy with multi-timeframe analysis. Currently in development - will be available in the next release.',
    type: 'momentum',
    parameters: {
      timeframe: '5m',
      indicators: ['Multi-timeframe momentum', 'Volume', 'Volatility'],
      riskReward: 2.5,
      maxPositions: 1,
    },
    isBuiltIn: true,
    canRunLive: false,  // Not yet implemented
  },
];

export function StrategiesPage() {
  const [customStrategies, setCustomStrategies] = useKV<Strategy[]>('custom-strategies', []);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [exampleDialogOpen, setExampleDialogOpen] = useState(false);

  // Poll backend for strategy status
  const connectionState = useTradingStore((state) => state.connectionState);
  const backendStatus = useBackendStrategyStatus(connectionState === 'Active');

  const allStrategies = [...BUILT_IN_STRATEGIES, ...(customStrategies || [])];
  const liveReadyStrategies = allStrategies.filter(s => s.canRunLive);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const text = await file.text();
      let parsed: any;

      if (file.name.endsWith('.json')) {
        parsed = JSON.parse(text);
      } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
        const lines = text.split('\n');
        parsed = {};
        let currentKey = '';
        let inParameters = false;
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          
          if (trimmed.startsWith('parameters:')) {
            inParameters = true;
            parsed.parameters = {};
            continue;
          }
          
          const [key, ...valueParts] = trimmed.split(':');
          const value = valueParts.join(':').trim();
          
          if (inParameters) {
            if (trimmed.startsWith('  ') || trimmed.startsWith('-')) {
              const paramKey = key.replace(/^-?\s*/, '').trim();
              if (trimmed.startsWith('-')) {
                if (!Array.isArray(parsed.parameters[currentKey])) {
                  parsed.parameters[currentKey] = [];
                }
                parsed.parameters[currentKey].push(paramKey);
              } else {
                currentKey = paramKey;
                parsed.parameters[paramKey] = isNaN(Number(value)) ? value : Number(value);
              }
            }
          } else {
            parsed[key.trim()] = isNaN(Number(value)) ? value : Number(value);
          }
        }
      } else {
        throw new Error('Alleen .json en .yaml bestanden worden ondersteund');
      }

      if (!parsed.name || !parsed.description || !parsed.type) {
        throw new Error('Strategie bestand mist verplichte velden (name, description, type)');
      }

      const newStrategy: Strategy = {
        id: `custom-${Date.now()}`,
        name: parsed.name,
        description: parsed.description,
        type: parsed.type || 'custom',
        parameters: parsed.parameters || {},
        isBuiltIn: false,
        canRunLive: parsed.canRunLive ?? false,
      };

      setCustomStrategies((current) => [...(current || []), newStrategy]);
      toast.success(`Strategie "${newStrategy.name}" succesvol toegevoegd`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ongeldig bestand formaat';
      toast.error(`Kon strategie niet laden: ${message}`);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleDeleteStrategy = (strategyId: string) => {
    setCustomStrategies((current) =>
      (current || []).filter((s) => s.id !== strategyId)
    );
    if (selectedStrategy?.id === strategyId) {
      setSelectedStrategy(null);
      setDetailsDialogOpen(false);
    }
    toast.success('Strategie verwijderd');
  };

  const handleStrategyClick = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setDetailsDialogOpen(true);
  };

  const getTypeColor = (type: Strategy['type']) => {
    switch (type) {
      case 'momentum':
        return 'bg-accent/20 text-accent border-accent/30';
      case 'mean-reversion':
        return 'bg-success/20 text-success border-success/30';
      case 'breakout':
        return 'bg-warning/20 text-warning-foreground border-warning/30';
      case 'scalping':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getTypeLabel = (type: Strategy['type']) => {
    switch (type) {
      case 'momentum':
        return 'Momentum';
      case 'mean-reversion':
        return 'Mean Reversion';
      case 'breakout':
        return 'Breakout';
      case 'scalping':
        return 'Scalping';
      default:
        return 'Custom';
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Strategieën</h1>
          <p className="text-sm text-muted-foreground">
            Beheer en upload trading strategieën voor je bot
          </p>
        </div>
        
        <div className="flex-shrink-0">
          <Input
            id="strategy-upload"
            type="file"
            accept=".json,.yaml,.yml"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
          <Button
            onClick={() => document.getElementById('strategy-upload')?.click()}
            disabled={isUploading}
            size="sm"
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">
          Beschikbare strategieën ({liveReadyStrategies.length})
        </h2>
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="grid sm:grid-cols-2 gap-3 pr-4">
            {liveReadyStrategies.length === 0 ? (
              <div className="col-span-2 py-12 text-center">
                <p className="text-muted-foreground text-sm">
                  Geen strategieën beschikbaar. Upload custom strategieën met <span className="text-foreground font-medium">canRunLive: true</span>.
                </p>
              </div>
            ) : (
              liveReadyStrategies.map((strategy) => (
                <Card
                  key={strategy.id}
                  className="p-4 cursor-pointer transition-all duration-200 hover:border-accent/50 border-border/30 hover:bg-accent/5"
                  onClick={() => handleStrategyClick(strategy)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <File className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      <h3 className="font-semibold text-sm truncate">{strategy.name}</h3>
                    </div>
                    {!strategy.isBuiltIn && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStrategy(strategy.id);
                        }}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {strategy.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${getTypeColor(strategy.type)}`}>
                      {getTypeLabel(strategy.type)}
                    </Badge>
                    {strategy.isBuiltIn && (
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Built-in
                      </Badge>
                    )}
                    {backendStatus.isRunning && backendStatus.strategies.some(s => {
                      // Map backend strategy names to frontend IDs
                      const strategyNameLower = s.name.toLowerCase();
                      const strategyIdLower = strategy.id.toLowerCase();
                      
                      // Direct match (e.g., "razor" matches "razor")
                      if (strategyNameLower === strategyIdLower) {
                        return s.status === 'active';
                      }
                      
                      // No match
                      return false;
                    }) && (
                      <Badge variant="outline" className="text-xs bg-success/20 text-success border-success/30">
                        ⚡ Running on Backend
                      </Badge>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <Card className="mt-6 p-4 border-border/30 bg-muted/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3 flex-1">
            <Info className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium mb-1">Custom Strategie Uploaden</h4>
              <p className="text-xs text-muted-foreground mb-2">
                Upload je eigen trading strategie via een JSON of YAML bestand. Alleen strategieën met <span className="text-foreground font-medium">canRunLive: true</span> worden getoond en kunnen live draaien.
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Gebruik duidelijke namen en beschrijvingen voor je strategie</li>
                <li>Kies een passend type: momentum, mean-reversion, breakout, scalping, of custom</li>
                <li>Zet <span className="text-foreground">canRunLive: true</span> om de strategie live te kunnen gebruiken</li>
                <li>Voeg parameters toe die specifiek zijn voor jouw strategie</li>
              </ul>
            </div>
          </div>
          <Button
            onClick={() => setExampleDialogOpen(true)}
            size="sm"
            variant="outline"
            className="gap-2 flex-shrink-0"
          >
            <Eye className="w-4 h-4" />
            Voorbeeld
          </Button>
        </div>
      </Card>

      <StrategyDetailsDialog
        strategy={selectedStrategy}
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
      />
      <ExampleFormatDialog
        open={exampleDialogOpen}
        onOpenChange={setExampleDialogOpen}
      />
    </div>
  );
}

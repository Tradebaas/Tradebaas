import { useState } from 'react';
import { useBackendStrategyStatus } from '@/hooks/use-backend-strategy-status';
import { useTradingStore } from '@/state/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { File, CheckCircle, Info, Eye, Zap, Wind, ArrowUpRight } from 'lucide-react';
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
    description: 'Snelle mean-reversion scalping met multi-timeframe trend filtering. Trade alleen mee met de trend op 1m/5m/15m timeframes. Gebruikt EMA crossovers, RSI extremes en momentum confluences voor high-probability entries.',
    type: 'scalping',
    parameters: {
      timeframe: '1m',
      indicators: ['EMA 9/21 (1m/5m/15m)', 'RSI 14', 'Momentum', 'Volatility'],
      riskReward: 2.0,
      winRate: '70%+',
      maxPositions: 1,
      takeProfitPercent: 1.0,
      stopLossPercent: 0.5,
      maxDailyTrades: 150,
      cooldownMinutes: 5,
      features: [
        'Multi-timeframe trend filter (1m/5m/15m alignment)',
        'Confluence-based entry systeem (min 4/5 signals)',
        'Break-even auto-adjustment (50% naar TP)',
        'Trailing stop (activatie bij 60% naar TP, 0.3% distance)',
        'Automatische orphan order cleanup',
        'Database-first trade tracking',
      ],
      entryRules: [
        'Trend alignment op 1m/5m/15m required',
        'RSI extreme (oversold <35 of overbought >65)',
        'Momentum confirmatie in trend richting',
        'Volatility binnen range (0.02% - 1.5%)',
        'Confluence score minimaal 4/5',
      ],
    },
    isBuiltIn: true,
    canRunLive: true,
  },
  {
    id: 'thor',
    name: 'Thor',
    description: 'Advanced momentum-based strategy met multi-timeframe analysis. Designed voor trending markets met breakout detection en volume confirmatie. Komt binnenkort beschikbaar.',
    type: 'momentum',
    parameters: {
      timeframe: '5m',
      indicators: ['Multi-timeframe momentum', 'Volume profile', 'Volatility bands'],
      riskReward: 2.5,
      maxPositions: 1,
      features: [
        'Breakout detection met volume confirmatie',
        'Multi-timeframe momentum alignment',
        'Adaptive position sizing (ATR-based)',
        'Dynamic trailing stops',
      ],
    },
    isBuiltIn: true,
    canRunLive: false,  // Not yet implemented
  },
];

export function StrategiesPage() {
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [exampleDialogOpen, setExampleDialogOpen] = useState(false);

  // Poll backend for strategy status
  const connectionState = useTradingStore((state) => state.connectionState);
  const backendStatus = useBackendStrategyStatus(connectionState === 'Active');

  const liveReadyStrategies = BUILT_IN_STRATEGIES.filter(s => s.canRunLive);

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
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Strategieën</h1>
          <p className="text-sm text-muted-foreground">
            Beschikbare ingebouwde strategieën
          </p>
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
              liveReadyStrategies.map((strategy) => {
                const StrategyIcon = strategy.id === 'razor' 
                  ? Wind 
                  : strategy.id === 'thor' 
                  ? Zap 
                  : File;
                
                return (
                  <Card
                    key={strategy.id}
                    className="p-5 cursor-pointer transition-all duration-200 hover:border-accent/50 border-border/30 hover:bg-accent/5 hover:shadow-md"
                    onClick={() => handleStrategyClick(strategy)}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg flex-shrink-0 ${
                          strategy.id === 'razor'
                            ? 'bg-destructive/10 text-destructive'
                            : strategy.id === 'thor'
                            ? 'bg-accent/10 text-accent'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <StrategyIcon className="w-5 h-5" />
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <h3 className="font-bold text-base truncate">{strategy.name}</h3>
                          {strategy.isBuiltIn && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-primary/30"
                            >
                              <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                              Built-in
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-[10px] h-5 px-2 ${getTypeColor(strategy.type)}`}
                        >
                          {getTypeLabel(strategy.type)}
                        </Badge>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                      {strategy.description}
                    </p>

                    {/* Key Stats */}
                    <div className="grid grid-cols-3 gap-2 mb-3 pb-3 border-b border-border/30">
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground mb-0.5">Timeframe</div>
                        <div className="text-xs font-semibold">{strategy.parameters.timeframe || 'N/A'}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground mb-0.5">Risk/Reward</div>
                        <div className="text-xs font-semibold">{strategy.parameters.riskReward}:1</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground mb-0.5">Win Rate</div>
                        <div className="text-xs font-semibold text-success">{strategy.parameters.winRate || 'TBD'}</div>
                      </div>
                    </div>

                    {/* Tech Highlights */}
                    {strategy.parameters.features && Array.isArray(strategy.parameters.features) && (
                      <div className="space-y-1.5 mb-3">
                        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Key Features</div>
                        <div className="space-y-1">
                          {strategy.parameters.features.slice(0, 3).map((feature, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 text-[11px]">
                              <ArrowUpRight className="w-3 h-3 flex-shrink-0 text-success mt-0.5" />
                              <span className="text-muted-foreground leading-tight">{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status Badge */}
                    {backendStatus.isRunning && backendStatus.strategies.some(s => {
                      const strategyNameLower = s.name.toLowerCase();
                      const strategyIdLower = strategy.id.toLowerCase();
                      return strategyNameLower === strategyIdLower && s.status === 'active';
                    }) && (
                      <Badge variant="outline" className="w-full justify-center text-xs bg-success/20 text-success border-success/30 font-medium">
                        <Zap className="w-3 h-3 mr-1" />
                        Running on Backend
                      </Badge>
                    )}
                  </Card>
                );
              })
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

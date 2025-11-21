import { useTradingStore } from '@/state/store';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TradeHistoryTable } from './TradeHistoryTable';
import { TradeStatsCards } from './TradeStatsCards';

export function MetricsPage() {
  const { usdcBalance } = useTradingStore();
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');

  const availableStrategies = [
    { id: 'all', name: 'Alle Strategieën' },
    { id: 'scalping', name: 'Scalping Strategy' },
    { id: 'fast-test', name: 'Fast Test' },
    { id: 'vortex', name: 'Vortex' },
    { id: 'razor', name: 'Razor' },
  ];

  return (
    <div className="h-full flex flex-col gap-5 p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Overzicht
          </h2>
          <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Selecteer strategie" />
            </SelectTrigger>
            <SelectContent>
              {availableStrategies.map((strategy) => (
                <SelectItem key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <TradeStatsCards strategyName={selectedStrategy} />
        
        {selectedStrategy !== 'all' && (
          <div className="mt-4 p-3 rounded-xl bg-accent/10 border border-accent/30">
            <p className="text-xs text-muted-foreground">
              Metrics gefilterd op:{' '}
              <span className="font-semibold text-accent">
                {availableStrategies.find(s => s.id === selectedStrategy)?.name}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="glass-card rounded-2xl p-6 flex-1 min-h-[300px] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Trade Geschiedenis
            {selectedStrategy !== 'all' && (
              <span className="ml-2 text-accent">
                ({availableStrategies.find(s => s.id === selectedStrategy)?.name})
              </span>
            )}
          </h2>
          
          <div id="bulk-actions-portal" className="flex items-center gap-2" />
        </div>
        
        <TradeHistoryTable strategyName={selectedStrategy} />
      </div>
    </div>
  );
}

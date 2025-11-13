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

export function MetricsPage() {
  const { usdcBalance } = useTradingStore();
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');

  const formatBalance = (balance: number | null): string => {
    if (balance === null) return '—';
    return `$${balance.toFixed(2)}`;
  };

  const metrics = [
    { label: 'Balans', value: formatBalance(usdcBalance) },
    { label: 'P&L (Dag)', value: '—' },
    { label: 'P&L (Totaal)', value: '—' },
    { label: 'Win Rate', value: '—' },
    { label: 'Total Trades', value: '—' },
    { label: 'Max Drawdown', value: '—' },
  ];

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
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="p-4 rounded-xl bg-muted/20 border border-border/20">
              <p className="text-xs text-muted-foreground mb-1.5">{metric.label}</p>
              <p className="text-lg font-semibold">{metric.value}</p>
            </div>
          ))}
        </div>
        
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
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Trade Geschiedenis
          {selectedStrategy !== 'all' && (
            <span className="ml-2 text-accent">
              ({availableStrategies.find(s => s.id === selectedStrategy)?.name})
            </span>
          )}
        </h2>
        
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Geen trades uitgevoerd</p>
        </div>
      </div>
    </div>
  );
}

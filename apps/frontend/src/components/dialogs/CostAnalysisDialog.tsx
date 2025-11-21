import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  calculateTradingCosts,
  calculateCompleteTradeCosts,
  formatCostBreakdown,
  getCostAnalysisSummary,
  type TradeCostAnalysis,
} from '@/lib/costAnalysis';
import { Calculator, TrendUp, TrendDown, X, Info } from '@phosphor-icons/react';

interface CostAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CostAnalysisDialog({ open, onOpenChange }: CostAnalysisDialogProps) {
  const [entryPrice, setEntryPrice] = useState<string>('110000');
  const [exitPrice, setExitPrice] = useState<string>('110500');
  const [positionSize, setPositionSize] = useState<string>('1000');
  const [leverage, setLeverage] = useState<string>('5');
  const [analysis, setAnalysis] = useState<TradeCostAnalysis | null>(null);

  const handleCalculate = () => {
    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    const size = parseFloat(positionSize);
    const lev = parseFloat(leverage);

    if (
      isNaN(entry) ||
      isNaN(exit) ||
      isNaN(size) ||
      isNaN(lev) ||
      entry <= 0 ||
      exit <= 0 ||
      size <= 0 ||
      lev <= 0
    ) {
      return;
    }

    const result = calculateTradingCosts({
      entryPrice: entry,
      exitPrice: exit,
      positionSize: size,
      leverage: lev,
    });

    setAnalysis(result);
  };

  const completeCosts = analysis
    ? calculateCompleteTradeCosts({
        entryPrice: parseFloat(entryPrice),
        exitPrice: parseFloat(exitPrice),
        positionSize: parseFloat(positionSize),
        leverage: parseFloat(leverage),
      })
    : null;

  const summary = analysis ? getCostAnalysisSummary(analysis) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Trading Cost Analysis
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info Banner */}
          <Card className="p-4 bg-accent/10 border-accent/20">
            <div className="flex gap-3">
              <Info className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium">Kosten bij verschillende exit scenario's</p>
                <p className="text-muted-foreground">
                  Analyseer de trading kosten voor market close, take profit, en stop loss. Met
                  leverage betaal je fees op de volledige notional value (grootte × leverage).
                </p>
              </div>
            </div>
          </Card>

          {/* Input Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entry-price">Entry Price ($)</Label>
              <Input
                id="entry-price"
                type="number"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="110000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exit-price">Exit Price ($)</Label>
              <Input
                id="exit-price"
                type="number"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                placeholder="110500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="position-size">Position Size (USD)</Label>
              <Input
                id="position-size"
                type="number"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                placeholder="1000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="leverage">Leverage</Label>
              <Input
                id="leverage"
                type="number"
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                placeholder="5"
                min="1"
                max="50"
              />
            </div>
          </div>

          <Button onClick={handleCalculate} className="w-full">
            <Calculator className="w-4 h-4 mr-2" />
            Bereken Kosten
          </Button>

          {/* Results */}
          {analysis && summary && completeCosts && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border-success/30 bg-success/5">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">Best Case</p>
                    <TrendUp className="w-4 h-4 text-success" />
                  </div>
                  <p className="text-2xl font-bold text-success mb-1">
                    ${analysis.scenarios.takeProfitHit.totalCost.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {analysis.scenarios.takeProfitHit.totalCostPercent.toFixed(4)}% van notional
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">Take Profit (Maker Fee)</p>
                </Card>

                <Card className="p-4 border-accent/30 bg-accent/5">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">Market Close</p>
                    <X className="w-4 h-4 text-accent" />
                  </div>
                  <p className="text-2xl font-bold text-accent mb-1">
                    ${analysis.scenarios.marketClose.totalCost.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {analysis.scenarios.marketClose.totalCostPercent.toFixed(4)}% van notional
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">Market Order (Taker Fee)</p>
                </Card>

                <Card className="p-4 border-destructive/30 bg-destructive/5">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">Worst Case</p>
                    <TrendDown className="w-4 h-4 text-destructive" />
                  </div>
                  <p className="text-2xl font-bold text-destructive mb-1">
                    ${analysis.scenarios.stopLossHit.totalCost.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {analysis.scenarios.stopLossHit.totalCostPercent.toFixed(4)}% van notional
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">Stop Loss (Taker Fee)</p>
                </Card>
              </div>

              {/* Complete Trade Cost */}
              <Card className="p-4 border-border/50">
                <h3 className="font-semibold mb-3">Totale Trade Kosten (Entry + Exit)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Best Scenario</p>
                    <p className="font-mono font-medium text-success">
                      ${completeCosts.totalCostRange.best.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {completeCosts.impactOnPnL.best} van positie
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Typical Scenario</p>
                    <p className="font-mono font-medium">
                      ${completeCosts.totalCostRange.typical.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {completeCosts.impactOnPnL.typical} van positie
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Worst Scenario</p>
                    <p className="font-mono font-medium text-destructive">
                      ${completeCosts.totalCostRange.worst.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {completeCosts.impactOnPnL.worst} van positie
                    </p>
                  </div>
                </div>
              </Card>

              {/* Detailed Breakdown */}
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Gedetailleerde Kostenopbouw</h3>
                <div className="space-y-4">
                  {/* Market Close */}
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <X className="w-4 h-4" />
                      Market Close
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee Type:</span>
                        <span className="font-mono">Taker (0.05%)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trading Fee:</span>
                        <span className="font-mono">
                          ${analysis.scenarios.marketClose.tradingFee.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Notional Value:</span>
                        <span className="font-mono">
                          ${analysis.scenarios.marketClose.details.notionalValue.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
                        {analysis.scenarios.marketClose.description}
                      </p>
                    </div>
                  </div>

                  {/* Take Profit */}
                  <div className="p-3 rounded-lg bg-success/5 border border-success/30">
                    <h4 className="font-medium mb-2 flex items-center gap-2 text-success">
                      <TrendUp className="w-4 h-4" />
                      Take Profit Hit
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee Type:</span>
                        <span className="font-mono">Maker (0.02%)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trading Fee:</span>
                        <span className="font-mono">
                          ${analysis.scenarios.takeProfitHit.tradingFee.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Notional Value:</span>
                        <span className="font-mono">
                          ${analysis.scenarios.takeProfitHit.details.notionalValue.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-success/30">
                        {analysis.scenarios.takeProfitHit.description}
                      </p>
                    </div>
                  </div>

                  {/* Stop Loss */}
                  <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/30">
                    <h4 className="font-medium mb-2 flex items-center gap-2 text-destructive">
                      <TrendDown className="w-4 h-4" />
                      Stop Loss Hit
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee Type:</span>
                        <span className="font-mono">Taker (0.05%)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trading Fee:</span>
                        <span className="font-mono">
                          ${analysis.scenarios.stopLossHit.tradingFee.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Notional Value:</span>
                        <span className="font-mono">
                          ${analysis.scenarios.stopLossHit.details.notionalValue.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-destructive/30">
                        {analysis.scenarios.stopLossHit.description}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Leverage Impact Explanation */}
              <Card className="p-4 bg-accent/5 border-accent/20">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4 text-accent" />
                  Leverage Impact
                </h3>
                <p className="text-sm text-muted-foreground">
                  Met {leverage}x leverage wordt je fee berekend op de volledige notional value
                  (${positionSize}). De fee percentages blijven hetzelfde (Maker: 0.02%, Taker:
                  0.05%), maar je betaalt ze over een grotere positie. Dit is een belangrijke
                  overweging bij het gebruik van hoge leverage.
                </p>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

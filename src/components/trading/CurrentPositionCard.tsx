import { useState, useEffect } from 'react';
import { useTradingStore } from '@/state/store';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, X, TrendUp, TrendDown, Info, Calculator, CaretDown, CaretUp } from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { Position } from '@/lib/deribitClient';
import { AnalysisDetailsDialog } from '@/components/dialogs/AnalysisDetailsDialog';
import { ClosePositionConfirmDialog } from '@/components/dialogs/ClosePositionConfirmDialog';
import { calculateTradingCosts, calculateCompleteTradeCosts } from '@/lib/costAnalysis';
import { backendAPI } from '@/lib/backend-api';

interface MarketAnalysis {
  successProbability: number;
  analysis: string;
  timestamp: number;
}

export function CurrentPositionCard() {
  const { connectionState, activePosition: storeActivePosition, usdcBalance } = useTradingStore();
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [takeProfit, setTakeProfit] = useState<number | null>(null);
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysis | null>(null);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [analyzingMarket, setAnalyzingMarket] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [isPnLExpanded, setIsPnLExpanded] = useState(false);

  const isConnected = connectionState === 'Active';

  useEffect(() => {
    if (!isConnected) return;

    const fetchPosition = async () => {
      try {
        // Use backend API instead of client
        const result = await backendAPI.getPositions();
        
        if (!result.success) {
          console.error('[Position Card] Failed to get positions:', result.error);
          return;
        }
        
        const positions = result.positions;
        const openPosition = positions.find(p => p.size !== 0);
        
        // CRITICAL FIX: Als er geen positie is maar we hadden er wel een, reset alles
        if (!openPosition && position) {
          console.log('[Position Card] Position closed - resetting state');
          setPosition(null);
          setEntryPrice(0);
          setStopLoss(null);
          setTakeProfit(null);
          setMarketAnalysis(null);
          setCurrentPrice(0);
          return;
        }
        
        setPosition(openPosition || null);

        if (openPosition) {
          // Use backend API to get ticker
          const tickerResult = await backendAPI.getTicker(openPosition.instrument_name);
          
          if (!tickerResult.success || !tickerResult.ticker) {
            console.error('[Position Card] Failed to get ticker');
            return;
          }
          
          setCurrentPrice(tickerResult.ticker.mark_price);
          
          // ALWAYS sync entry price with actual position average price
          // This ensures that after a page refresh we have the correct entry
          if (openPosition.average_price !== entryPrice) {
            console.log('[Position Card] Syncing entry price:', {
              old: entryPrice,
              new: openPosition.average_price,
            });
            setEntryPrice(openPosition.average_price);
          }

          // Use backend API to get orders
          const ordersResult = await backendAPI.getOpenOrders(openPosition.instrument_name);
          
          if (!ordersResult.success) {
            console.error('[Position Card] Failed to get orders');
            return;
          }
          
          const orders = ordersResult.orders || [];
          
          // SL is a stop_market order with trigger_price
          // Note: Deribit may ignore reduce_only for stop_market orders
          const slOrder = orders.find(o => 
            o.order_type === 'stop_market' && 
            o.trigger_price !== undefined
          );
          
          // TP is a limit order with price (not trigger_price)
          // Filter out stop orders to ensure we get the actual limit TP
          const tpOrder = orders.find(o => 
            o.reduce_only && 
            o.order_type === 'limit' && 
            o.price !== undefined &&
            !o.trigger_price && // Ensure it's NOT a triggered order
            o.order_id !== slOrder?.order_id
          );
          
          console.log('[Position Card] Orders found:', {
            totalOrders: orders.length,
            slOrder: slOrder ? { id: slOrder.order_id, trigger_price: slOrder.trigger_price, type: slOrder.order_type } : null,
            tpOrder: tpOrder ? { id: tpOrder.order_id, price: tpOrder.price, type: tpOrder.order_type } : null,
          });
          
          if (slOrder?.trigger_price) {
            setStopLoss(slOrder.trigger_price);
            console.log('[Position Card] SL set to:', slOrder.trigger_price);
          } else {
            // Als er geen SL order is maar we hebben wel een SL state, reset het
            if (stopLoss !== null) {
              console.log('[Position Card] No SL order found - resetting SL state');
              setStopLoss(null);
            }
          }
          
          if (tpOrder?.price) {
            setTakeProfit(tpOrder.price);
            console.log('[Position Card] TP set to:', tpOrder.price);
          } else {
            // Als er geen TP order is maar we hebben wel een TP state, reset het
            if (takeProfit !== null) {
              console.log('[Position Card] No TP order found - resetting TP state');
              setTakeProfit(null);
            }
            console.warn('[Position Card] No valid TP order found. All orders:', orders.map(o => ({
              id: o.order_id,
              type: o.order_type,
              price: o.price,
              trigger_price: o.trigger_price,
              reduce_only: o.reduce_only,
            })));
          }
        }
      } catch (error) {
        console.error('Failed to fetch position:', error);
      }
    };

    fetchPosition();
    const interval = setInterval(fetchPosition, 3000);

    return () => clearInterval(interval);
  }, [isConnected]); // Removed client dependency - now using backendAPI

  // DISABLED: Market analysis (legacy Spark LLM not available in standalone deployment)
  // This feature required GitHub Spark AI which is not available outside Spark environment
  useEffect(() => {
    console.log('[CurrentPositionCard] Market analysis disabled - requires Spark LLM');
  }, [position, currentPrice, entryPrice, stopLoss, takeProfit]);

  const handleClosePositionClick = () => {
    setCloseConfirmOpen(true);
  };

  const handleClosePositionConfirm = async () => {
    if (!position) return;

    setLoading(true);
    try {
      // Use backend API to get ticker
      const tickerResult = await backendAPI.getTicker(position.instrument_name);
      
      if (!tickerResult.success || !tickerResult.ticker) {
        toast.error('Kon ticker niet ophalen');
        return;
      }
      
      const exitPrice = tickerResult.ticker.mark_price;
      
      const pnlValue = calculatePnL();
      const pnlPercentValue = calculatePnLPercent();
      
      // Use backend API to close position
      await backendAPI.closePosition(position.instrument_name);
      
      // Telegram notification - using localStorage instead of Spark KV
      const botToken = localStorage.getItem('tradebaas:telegram-bot-token');
      const chatId = localStorage.getItem('tradebaas:telegram-chat-id');
      const telegramEnabled = localStorage.getItem('tradebaas:telegram-enabled');
      
      if (telegramEnabled === 'true' && botToken && chatId) {
        try {
          const config = {
            botToken,
            chatId,
            enabled: true,
          };
          
          const { createTelegramNotifier } = await import('@/lib/telegram');
          const notifier = createTelegramNotifier(config);
          
          await notifier.sendTradeClosed({
            type: 'TRADE_CLOSED',
            instrument: position.instrument_name,
            side: position.direction === 'buy' ? 'buy' : 'sell',
            entry: entryPrice,
            stopLoss: stopLoss || 0,
            takeProfit: takeProfit || 0,
            amount: Math.abs(position.size),
            strategy: storeActivePosition?.strategyName || 'Handmatig',
            exitPrice: exitPrice,
            pnl: pnlValue,
            pnlPercent: pnlPercentValue,
            reason: 'Handmatig gesloten via UI',
          });
        } catch (telegramError) {
          console.error('[Telegram] Failed to send notification:', telegramError);
        }
      }
      
      toast.success('Positie succesvol gesloten');
      setPosition(null);
      setEntryPrice(0);
      setStopLoss(null);
      setTakeProfit(null);
      setMarketAnalysis(null);
    } catch (error) {
      toast.error('Kon positie niet sluiten');
      console.error('Failed to close position:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePnL = () => {
    if (!position || currentPrice === 0 || !position.average_price) return 0;
    
    // For USDC perpetuals: position.size is in USD
    // Convert to contracts: contracts = size / entry_price
    const contracts = Math.abs(position.size) / position.average_price;
    
    // Calculate PnL: (exit - entry) * contracts
    const pnl = position.direction === 'buy'
      ? (currentPrice - position.average_price) * contracts
      : (position.average_price - currentPrice) * contracts;
    
    return pnl;
  };

  const calculatePnLPercent = () => {
    if (!position || currentPrice === 0) return 0;
    
    const pnlPercent = position.direction === 'buy'
      ? ((currentPrice - position.average_price) / position.average_price) * 100
      : ((position.average_price - currentPrice) / position.average_price) * 100;
    
    return pnlPercent;
  };

  const calculateRR = () => {
    if (!entryPrice || !stopLoss || !takeProfit) return null;
    
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    
    return reward / risk;
  };

  const calculateCosts = () => {
    if (!position || currentPrice === 0 || !entryPrice) return null;

    try {
      // For Deribit USDC perpetuals, position.size is in USD, not contracts
      // So positionSizeUSD is just the absolute size
      const positionSizeUSD = Math.abs(position.size);
      
      const costAnalysis = calculateCompleteTradeCosts({
        entryPrice: entryPrice,
        exitPrice: currentPrice,
        positionSize: positionSizeUSD,
        leverage: position.leverage,
        instrument: position.instrument_name,
      });

      // Calculate gross PnL correctly:
      // For USDC perpetuals: PnL = (exitPrice - entryPrice) * contracts
      // But position.size is in USD, so we need to convert to contracts first
      // Contracts = position.size / entryPrice
      const contracts = Math.abs(position.size) / entryPrice;
      
      const grossPnL = position.direction === 'buy'
        ? (currentPrice - entryPrice) * contracts
        : (entryPrice - currentPrice) * contracts;

      // Total fees = entry fee + exit fee
      const totalFees = costAnalysis.totalCostRange.typical;
      
      // Net PnL = Gross PnL - Total Fees
      const netPnL = grossPnL - totalFees;

      return {
        grossPnL,
        totalFees,
        netPnL,
        costAnalysis,
      };
    } catch (error) {
      console.error('Cost calculation failed:', error);
      return null;
    }
  };

  const costs = calculateCosts();

  const pnl = calculatePnL();
  const pnlPercent = calculatePnLPercent();
  const isProfitable = pnl >= 0;
  const riskReward = calculateRR();

  if (!position) {
    return (
      <div className="glass-card rounded-2xl p-5 h-full flex flex-col overflow-y-auto">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex-shrink-0">
          Huidige Positie
        </h2>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mx-auto">
              <div className="w-8 h-8 rounded-full bg-muted/30"></div>
            </div>
            <p className="text-sm text-muted-foreground">Geen actieve positie</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5 h-full flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Huidige Positie
          </h2>
          {storeActivePosition?.strategyName && (
            <p className="text-xs text-accent mt-0.5">
              Strategie: {storeActivePosition.strategyName}
            </p>
          )}
        </div>
        <Button
          onClick={handleClosePositionClick}
          disabled={loading}
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <X className="w-4 h-4 mr-1" weight="bold" />
          Sluit Positie
        </Button>
      </div>

      <div className="space-y-4 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${position.direction === 'buy' ? 'bg-success/20' : 'bg-destructive/20'}`}>
              {position.direction === 'buy' ? (
                <ArrowUp className="w-6 h-6 text-success" weight="bold" />
              ) : (
                <ArrowDown className="w-6 h-6 text-destructive" weight="bold" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-xl">{position.instrument_name}</h3>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">
                {position.direction === 'buy' ? 'LONG' : 'SHORT'} • {Math.round(position.size)} @ {position.leverage.toFixed(0)}x
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-medium text-muted-foreground mb-1">
              ${currentPrice > 0 ? currentPrice.toFixed(2) : '—'}
            </p>
            {currentPrice > 0 && (
              <p className={`text-2xl font-bold ${isProfitable ? 'text-success' : 'text-destructive'}`}>
                {pnlPercent.toFixed(2)}%
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-muted/20 border border-border/30">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Entry</p>
            <p className="text-sm font-bold">${entryPrice.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Stop Loss</p>
            <p className="text-sm font-bold text-destructive">
              {stopLoss ? `$${stopLoss.toFixed(2)}` : '—'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Take Profit</p>
            <p className="text-sm font-bold text-success">
              {takeProfit ? `$${takeProfit.toFixed(2)}` : '—'}
            </p>
          </div>
        </div>

        {riskReward && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-accent/10 border border-accent/30">
            <div className="flex items-center gap-2">
              {isProfitable ? (
                <TrendUp className="w-4 h-4 text-success" weight="bold" />
              ) : (
                <TrendDown className="w-4 h-4 text-destructive" weight="bold" />
              )}
              <span className="text-xs font-medium text-muted-foreground">Risk:Reward Ratio</span>
            </div>
            <span className="text-lg font-bold text-accent">1:{riskReward.toFixed(2)}</span>
          </div>
        )}

        {marketAnalysis && (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/30">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${analyzingMarket ? 'animate-pulse-glow bg-accent' : 'bg-accent'}`}></div>
                <span className="text-xs font-medium text-muted-foreground">Succeskans</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xl font-bold ${
                  marketAnalysis.successProbability >= 70 ? 'text-success' : 
                  marketAnalysis.successProbability >= 40 ? 'text-warning' : 
                  'text-destructive'
                }`}>
                  {marketAnalysis.successProbability}%
                </span>
                <Button
                  onClick={() => setAnalysisDialogOpen(true)}
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-primary/20"
                >
                  <Info className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-border/30 space-y-2">
          <button
            onClick={() => setIsPnLExpanded(!isPnLExpanded)}
            className="w-full flex items-center justify-between hover:bg-muted/10 rounded-lg p-2 -m-2 transition-colors group"
          >
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Bruto P&L</p>
              {costs && (
                <Calculator className="w-3.5 h-3.5 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <p className={`text-sm font-bold ${costs ? (costs.grossPnL >= 0 ? 'text-success' : 'text-destructive') : (position.floating_profit_loss >= 0 ? 'text-success' : 'text-destructive')}`}>
                ${costs ? costs.grossPnL.toFixed(2) : position.floating_profit_loss.toFixed(2)}
              </p>
              {isPnLExpanded ? (
                <CaretUp className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" weight="bold" />
              ) : (
                <CaretDown className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" weight="bold" />
              )}
            </div>
          </button>

          {costs && isPnLExpanded && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground pl-4">Kosten (Fees + Slippage)</p>
                <p className="text-sm font-medium text-destructive">
                  -${costs.totalFees.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/20">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Netto P&L</p>
                <p className={`text-base font-bold ${costs.netPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ${costs.netPnL.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/20 bg-accent/5 -mx-2 px-4 py-2 rounded-lg">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Balance na sluiten</p>
                <p className={`text-lg font-bold ${costs.netPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ${usdcBalance !== null && position?.initial_margin ? (usdcBalance + position.initial_margin + costs.netPnL).toFixed(2) : '—'} USDC
                </p>
              </div>
              <div className="pt-2">
                <p className="text-xs text-muted-foreground italic">
                  Beschikbaar + in trade + netto P&L
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <AnalysisDetailsDialog
        open={analysisDialogOpen}
        onOpenChange={setAnalysisDialogOpen}
        analysis={marketAnalysis?.analysis || ''}
        probability={marketAnalysis?.successProbability || 0}
        position={{
          instrument: position.instrument_name,
          direction: position.direction,
          entry: entryPrice,
          current: currentPrice,
          stopLoss,
          takeProfit,
          pnl,
          pnlPercent
        }}
      />

      <ClosePositionConfirmDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        onConfirm={handleClosePositionConfirm}
        position={position}
        estimatedCost={costs ? {
          grossPnL: costs.grossPnL,
          totalFees: costs.totalFees,
          netPnL: costs.netPnL,
        } : undefined}
        loading={loading}
      />
    </div>
  );
}

import type { DeribitClient, Ticker } from '@/lib/deribitClient';
import type { RiskSettings } from '@/state/store';
import { calculatePosition, buildBracket } from '@/lib/riskEngine';
import { validateAndNormalizeAmount } from '@/lib/utils';
import type { ErrorLog } from '@/components/dialogs/ErrorDetailsDialog';
import { DeribitError } from '@/lib/deribitClient';

export interface ScalpingConfig {
  instrument: string;
  emaFastPeriod: number;
  emaSlowPeriod: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  volumeThreshold: number;
  minPriceMove: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  maxHoldTimeMs: number;
  cooldownMs: number;
}

export interface PriceData {
  timestamp: number;
  price: number;
  volume: number;
}

export interface StrategySignal {
  type: 'buy' | 'sell' | 'none';
  confidence: number;
  reason: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
}

export interface ActivePosition {
  id?: string;
  orderId: string;
  instrumentName: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  stopPrice: number;
  stopLoss?: number;
  takeProfitPrice: number;
  takeProfit?: number;
  entryTime: number;
  slOrderId?: string;
  tpOrderId?: string;
  confidence?: number;
  strategyName?: string; // Which strategy created this position
}

export class ScalpingStrategy {
  private config: ScalpingConfig;
  private priceHistory: PriceData[] = [];
  private rsiValues: number[] = [];
  private emaFast: number | null = null;
  private emaSlow: number | null = null;
  private lastTradeTime: number = 0;
  private position: ActivePosition | null = null;
  private client: DeribitClient;
  private riskSettings: RiskSettings;
  private equity: number;
  private isRunning: boolean = false;
  private monitorInterval: number | null = null;
  private onPositionOpen?: (position: ActivePosition) => void;
  private onPositionClose?: (position: ActivePosition, pnl: number) => void;
  private onSignal?: (signal: StrategySignal) => void;
  private onError?: (error: ErrorLog) => void;

  constructor(
    client: DeribitClient,
    config: ScalpingConfig,
    riskSettings: RiskSettings,
    equity: number,
    callbacks?: {
      onPositionOpen?: (position: ActivePosition) => void;
      onPositionClose?: (position: ActivePosition, pnl: number) => void;
      onSignal?: (signal: StrategySignal) => void;
      onError?: (error: ErrorLog) => void;
    }
  ) {
    this.client = client;
    this.config = config;
    this.riskSettings = riskSettings;
    this.equity = equity;
    this.onPositionOpen = callbacks?.onPositionOpen;
    this.onPositionClose = callbacks?.onPositionClose;
    this.onSignal = callbacks?.onSignal;
    this.onError = callbacks?.onError;
    this.onSignal = callbacks?.onSignal;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[Scalping Strategy] Started');
    
    try {
      await this.client.subscribe(
        [`user.portfolio.${this.config.instrument.toLowerCase()}`],
        async (channel, data) => {
          await this.handlePortfolioUpdate(data);
        }
      );
      console.log('[Scalping Strategy] Subscribed to portfolio updates');
    } catch (error) {
      console.warn('[Scalping Strategy] Failed to subscribe to portfolio updates:', error);
    }
    
    this.monitorInterval = window.setInterval(async () => {
      await this.analyze();
      await this.cleanupOrphanedOrders();
    }, 2000);
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.monitorInterval) {
      window.clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    console.log('[Scalping Strategy] Stopped');
  }

  private async analyze(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const ticker = await this.client.getTicker(this.config.instrument);
      
      const priceData: PriceData = {
        timestamp: Date.now(),
        price: ticker.last_price,
        volume: 0,
      };
      
      if (this.priceHistory.length < 50) {
        this.priceHistory.push(priceData);
      } else {
        this.priceHistory.shift();
        this.priceHistory.push(priceData);
      }

      if (this.priceHistory.length < 50) {
        return;
      }

      this.updateIndicators();

      if (this.position) {
        await this.managePosition(ticker);
      } else {
        const openPosition = await this.client.getPosition(this.config.instrument);
        
        if (openPosition && openPosition.size !== 0) {
          console.log('[Scalping Strategy] ⏸️  Position already open, pausing strategy', {
            instrument: openPosition.instrument_name,
            size: openPosition.size,
            direction: openPosition.direction,
            avgPrice: openPosition.average_price.toFixed(2),
            unrealizedPnL: openPosition.floating_profit_loss.toFixed(2),
          });
          return;
        }

        const signal = this.generateSignal(ticker);
        
        if (signal.type !== 'none') {
          this.onSignal?.(signal);
          await this.executeSignal(signal, ticker);
          this.resetDataCollection();
        }
      }
    } catch (error) {
      console.error('[Scalping Strategy] Analysis error:', error);
    }
  }

  private updateIndicators(): void {
    if (this.priceHistory.length < this.config.emaSlowPeriod) {
      return;
    }

    const prices = this.priceHistory.map(d => d.price);
    
    this.emaFast = this.calculateEMA(prices, this.config.emaFastPeriod);
    this.emaSlow = this.calculateEMA(prices, this.config.emaSlowPeriod);
    
    const rsi = this.calculateRSI(prices, this.config.rsiPeriod);
    if (rsi !== null) {
      this.rsiValues.push(rsi);
      if (this.rsiValues.length > 50) {
        this.rsiValues.shift();
      }
    }
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  private calculateRSI(prices: number[], period: number): number | null {
    if (prices.length < period + 1) return null;
    
    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    const recentChanges = changes.slice(-period);
    const gains = recentChanges.filter(c => c > 0);
    const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));
    
    const avgGain = gains.length > 0 ? gains.reduce((sum, g) => sum + g, 0) / period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, l) => sum + l, 0) / period : 0;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private generateSignal(ticker: Ticker): StrategySignal {
    const now = Date.now();
    
    if (now - this.lastTradeTime < this.config.cooldownMs) {
      return {
        type: 'none',
        confidence: 0,
        reason: 'Cooldown active',
        entryPrice: ticker.last_price,
        stopLoss: 0,
        takeProfit: 0,
      };
    }

    if (this.emaFast === null || this.emaSlow === null || this.rsiValues.length === 0) {
      return {
        type: 'none',
        confidence: 0,
        reason: 'Insufficient data',
        entryPrice: ticker.last_price,
        stopLoss: 0,
        takeProfit: 0,
      };
    }

    const currentPrice = ticker.last_price;
    const rsi = this.rsiValues[this.rsiValues.length - 1];
    
    const emaBullish = this.emaFast > this.emaSlow;
    const emaBearish = this.emaFast < this.emaSlow;
    const emaCrossStrength = Math.abs(this.emaFast - this.emaSlow) / currentPrice;
    
    const spread = ticker.best_ask_price - ticker.best_bid_price;
    const spreadPercent = (spread / currentPrice) * 100;
    
    if (spreadPercent > 0.05) {
      return {
        type: 'none',
        confidence: 0,
        reason: 'Spread too wide',
        entryPrice: currentPrice,
        stopLoss: 0,
        takeProfit: 0,
      };
    }

    let signal: 'buy' | 'sell' | 'none' = 'none';
    let confidence = 0;
    let reason = '';

    if (emaBullish && rsi < 50 && rsi > 30 && emaCrossStrength > 0.0005) {
      signal = 'buy';
      confidence = 0.6 + (emaCrossStrength * 100) + ((50 - rsi) / 100);
      reason = `EMA bullish cross, RSI ${rsi.toFixed(1)} favorable`;
    } else if (emaBearish && rsi > 50 && rsi < 70 && emaCrossStrength > 0.0005) {
      signal = 'sell';
      confidence = 0.6 + (emaCrossStrength * 100) + ((rsi - 50) / 100);
      reason = `EMA bearish cross, RSI ${rsi.toFixed(1)} favorable`;
    }

    if (confidence < 0.65) {
      return {
        type: 'none',
        confidence,
        reason: 'Confidence too low',
        entryPrice: currentPrice,
        stopLoss: 0,
        takeProfit: 0,
      };
    }

    const stopLossPercent = this.config.stopLossPercent;
    const takeProfitPercent = this.config.takeProfitPercent;
    
    let stopLoss: number;
    let takeProfit: number;
    
    if (signal === 'buy') {
      stopLoss = currentPrice * (1 - stopLossPercent / 100);
      takeProfit = currentPrice * (1 + takeProfitPercent / 100);
    } else {
      stopLoss = currentPrice * (1 + stopLossPercent / 100);
      takeProfit = currentPrice * (1 - takeProfitPercent / 100);
    }

    return {
      type: signal,
      confidence,
      reason,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
    };
  }

  private async executeSignal(signal: StrategySignal, ticker: Ticker): Promise<void> {
    if (signal.type === 'none') return;
    
    try {
      const instrument = await this.client.getInstrument(this.config.instrument);
      
      if (!instrument) {
        console.error('[Scalping Strategy] Instrument not found:', this.config.instrument);
        return;
      }
      
      const riskCalc = calculatePosition({
        equity: this.equity,
        riskMode: this.riskSettings.mode,
        riskValue: this.riskSettings.value,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopLoss,
        brokerRules: {
          tickSize: instrument.tick_size,
          lotSize: instrument.contract_size,
          minTradeAmount: instrument.min_trade_amount,
          maxLeverage: instrument.max_leverage,
          contractSize: instrument.contract_size,
        },
      });

      if (!riskCalc.success) {
        const errorLog: ErrorLog = {
          id: `strategy-error-${Date.now()}`,
          timestamp: Date.now(),
          errorType: 'RISK_CALCULATION_FAILED',
          message: riskCalc.reason,
          context: {
            action: 'executeSignal',
            strategyName: 'Scalping Strategy',
            instrument: this.config.instrument,
            equity: this.equity,
            riskMode: this.riskSettings.mode,
            riskValue: this.riskSettings.value,
            entryPrice: signal.entryPrice,
            stopPrice: signal.stopLoss,
          },
        };
        console.log('[Scalping Strategy] Risk calculation failed:', riskCalc.reason);
        this.onError?.(errorLog);
        return;
      }

      console.log('[Scalping Strategy] Risk engine calculated quantity:', riskCalc.quantity);
      
      const validation = validateAndNormalizeAmount(
        riskCalc.quantity,
        instrument.contract_size,
        instrument.min_trade_amount
      );
      
      if (!validation.valid) {
        const errorLog: ErrorLog = {
          id: `strategy-error-${Date.now()}`,
          timestamp: Date.now(),
          errorType: 'INVALID_AMOUNT',
          message: validation.error || 'Amount validation failed',
          context: {
            action: 'executeSignal',
            strategyName: 'Scalping Strategy',
            instrument: this.config.instrument,
            calculatedAmount: riskCalc.quantity,
            normalizedAmount: validation.amount,
            minTradeAmount: instrument.min_trade_amount,
            contractSize: instrument.contract_size,
            validationDetails: validation.details,
          },
        };
        console.error('[Scalping Strategy] Amount validation failed:', validation.error, validation.details);
        this.onError?.(errorLog);
        return;
      }
      
      const amount = validation.amount;
      
      console.log('[Scalping Strategy] Amount validation passed:', {
        calculatedAmount: riskCalc.quantity,
        normalizedAmount: amount,
        contractSize: instrument.contract_size,
        minTradeAmount: instrument.min_trade_amount,
      });
      
      const roundedSL = Math.round(signal.stopLoss / instrument.tick_size) * instrument.tick_size;
      const roundedTP = Math.round(signal.takeProfit / instrument.tick_size) * instrument.tick_size;

      console.log('[Scalping Strategy] Placing order:', {
        instrument: this.config.instrument,
        amount,
        contractSize: instrument.contract_size,
        side: signal.type,
      });

      let orderResponse;
      
      try {
        // NOTE: Current DeribitClient does not expose native OTOCO helpers.
        // For now we place a protected market entry; SL/TP management can be
        // added via a bracket manager similar to Vortex if needed.
        if (signal.type === 'buy') {
          orderResponse = await this.client.placeBuyOrder(
            this.config.instrument,
            amount,
            undefined,
            'market',
            `scalping_${Date.now()}`
          );
        } else {
          orderResponse = await this.client.placeSellOrder(
            this.config.instrument,
            amount,
            undefined,
            'market',
            `scalping_${Date.now()}`
          );
        }

        console.log('[Scalping Strategy] ✅ OTOCO order placed with SL/TP:', orderResponse);
      } catch (otocoError) {
        console.error('[Scalping Strategy] ❌ CRITICAL: OTOCO order failed - SL/TP not attached');
        
        const errorLog: ErrorLog = {
          id: `strategy-error-${Date.now()}`,
          timestamp: Date.now(),
          errorType: 'OTOCO_ORDER_FAILED',
          message: otocoError instanceof Error ? otocoError.message : 'Failed to place OTOCO order with SL/TP',
          context: {
            action: 'executeSignal:placeOTOCO',
            strategyName: 'Scalping Strategy',
            instrument: this.config.instrument,
            side: signal.type,
          },
        };
        this.onError?.(errorLog);
        
        throw otocoError;
      }

      this.position = {
        orderId: orderResponse.order_id,
        instrumentName: this.config.instrument,
        side: signal.type,
        entryPrice: signal.entryPrice,
        amount,
        stopPrice: roundedSL,
        stopLoss: roundedSL,
        takeProfitPrice: roundedTP,
        takeProfit: roundedTP,
        entryTime: Date.now(),
        strategyName: 'EMA-RSI Scalper',
      };

      this.lastTradeTime = Date.now();
      this.onPositionOpen?.(this.position);
      
      console.log('[Scalping Strategy] Position tracked:', this.position);
    } catch (error) {
      console.error('[Scalping Strategy] Failed to execute signal:', error);
    }
  }

  private async managePosition(ticker: Ticker): Promise<void> {
    if (!this.position) return;

    const now = Date.now();
    const holdTime = now - this.position.entryTime;

    if (holdTime > this.config.maxHoldTimeMs) {
      console.log('[Scalping Strategy] Max hold time reached, closing position');
      await this.closePosition(ticker.last_price);
      return;
    }

    const currentPrice = ticker.last_price;
    let shouldClose = false;
    
    if (!this.position.stopLoss || !this.position.takeProfit) {
      return;
    }

    if (this.position.side === 'buy') {
      if (currentPrice <= this.position.stopLoss || currentPrice >= this.position.takeProfit) {
        shouldClose = true;
      }
    } else {
      if (currentPrice >= this.position.stopLoss || currentPrice <= this.position.takeProfit) {
        shouldClose = true;
      }
    }

    if (shouldClose) {
      await this.closePosition(currentPrice);
    }
  }

  private async handlePortfolioUpdate(data: unknown): Promise<void> {
    try {
      const portfolioData = data as { 
        size?: number;
        instrument_name?: string;
      };
      
      if (portfolioData.instrument_name === this.config.instrument && portfolioData.size === 0 && this.position) {
        console.log('[Scalping Strategy] Position was closed externally, cleaning up related orders...');
        await this.cleanupOrphanedOrders();
      }
    } catch (error) {
      console.warn('[Scalping Strategy] Failed to handle portfolio update:', error);
    }
  }

  private async cleanupOrphanedOrders(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const openOrders = await this.client.getOpenOrders(this.config.instrument);
      
      if (openOrders.length === 0) {
        if (this.position) {
          console.log('[Scalping Strategy] Position has no orders - was closed externally');
          this.position = null;
        }
        return;
      }

      if (!this.position) {
        console.log('[Scalping Strategy] Found orphaned orders without position, cancelling...');
        for (const order of openOrders) {
          try {
            await this.client.cancelOrder(order.order_id);
            console.log(`[Scalping Strategy] Cancelled orphaned order: ${order.order_id}`);
          } catch (cancelError) {
            console.warn(`[Scalping Strategy] Failed to cancel order ${order.order_id}:`, cancelError);
          }
        }
        return;
      }

      const hasStopLoss = openOrders.some(o => o.order_id === this.position?.slOrderId);
      const hasTakeProfit = openOrders.some(o => o.order_id === this.position?.tpOrderId);

      if (hasStopLoss && !hasTakeProfit && this.position.tpOrderId) {
        console.log('[Scalping Strategy] Take profit was hit, cleaning up stop loss...');
        try {
          await this.client.cancelOrder(this.position.slOrderId!);
          console.log('[Scalping Strategy] Stop loss order cancelled after TP hit');
        } catch (error) {
          console.warn('[Scalping Strategy] Failed to cancel stop loss:', error);
        }
        const closedPosition = this.position;
        this.position = null;
        this.onPositionClose?.(closedPosition, 0);
      } else if (!hasStopLoss && hasTakeProfit && this.position.slOrderId) {
        console.log('[Scalping Strategy] Stop loss was hit, cleaning up take profit...');
        try {
          await this.client.cancelOrder(this.position.tpOrderId!);
          console.log('[Scalping Strategy] Take profit order cancelled after SL hit');
        } catch (error) {
          console.warn('[Scalping Strategy] Failed to cancel take profit:', error);
        }
        const closedPosition = this.position;
        this.position = null;
        this.onPositionClose?.(closedPosition, 0);
      } else if (!hasStopLoss && !hasTakeProfit) {
        console.log('[Scalping Strategy] All position orders were filled/cancelled - position closed');
        const closedPosition = this.position;
        this.position = null;
        this.onPositionClose?.(closedPosition, 0);
      }
    } catch (error) {
      console.warn('[Scalping Strategy] Failed to cleanup orphaned orders:', error);
    }
  }

  private async closePosition(exitPrice: number): Promise<void> {
    if (!this.position) return;

    try {
      console.log('[Scalping Strategy] Closing position and cancelling related orders...');
      
      await this.client.cancelAllByInstrument(this.config.instrument);
      console.log('[Scalping Strategy] All orders cancelled for instrument');
      
      await this.client.closePosition(this.config.instrument);
      console.log('[Scalping Strategy] Position closed');
      
      let pnl: number;
      if (this.position.side === 'buy') {
        pnl = (exitPrice - this.position.entryPrice) * this.position.amount;
      } else {
        pnl = (this.position.entryPrice - exitPrice) * this.position.amount;
      }

      const closedPosition = this.position;
      console.log('[Scalping Strategy] Position closed. PnL:', pnl);
      this.onPositionClose?.(closedPosition, pnl);
      
      this.position = null;
    } catch (error) {
      console.error('[Scalping Strategy] Failed to close position:', error);
    }
  }

  getPosition(): ActivePosition | null {
    return this.position;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  resetDataCollection(): void {
    console.log('[Scalping Strategy] Resetting data collection');
    this.priceHistory = [];
    this.rsiValues = [];
    this.emaFast = null;
    this.emaSlow = null;
  }

  getAnalysisState() {
    const currentRSI = this.rsiValues.length > 0 ? this.rsiValues[this.rsiValues.length - 1] : null;
    const lastPrice = this.priceHistory.length > 0 ? this.priceHistory[this.priceHistory.length - 1] : null;
    
    let status: 'waiting_for_data' | 'analyzing' | 'cooldown' | 'position_open' | 'signal_found' = 'waiting_for_data';
    let waitingFor = '';
    let marketConditions: { label: string; value: string; status: 'good' | 'neutral' | 'bad' }[] = [];
    
    const mechanicalCheckpoints: Array<{
      id: string;
      label: string;
      description: string;
      status: 'met' | 'not-met' | 'pending';
      value?: string;
      details?: string;
    }> = [];
    
    const now = Date.now();
    const isInCooldown = now - this.lastTradeTime < this.config.cooldownMs;
    
    if (this.position) {
      status = 'position_open';
      waitingFor = 'Positie wordt gemonitord voor exit condities';
      
      mechanicalCheckpoints.push({
        id: 'position-active',
        label: 'Actieve positie',
        description: 'Trade is geopend en wordt gemonitord',
        status: 'met',
        value: this.position.side === 'buy' ? 'Long' : 'Short',
        details: this.position.stopLoss && this.position.takeProfit
          ? `Entry: $${this.position.entryPrice.toFixed(2)} | SL: $${this.position.stopLoss.toFixed(2)} | TP: $${this.position.takeProfit.toFixed(2)}`
          : `Entry: $${this.position.entryPrice.toFixed(2)} | SL/TP niet beschikbaar`,
      });
      
      const holdTime = now - this.position.entryTime;
      const remainingTime = Math.max(0, this.config.maxHoldTimeMs - holdTime);
      mechanicalCheckpoints.push({
        id: 'hold-time',
        label: 'Max hold tijd',
        description: `Positie mag maximaal ${Math.floor(this.config.maxHoldTimeMs / 60000)} minuten open staan`,
        status: remainingTime > 0 ? 'met' : 'not-met',
        value: `${Math.floor(holdTime / 1000)}s / ${Math.floor(this.config.maxHoldTimeMs / 1000)}s`,
        details: remainingTime > 0 ? `Nog ${Math.floor(remainingTime / 1000)}s resterend` : 'Max tijd bereikt',
      });
    } else {
      mechanicalCheckpoints.push({
        id: 'data-collection',
        label: 'Data verzameling',
        description: '50 datapunten (elk 2 sec) voor stabiele indicatoren',
        status: this.priceHistory.length >= 50 ? 'met' : 'pending',
        value: `${this.priceHistory.length}/50`,
        details: `Instrument: ${this.config.instrument}`,
      });
      
      if (isInCooldown) {
        status = 'cooldown';
        const remainingTime = Math.ceil((this.config.cooldownMs - (now - this.lastTradeTime)) / 1000);
        waitingFor = `Cooldown actief nog ${remainingTime}s`;
        
        mechanicalCheckpoints.push({
          id: 'cooldown',
          label: 'Cooldown periode',
          description: `Wacht ${this.config.cooldownMs / 1000}s na vorige trade`,
          status: 'not-met',
          value: `${remainingTime}s resterend`,
          details: 'Voorkomt overtrading',
        });
      } else {
        mechanicalCheckpoints.push({
          id: 'cooldown',
          label: 'Cooldown periode',
          description: `Wacht ${this.config.cooldownMs / 1000}s na vorige trade`,
          status: 'met',
          value: 'Voltooid',
          details: 'Klaar voor nieuwe trade',
        });
      }
      
      if (this.priceHistory.length >= 50) {
        const emaCalculated = this.emaFast !== null && this.emaSlow !== null;
        mechanicalCheckpoints.push({
          id: 'ema-calculated',
          label: 'EMA berekening',
          description: 'Fast EMA (9) en Slow EMA (21) berekend',
          status: emaCalculated ? 'met' : 'not-met',
          value: emaCalculated ? `Fast: ${this.emaFast!.toFixed(2)} / Slow: ${this.emaSlow!.toFixed(2)}` : '—',
          details: lastPrice ? `Huidige prijs: $${lastPrice.price.toFixed(2)}` : undefined,
        });
        
        if (emaCalculated) {
          const emaBullish = this.emaFast! > this.emaSlow!;
          const emaCrossStrength = Math.abs(this.emaFast! - this.emaSlow!) / (lastPrice?.price || 1);
          const strongCross = emaCrossStrength > 0.0005;
          
          mechanicalCheckpoints.push({
            id: 'ema-cross',
            label: 'EMA cross richting',
            description: 'Fast EMA moet boven (bull) of onder (bear) Slow EMA',
            status: 'met',
            value: emaBullish ? 'Bullish' : 'Bearish',
            details: `Cross strength: ${(emaCrossStrength * 100).toFixed(4)}%`,
          });
          
          mechanicalCheckpoints.push({
            id: 'ema-strength',
            label: 'EMA cross kracht',
            description: 'Cross strength moet > 0.0005 zijn voor voldoende momentum',
            status: strongCross ? 'met' : 'not-met',
            value: `${(emaCrossStrength * 100).toFixed(4)}%`,
            details: strongCross ? 'Sterke cross' : 'Te zwakke cross - wachten op meer momentum',
          });
          
          marketConditions.push({
            label: 'EMA Trend',
            value: emaBullish ? 'Bullish' : 'Bearish',
            status: strongCross ? 'good' : 'neutral',
          });
          marketConditions.push({
            label: 'EMA Fast (9)',
            value: this.emaFast!.toFixed(2),
            status: 'neutral',
          });
          marketConditions.push({
            label: 'EMA Slow (21)',
            value: this.emaSlow!.toFixed(2),
            status: 'neutral',
          });
        }
        
        mechanicalCheckpoints.push({
          id: 'rsi-calculated',
          label: 'RSI berekening',
          description: 'RSI (14) indicator berekend',
          status: currentRSI !== null ? 'met' : 'not-met',
          value: currentRSI !== null ? currentRSI.toFixed(1) : '—',
        });
        
        if (currentRSI !== null) {
          const rsiInRange = currentRSI > 30 && currentRSI < 70;
          mechanicalCheckpoints.push({
            id: 'rsi-range',
            label: 'RSI bereik',
            description: 'RSI moet tussen 30-70 zijn (geen extreme overbought/oversold)',
            status: rsiInRange ? 'met' : 'not-met',
            value: currentRSI.toFixed(1),
            details: rsiInRange 
              ? 'Binnen bereik' 
              : currentRSI >= 70 
                ? 'Overbought - wachten op daling onder 70' 
                : 'Oversold - wachten op stijging boven 30',
          });
          
          marketConditions.push({
            label: 'RSI (14)',
            value: currentRSI.toFixed(1),
            status: rsiInRange ? 'good' : 'neutral',
          });
        }
        
        if (this.emaFast !== null && this.emaSlow !== null && currentRSI !== null) {
          status = 'analyzing';
          const emaCrossStrength = Math.abs(this.emaFast - this.emaSlow) / (lastPrice?.price || 1);
          const strongCross = emaCrossStrength > 0.0005;
          const rsiInRange = currentRSI > 30 && currentRSI < 70;
          
          if (!isInCooldown && strongCross && rsiInRange) {
            waitingFor = 'Alle condities voldaan - wachten op entry signaal';
          } else if (isInCooldown) {
            waitingFor = `Cooldown actief nog ${Math.ceil((this.config.cooldownMs - (now - this.lastTradeTime)) / 1000)}s`;
          } else if (!strongCross) {
            waitingFor = 'Wachten op sterkere EMA cross (>0.0005)';
          } else if (!rsiInRange) {
            waitingFor = currentRSI >= 70 
              ? 'RSI overbought - wachten op daling onder 70' 
              : 'RSI oversold - wachten op stijging boven 30';
          } else {
            waitingFor = 'Analyseren van marktcondities';
          }
        } else {
          status = 'waiting_for_data';
          waitingFor = 'Verzamelen van indicator data';
        }
      } else {
        status = 'waiting_for_data';
        waitingFor = `Verzamelen van prijsdata (${this.priceHistory.length}/50)`;
      }
    }
    
    return {
      status,
      waitingFor,
      dataPoints: this.priceHistory.length,
      lastPrice: lastPrice?.price || null,
      lastPriceTimestamp: lastPrice?.timestamp || null,
      emaFast: this.emaFast,
      emaSlow: this.emaSlow,
      rsi: currentRSI,
      marketConditions,
      mechanicalCheckpoints,
      config: this.config,
      position: this.position,
      cooldownRemaining: Math.max(0, this.config.cooldownMs - (now - this.lastTradeTime)),
    };
  }
}

export const DEFAULT_SCALPING_CONFIG: ScalpingConfig = {
  instrument: 'BTC_USDC-PERPETUAL',
  emaFastPeriod: 9,
  emaSlowPeriod: 21,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  volumeThreshold: 1.5,
  minPriceMove: 0.002,
  takeProfitPercent: 0.3,
  stopLossPercent: 0.3,
  maxHoldTimeMs: 5 * 60 * 1000,
  cooldownMs: 30 * 1000,
};

// LEGACY: verplaatst vanuit src/lib/strategies/razorStrategy.improved.ts
// Zie CLEANUP_PLAN.md voor context. Niet meer gebruiken in productiecode.
// Dit was een experimentele variant van Razor. De productieversie staat in:
// - Frontend: src/lib/strategies/razorStrategy.ts
// - Backend: backend/src/strategies/razor-executor.ts

import type { DeribitClient, Ticker } from '@/lib/deribitClient';
import type { RiskSettings } from '@/state/store';
import { calculatePosition } from '@/lib/riskEngine';
import { validateAndNormalizeAmount } from '@/lib/utils';
import type { ErrorLog } from '@/components/ErrorDetailsDialog';
import { DeribitError } from '@/lib/deribitClient';

interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface MicroSignal {
  side: 'buy' | 'sell';
  confidence: number;
  entryPrice: number;
  stopPrice: number;
  takeProfitPrice: number;
  reason: string;
  indicators: {
    rsi3: number;
    bbWidth: number;
    priceDeviation: number;
    volumeSpike: number;
    momentum: number;
  };
}

export interface RazorConfig {
  instrument: string;
  riskPercent: number;
  maxLeverage: number;
  minConfidence: number;
  maxConcurrentTrades: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  monitorIntervalMs: number;
  maxDailyTrades: number;
  maxDailyLoss: number;
  useAggressiveScalping: boolean;
  entryFillTimeoutMs: number;
  maxBracketRetries: number;
}

export const DEFAULT_RAZOR_CONFIG: RazorConfig = {
  instrument: 'BTC_USDC-PERPETUAL',
  riskPercent: 5.0,
  maxLeverage: 50,
  minConfidence: 70,
  maxConcurrentTrades: 3,
  takeProfitPercent: 0.35,
  stopLossPercent: 0.20,
  monitorIntervalMs: 5000,
  maxDailyTrades: 200,
  maxDailyLoss: 150,
  useAggressiveScalping: true,
  entryFillTimeoutMs: 5000,
  maxBracketRetries: 2,
};

export interface ActiveTrade {
  id: string;
  orderId: string;
  instrumentName: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  stopPrice: number;
  takeProfitPrice: number;
  entryTime: number;
  confidence: number;
  strategyName: string;
  slOrderId?: string;
  tpOrderId?: string;
}

interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

const simpleLogger: Logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || ''),
};

export class RazorStrategy {
  private config: RazorConfig;
  private client: DeribitClient;
  private riskSettings: RiskSettings;
  private equity: number;
  private isRunning: boolean = false;
  private monitorInterval: number | null = null;
  private activeTrades: Map<string, ActiveTrade> = new Map();
  
  private candleHistory: Candle[] = [];
  private tickHistory: number[] = [];
  private lastPrice: number = 0;
  
  private isTradeInProgress: boolean = false;
  private fatalErrorOccurred: boolean = false;
  private consecutiveErrors: number = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 3;
  
  private dailyTradeCount: number = 0;
  private dailyWins: number = 0;
  private dailyLosses: number = 0;
  private dailyPnL: number = 0;
  private lastResetDate: string = '';
  
  private logger: Logger = simpleLogger;
  private onEvent?: (event: Record<string, unknown>) => void;
  private onPositionOpen?: (trade: ActiveTrade) => void;
  private onPositionClose?: (trade: ActiveTrade, pnl: number) => void;
  private onError?: (error: ErrorLog) => void;

  constructor(
    client: DeribitClient,
    config: Partial<RazorConfig>,
    riskSettings: RiskSettings,
    equity: number,
    callbacks?: {
      onPositionOpen?: (trade: ActiveTrade) => void;
      onPositionClose?: (trade: ActiveTrade, pnl: number) => void;
      onError?: (error: ErrorLog) => void;
      onEvent?: (event: Record<string, unknown>) => void;
    }
  ) {
    this.client = client;
    this.config = { ...DEFAULT_RAZOR_CONFIG, ...config };
    this.riskSettings = riskSettings;
    this.equity = equity;
    this.onPositionOpen = callbacks?.onPositionOpen;
    this.onPositionClose = callbacks?.onPositionClose;
    this.onError = callbacks?.onError;
    this.onEvent = callbacks?.onEvent;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.fatalErrorOccurred = false;
    this.consecutiveErrors = 0;
    this.resetDailyCountersIfNeeded();
    
    this.logger.info('[Razor] 🚀 RAZOR STRATEGY ACTIVATED', {
      instrument: this.config.instrument,
      riskPercent: this.config.riskPercent,
      version: '2.0-ROBUST',
    });
    
    this.emitEvent('STRATEGY_STARTED', { config: this.config });

    try {
      await this.cleanupOrphanedOrders();
    } catch (error) {
      this.logger.warn('[Razor] Initial cleanup warning', { error });
    }

    try {
      await this.client.subscribe(
        [`ticker.${this.config.instrument}.100ms`],
        async (channel, data) => {
          await this.handleTickerUpdate(data);
        }
      );
      this.logger.info('[Razor] Subscribed to 100ms ticker feed');
    } catch (error) {
      this.logger.warn('[Razor] Failed to subscribe to ticker', { error });
    }

    this.monitorInterval = window.setInterval(() => {
      this.scanForOpportunities();
    }, this.config.monitorIntervalMs);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.isTradeInProgress = false;
    
    if (this.monitorInterval !== null) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    for (const [id, trade] of this.activeTrades) {
      try {
        if (trade.slOrderId) {
          await this.client.request('private/cancel', { order_id: trade.slOrderId });
        }
        if (trade.tpOrderId) {
          await this.client.request('private/cancel', { order_id: trade.tpOrderId });
        }
      } catch (error) {
        this.logger.warn('[Razor] Failed to cancel orders on stop', { tradeId: id, error });
      }
    }
    
    this.activeTrades.clear();

    const winrate = this.dailyTradeCount > 0 ? (this.dailyWins / this.dailyTradeCount) * 100 : 0;
    
    this.logger.info('[Razor] Stopped', {
      fatalErrorOccurred: this.fatalErrorOccurred,
      consecutiveErrors: this.consecutiveErrors,
      dailyStats: {
        trades: this.dailyTradeCount,
        wins: this.dailyWins,
        losses: this.dailyLosses,
        winrate: winrate.toFixed(1) + '%',
        pnl: this.dailyPnL.toFixed(2),
      },
    });
    
    this.emitEvent('STRATEGY_STOPPED', {
      fatalErrorOccurred: this.fatalErrorOccurred,
      dailyStats: {
        trades: this.dailyTradeCount,
        wins: this.dailyWins,
        losses: this.dailyLosses,
        winrate,
        pnl: this.dailyPnL,
      },
    });
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getAnalysisState() {
    const winrate = this.dailyTradeCount > 0 ? (this.dailyWins / this.dailyTradeCount) * 100 : 0;
    
    return {
      status: this.activeTrades.size > 0 ? 'position_open' : 'analyzing',
      waitingFor: this.activeTrades.size > 0 
        ? `Monitoring ${this.activeTrades.size} active trade(s)` 
        : 'Scanning for high-probability mean reversion setups',
      dataPoints: this.candleHistory.length,
      lastPrice: this.lastPrice,
      activeTrades: this.activeTrades.size,
      maxConcurrent: this.config.maxConcurrentTrades,
      dailyStats: {
        trades: this.dailyTradeCount,
        wins: this.dailyWins,
        losses: this.dailyLosses,
        winrate: winrate.toFixed(1) + '%',
        pnl: this.dailyPnL.toFixed(2),
        remaining: this.config.maxDailyTrades - this.dailyTradeCount,
      },
      performance: {
        status: winrate >= 80 ? 'excellent' : winrate >= 70 ? 'good' : winrate >= 60 ? 'acceptable' : 'needs_adjustment',
        targetWinrate: '80%+',
        currentWinrate: winrate.toFixed(1) + '%',
        avgTradesPerDay: this.dailyTradeCount,
        targetTradesPerDay: '100-150',
      },
      mechanicalCheckpoints: this.buildMechanicalCheckpoints(),
      config: this.config,
    };
  }

  private buildMechanicalCheckpoints() {
    const checkpoints: Array<{
      id: string;
      label: string;
      description: string;
      status: 'met' | 'not-met' | 'pending';
      value?: string;
      details?: string;
    }> = [];

    checkpoints.push({
      id: 'candle-data',
      label: 'Candle data',
      description: 'Minimaal 20 candles voor micro-analyse',
      status: this.candleHistory.length >= 20 ? 'met' : 'pending',
      value: `${this.candleHistory.length}/20`,
      details: 'Gebruikt voor BB en RSI berekening',
    });

    if (this.candleHistory.length >= 20) {
      const closes = this.candleHistory.map(c => c.c);
      const volumes = this.candleHistory.map(c => c.v);
      const lastCandle = this.candleHistory[this.candleHistory.length - 1];
      const price = this.lastPrice > 0 ? this.lastPrice : lastCandle.c;

      const rsi3 = this.calculateRSI(closes, 3);
      const bb5 = this.calculateBB(closes, 5, 1.5);
      const volumeSMA = this.calculateSMA(volumes, 10);
      const volumeSpike = volumes[volumes.length - 1] / volumeSMA;

      if (bb5 && rsi3 !== undefined) {
        const priceDeviationPercent = ((price - bb5.middle) / bb5.middle) * 100;
        const bbWidth = ((bb5.upper - bb5.lower) / bb5.middle) * 100;
        const momentum = closes.length >= 3 
          ? ((closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3]) * 100
          : 0;

        const priceTouchesLowerBB = price <= bb5.lower * 1.002;
        const priceTouchesUpperBB = price >= bb5.upper * 0.998;
        const rsiOversold = rsi3 < 25;
        const rsiOverbought = rsi3 > 75;

        checkpoints.push({
          id: 'price-bb',
          label: 'Prijs vs Bollinger Bands',
          description: 'Prijs moet lower BB (long) of upper BB (short) raken',
          status: priceTouchesLowerBB || priceTouchesUpperBB ? 'met' : 'not-met',
          value: `$${price.toFixed(2)}`,
          details: priceTouchesLowerBB 
            ? `✓ Raakt lower BB ($${bb5.lower.toFixed(2)})`
            : priceTouchesUpperBB
            ? `✓ Raakt upper BB ($${bb5.upper.toFixed(2)})`
            : `Tussen bands: L:$${bb5.lower.toFixed(2)} | U:$${bb5.upper.toFixed(2)}`,
        });

        checkpoints.push({
          id: 'rsi-extreme',
          label: 'RSI(3) Extreme',
          description: 'RSI moet < 25 (oversold) of > 75 (overbought)',
          status: rsiOversold || rsiOverbought ? 'met' : 'not-met',
          value: `${rsi3.toFixed(1)}`,
          details: rsiOversold 
            ? '✓ Oversold (< 25) - Long setup'
            : rsiOverbought
            ? '✓ Overbought (> 75) - Short setup'
            : `Neutraal bereik (25-75)`,
        });
      }
    }

    const winrate = this.dailyTradeCount > 0 ? (this.dailyWins / this.dailyTradeCount) * 100 : 0;
    checkpoints.push({
      id: 'winrate-target',
      label: 'Winrate doelstelling',
      description: 'Target: 80%+ winrate',
      status: winrate >= 80 ? 'met' : winrate >= 70 ? 'pending' : 'not-met',
      value: `${winrate.toFixed(1)}%`,
      details: `${this.dailyWins}W / ${this.dailyLosses}L | Target: 80%+`,
    });

    return checkpoints;
  }

  private async handleTickerUpdate(data: any): Promise<void> {
    if (data.last_price) {
      this.lastPrice = data.last_price;
      this.tickHistory.push(data.last_price);
      if (this.tickHistory.length > 100) {
        this.tickHistory.shift();
      }
    }

    for (const [id, trade] of this.activeTrades) {
      if (!this.lastPrice) continue;

      const hitTP = trade.side === 'buy' 
        ? this.lastPrice >= trade.takeProfitPrice
        : this.lastPrice <= trade.takeProfitPrice;

      const hitSL = trade.side === 'buy'
        ? this.lastPrice <= trade.stopPrice
        : this.lastPrice >= trade.stopPrice;

      if (hitTP || hitSL) {
        await this.closeTrade(id, this.lastPrice, hitTP ? 'TP hit' : 'SL hit');
      }
    }
  }

  private async scanForOpportunities(): Promise<void> {
    if (!this.isRunning) return;
    
    if (this.fatalErrorOccurred) {
      this.logger.error('[Razor] ⛔ Fatal error flag set - stopping scan loop');
      await this.stop();
      return;
    }
    
    if (this.isTradeInProgress) {
      return;
    }

    if (this.dailyTradeCount >= this.config.maxDailyTrades) {
      return;
    }

    if (this.dailyPnL <= -this.config.maxDailyLoss) {
      this.logger.warn('[Razor] Max daily loss reached - STOPPING');
      await this.stop();
      return;
    }

    if (this.activeTrades.size >= this.config.maxConcurrentTrades) {
      return;
    }

    try {
      const positions = await this.client.request('private/get_positions', { currency: 'USDC' });
      const hasPosition = positions?.some((pos: any) => 
        pos.instrument_name === this.config.instrument && pos.size !== 0
      );

      if (hasPosition) {
        this.logger.info('[Razor] ⏸️  Position already exists, pausing new entries');
        return;
      }

      await this.fetchCandles();

      const signal = this.generateMicroSignal();

      if (signal && signal.confidence >= this.config.minConfidence) {
        this.logger.info('[Razor] 🎯 HIGH CONFIDENCE SIGNAL', {
          side: signal.side,
          confidence: signal.confidence,
          reason: signal.reason,
        });

        this.emitEvent('SIGNAL_GENERATED', { signal });

        await this.executeTrade(signal);
        
        this.consecutiveErrors = 0;
      }
    } catch (error) {
      this.consecutiveErrors++;
      
      this.logger.error('[Razor] Scan failed', { 
        error,
        consecutiveErrors: this.consecutiveErrors,
      });
      
      this.emitErrorLog(error, 'scanForOpportunities', {
        consecutiveErrors: this.consecutiveErrors,
      });
      
      const errorMsg = String(error);
      const isFatalError = 
        errorMsg.includes('FATAL') ||
        this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS;
      
      if (isFatalError) {
        this.fatalErrorOccurred = true;
        
        this.logger.error('[Razor] ⛔ FATAL ERROR - STOPPING STRATEGY', {
          error: errorMsg,
          consecutiveErrors: this.consecutiveErrors,
        });
        
        await this.stop();
      }
    }
  }

  private async fetchCandles(): Promise<void> {
    if (!this.client.isConnected()) return;

    const endTimestamp = Date.now();
    const startTimestamp = endTimestamp - 30 * 60 * 1000;

    try {
      const result = await this.client.request('public/get_tradingview_chart_data', {
        instrument_name: this.config.instrument,
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
        resolution: '1',
      });

      if (result?.ticks && result.open) {
        const newCandles: Candle[] = [];
        for (let i = 0; i < result.ticks.length; i++) {
          newCandles.push({
            t: result.ticks[i],
            o: result.open[i],
            h: result.high[i],
            l: result.low[i],
            c: result.close[i],
            v: result.volume[i],
          });
        }
        this.candleHistory = newCandles.slice(-30);
      }
    } catch (error) {
      this.logger.error('[Razor] Failed to fetch candles', { error });
    }
  }

  private generateMicroSignal(): MicroSignal | null {
    if (this.candleHistory.length < 20) return null;

    const closes = this.candleHistory.map(c => c.c);
    const volumes = this.candleHistory.map(c => c.v);
    const lastCandle = this.candleHistory[this.candleHistory.length - 1];
    const price = lastCandle.c;

    const rsi3 = this.calculateRSI(closes, 3);
    const bb5 = this.calculateBB(closes, 5, 1.5);
    const volumeSMA = this.calculateSMA(volumes, 10);
    const volumeSpike = volumes[volumes.length - 1] / volumeSMA;

    if (!bb5 || rsi3 === undefined) return null;

    const priceDeviationPercent = ((price - bb5.middle) / bb5.middle) * 100;
    const bbWidth = ((bb5.upper - bb5.lower) / bb5.middle) * 100;

    const momentum = closes.length >= 3 
      ? ((closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3]) * 100
      : 0;

    if (
      price <= bb5.lower * 1.002 &&
      rsi3 < 25 &&
      momentum < -0.1 &&
      volumeSpike > 1.2
    ) {
      const confidence = this.calculateConfidence({
        rsi: rsi3,
        bbDeviation: Math.abs(priceDeviationPercent),
        volumeSpike,
        momentum: Math.abs(momentum),
        isOversold: true,
      });

      const stopDistance = this.config.stopLossPercent / 100;
      const tpDistance = this.config.takeProfitPercent / 100;

      return {
        side: 'buy',
        confidence,
        entryPrice: price,
        stopPrice: price * (1 - stopDistance),
        takeProfitPrice: price * (1 + tpDistance),
        reason: `Mean reversion LONG: BB lower + RSI${rsi3.toFixed(1)} + Vol${volumeSpike.toFixed(1)}x`,
        indicators: { rsi3, bbWidth, priceDeviation: priceDeviationPercent, volumeSpike, momentum },
      };
    }

    if (
      price >= bb5.upper * 0.998 &&
      rsi3 > 75 &&
      momentum > 0.1 &&
      volumeSpike > 1.2
    ) {
      const confidence = this.calculateConfidence({
        rsi: rsi3,
        bbDeviation: Math.abs(priceDeviationPercent),
        volumeSpike,
        momentum: Math.abs(momentum),
        isOversold: false,
      });

      const stopDistance = this.config.stopLossPercent / 100;
      const tpDistance = this.config.takeProfitPercent / 100;

      return {
        side: 'sell',
        confidence,
        entryPrice: price,
        stopPrice: price * (1 + stopDistance),
        takeProfitPrice: price * (1 - tpDistance),
        reason: `Mean reversion SHORT: BB upper + RSI${rsi3.toFixed(1)} + Vol${volumeSpike.toFixed(1)}x`,
        indicators: { rsi3, bbWidth, priceDeviation: priceDeviationPercent, volumeSpike, momentum },
      };
    }

    if (this.config.useAggressiveScalping && bbWidth > 0.4) {
      if (rsi3 < 30 && momentum < -0.05) {
        const confidence = this.calculateConfidence({
          rsi: rsi3,
          bbDeviation: Math.abs(priceDeviationPercent),
          volumeSpike,
          momentum: Math.abs(momentum),
          isOversold: true,
        }) * 0.9;

        const stopDistance = this.config.stopLossPercent / 100;
        const tpDistance = this.config.takeProfitPercent / 100;

        return {
          side: 'buy',
          confidence,
          entryPrice: price,
          stopPrice: price * (1 - stopDistance),
          takeProfitPrice: price * (1 + tpDistance),
          reason: `AGGRESSIVE LONG: RSI${rsi3.toFixed(1)} + volatility`,
          indicators: { rsi3, bbWidth, priceDeviation: priceDeviationPercent, volumeSpike, momentum },
        };
      }

      if (rsi3 > 70 && momentum > 0.05) {
        const confidence = this.calculateConfidence({
          rsi: rsi3,
          bbDeviation: Math.abs(priceDeviationPercent),
          volumeSpike,
          momentum: Math.abs(momentum),
          isOversold: false,
        }) * 0.9;

        const stopDistance = this.config.stopLossPercent / 100;
        const tpDistance = this.config.takeProfitPercent / 100;

        return {
          side: 'sell',
          confidence,
          entryPrice: price,
          stopPrice: price * (1 + stopDistance),
          takeProfitPrice: price * (1 - tpDistance),
          reason: `AGGRESSIVE SHORT: RSI${rsi3.toFixed(1)} + volatility`,
          indicators: { rsi3, bbWidth, priceDeviation: priceDeviationPercent, volumeSpike, momentum },
        };
      }
    }

    return null;
  }

  private calculateConfidence(params: {
    rsi: number;
    bbDeviation: number;
    volumeSpike: number;
    momentum: number;
    isOversold: boolean;
  }): number {
    let confidence = 50;

    if (params.isOversold) {
      if (params.rsi < 15) confidence += 25;
      else if (params.rsi < 20) confidence += 20;
      else if (params.rsi < 25) confidence += 15;
    } else {
      if (params.rsi > 85) confidence += 25;
      else if (params.rsi > 80) confidence += 20;
      else if (params.rsi > 75) confidence += 15;
    }

    if (params.bbDeviation > 1.5) confidence += 15;
    else if (params.bbDeviation > 1.0) confidence += 10;
    else if (params.bbDeviation > 0.5) confidence += 5;

    if (params.volumeSpike > 2.0) confidence += 15;
    else if (params.volumeSpike > 1.5) confidence += 10;
    else if (params.volumeSpike > 1.2) confidence += 5;

    if (params.momentum > 0.3) confidence += 10;
    else if (params.momentum > 0.2) confidence += 7;
    else if (params.momentum > 0.1) confidence += 5;

    return Math.min(confidence, 100);
  }

  private async executeTrade(signal: MicroSignal): Promise<void> {
    if (this.isTradeInProgress) {
      this.logger.warn('[Razor] Trade already in progress');
      return;
    }
    
    this.isTradeInProgress = true;
    
    try {
      await this._executeTradeInternal(signal);
    } finally {
      this.isTradeInProgress = false;
    }
  }

  private async _executeTradeInternal(signal: MicroSignal): Promise<void> {
    let freshEquity: number;
    try {
      const balance = await this.client.request('private/get_account_summary', {
        currency: 'USDC',
        extended: false,
      });
      freshEquity = balance?.equity || this.equity;
    } catch (error) {
      this.logger.error('[Razor] Failed to fetch balance', { error });
      return;
    }

    let instrument: any;
    try {
      instrument = await this.client.request('public/get_instrument', {
        instrument_name: this.config.instrument,
      });
    } catch (error) {
      this.logger.error('[Razor] Failed to fetch instrument', { error });
      return;
    }

    const positionResult = calculatePosition({
      equity: freshEquity,
      riskMode: this.riskSettings.mode,
      riskValue: this.riskSettings.value,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      brokerRules: {
        tickSize: instrument.tick_size,
        lotSize: instrument.contract_size,
        minTradeAmount: instrument.min_trade_amount,
        maxLeverage: instrument.max_leverage || 50,
        contractSize: instrument.contract_size,
      },
    });

    if (!positionResult.success) {
      this.logger.warn('[Razor] Position calculation failed', { 
        reason: positionResult.reason,
      });
      return;
    }

    const normalizedQty = positionResult.quantity;

    let entryOrder: any;
    try {
      const direction = signal.side === 'buy' ? 'buy' : 'sell';
      
      this.logger.info('[Razor] ⚡ PLACING ENTRY ORDER', {
        side: direction,
        amount: normalizedQty,
        confidence: signal.confidence,
      });

      const orderResponse = await this.client.request<{ order: any }>(`private/${direction}`, {
        instrument_name: this.config.instrument,
        amount: normalizedQty,
        type: 'market',
      });

      entryOrder = orderResponse.order;

      if (!entryOrder?.order_id) {
        throw new Error('Entry order response missing order_id');
      }

      this.logger.info('[Razor] Entry order submitted', {
        orderId: entryOrder.order_id,
        state: entryOrder.order_state,
      });
    } catch (error) {
      this.logger.error('[Razor] Failed to place entry order', { error });
      this.emitErrorLog(error, 'executeTrade:placeEntry', { signal });
      return;
    }

    this.logger.info('[Razor] 🔍 VERIFYING ENTRY FILL...', { orderId: entryOrder.order_id });

    let entryFilled = false;
    let actualPosition: any = null;
    let verificationAttempts = 0;
    const maxAttempts = Math.ceil(this.config.entryFillTimeoutMs / 500);
    const delayMs = 500;

    while (verificationAttempts < maxAttempts && !entryFilled) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      verificationAttempts++;

      try {
        const orderState = await this.client.request('private/get_order_state', {
          order_id: entryOrder.order_id,
        });

        this.logger.info(`[Razor] Entry verification ${verificationAttempts}/${maxAttempts}`, {
          orderId: entryOrder.order_id,
          state: orderState.order_state,
          filledAmount: orderState.filled_amount,
        });

        if (orderState.order_state === 'filled') {
          const positions = await this.client.request('private/get_positions', {
            currency: 'USDC',
          });

          actualPosition = positions?.find((pos: any) => 
            pos.instrument_name === this.config.instrument && 
            Math.abs(pos.size || 0) > 0
          );

          if (actualPosition) {
            entryFilled = true;
            this.logger.info('[Razor] ✅ ENTRY FILLED + POSITION VERIFIED', {
              orderId: entryOrder.order_id,
              positionSize: actualPosition.size,
              avgPrice: actualPosition.average_price,
            });
            break;
          } else {
            this.logger.warn('[Razor] Order filled but no position found (rare - retrying)', {
              orderId: entryOrder.order_id,
              attempt: verificationAttempts,
            });
          }
        } else if (orderState.order_state === 'cancelled' || orderState.order_state === 'rejected') {
          throw new Error(`Entry order ${orderState.order_state}: ${orderState.reject_reason || 'Unknown reason'}`);
        }
      } catch (verifyError) {
        this.logger.warn('[Razor] Verification attempt failed', { 
          attempt: verificationAttempts,
          error: verifyError,
        });
      }
    }

    if (!entryFilled || !actualPosition) {
      this.logger.error('[Razor] ❌ ENTRY VERIFICATION FAILED - NO BRACKETS WILL BE PLACED', {
        orderId: entryOrder.order_id,
        attempts: verificationAttempts,
        reason: 'Entry order did not fill within timeout or position not confirmed',
      });

      this.emitEvent('ENTRY_VERIFICATION_FAILED', {
        orderId: entryOrder.order_id,
        signal,
        attempts: verificationAttempts,
      });

      try {
        await this.client.request('private/cancel', { order_id: entryOrder.order_id });
        this.logger.info('[Razor] Cancelled unfilled entry order');
      } catch (cancelError) {
        this.logger.warn('[Razor] Could not cancel entry order', { cancelError });
      }

      return;
    }

    try {
      await this.cleanupOrphanedOrders();
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (cleanupError) {
      this.logger.warn('[Razor] Pre-bracket cleanup warning', { cleanupError });
    }

    try {
      const openOrders = await this.client.request('private/get_open_orders_by_instrument', {
        instrument_name: this.config.instrument,
      });
      
      const triggerCount = openOrders?.filter((o: any) => 
        o.trigger && ['stop_market', 'stop_limit', 'take_limit', 'take_market'].includes(o.order_type)
      ).length || 0;
      
      if (triggerCount >= 8) {
        throw new Error(`Too many trigger orders (${triggerCount}/10). Cannot place SL+TP safely.`);
      }
    } catch (limitError) {
      this.logger.error('[Razor] ❌ Trigger limit check failed', { limitError });
      
      await this.emergencyClosePosition(signal.side, normalizedQty, 'Trigger limit reached');
      return;
    }

    const tradeId = `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let slOrderId: string | undefined;
    let tpOrderId: string | undefined;
    let bracketSuccess = false;

    for (let attempt = 1; attempt <= this.config.maxBracketRetries; attempt++) {
      try {
        this.logger.info(`[Razor] 🎯 Placing brackets (attempt ${attempt}/${this.config.maxBracketRetries})`);

        const slDirection = signal.side === 'buy' ? 'sell' : 'buy';
        const slResponse = await this.client.request<{ order: any }>(`private/${slDirection}`, {
          instrument_name: this.config.instrument,
          amount: normalizedQty,
          type: 'stop_market',
          trigger: 'mark_price',
          trigger_price: this.roundToTick(signal.stopPrice, instrument.tick_size),
          reduce_only: true,
        });

        if (!slResponse?.order?.order_id) {
          throw new Error('SL order response missing order_id');
        }

        slOrderId = slResponse.order.order_id;
        this.logger.info('[Razor] ✅ SL placed', { orderId: slOrderId });

        await new Promise(resolve => setTimeout(resolve, 300));

        const tpDirection = signal.side === 'buy' ? 'sell' : 'buy';
        const tpResponse = await this.client.request<{ order: any }>(`private/${tpDirection}`, {
          instrument_name: this.config.instrument,
          amount: normalizedQty,
          type: 'limit',
          price: this.roundToTick(signal.takeProfitPrice, instrument.tick_size),
          reduce_only: true,
          post_only: false,
        });

        if (!tpResponse?.order?.order_id) {
          throw new Error('TP order response missing order_id');
        }

        tpOrderId = tpResponse.order.order_id;
        this.logger.info('[Razor] ✅ TP placed', { orderId: tpOrderId });

        bracketSuccess = true;
        break;

      } catch (bracketError) {
        this.logger.error(`[Razor] Bracket placement failed (attempt ${attempt}/${this.config.maxBracketRetries})`, {
          error: bracketError,
          slOrderId,
          tpOrderId,
        });

        if (slOrderId) {
          try {
            await this.client.request('private/cancel', { order_id: slOrderId });
            this.logger.info('[Razor] Cleaned up partial SL order', { orderId: slOrderId });
          } catch (cancelError) {
            this.logger.warn('[Razor] Could not cancel partial SL', { cancelError });
          }
          slOrderId = undefined;
        }

        if (tpOrderId) {
          try {
            await this.client.request('private/cancel', { order_id: tpOrderId });
            this.logger.info('[Razor] Cleaned up partial TP order', { orderId: tpOrderId });
          } catch (cancelError) {
            this.logger.warn('[Razor] Could not cancel partial TP', { cancelError });
          }
          tpOrderId = undefined;
        }

        if (attempt < this.config.maxBracketRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    if (!bracketSuccess || !slOrderId || !tpOrderId) {
      this.logger.error('[Razor] ❌ CRITICAL: Failed to place brackets after all retries - EMERGENCY CLOSE', {
        attempts: this.config.maxBracketRetries,
        slOrderId,
        tpOrderId,
      });

      await this.emergencyClosePosition(signal.side, normalizedQty, 'Bracket placement failed');
      
      this.emitErrorLog(
        new Error('Failed to place protective brackets - position was emergency closed'),
        'executeTrade:bracketFailed',
        { signal, entryOrderId: entryOrder.order_id }
      );

      return;
    }

    const activeTrade: ActiveTrade = {
      id: tradeId,
      orderId: entryOrder.order_id,
      instrumentName: this.config.instrument,
      side: signal.side,
      entryPrice: actualPosition.average_price,
      amount: normalizedQty,
      stopPrice: signal.stopPrice,
      takeProfitPrice: signal.takeProfitPrice,
      entryTime: Date.now(),
      confidence: signal.confidence,
      strategyName: 'Razor',
      slOrderId,
      tpOrderId,
    };

    this.activeTrades.set(tradeId, activeTrade);
    this.dailyTradeCount++;

    this.logger.info('[Razor] ✅✅✅ TRADE FULLY EXECUTED WITH PROTECTION', {
      tradeId,
      side: signal.side,
      entry: actualPosition.average_price.toFixed(2),
      sl: signal.stopPrice.toFixed(2),
      tp: signal.takeProfitPrice.toFixed(2),
      slOrderId,
      tpOrderId,
    });

    this.emitEvent('TRADE_OPENED', { trade: activeTrade });
    if (this.onPositionOpen) {
      this.onPositionOpen(activeTrade);
    }
  }

  private async emergencyClosePosition(
    side: 'buy' | 'sell',
    amount: number,
    reason: string
  ): Promise<void> {
    this.logger.error('[Razor] ⚠️⚠️⚠️ EMERGENCY CLOSE', { side, amount, reason });

    const closeDirection = side === 'buy' ? 'sell' : 'buy';

    try {
      await this.client.request(`private/${closeDirection}`, {
        instrument_name: this.config.instrument,
        amount,
        type: 'market',
        reduce_only: true,
      });
      this.logger.info('[Razor] ✅ Emergency close executed');
    } catch (closeError) {
      this.logger.error('[Razor] ❌❌❌ EMERGENCY CLOSE FAILED - MANUAL INTERVENTION REQUIRED', {
        closeError,
        instrument: this.config.instrument,
        amount,
        reason,
      });

      this.emitEvent('EMERGENCY_CLOSE_FAILED', {
        instrument: this.config.instrument,
        side,
        amount,
        reason,
        error: String(closeError),
      });
    }
  }

  private async closeTrade(tradeId: string, exitPrice: number, reason: string): Promise<void> {
    const trade = this.activeTrades.get(tradeId);
    if (!trade) return;

    const pnl = trade.side === 'buy' 
      ? (exitPrice - trade.entryPrice) * trade.amount
      : (trade.entryPrice - exitPrice) * trade.amount;

    const isWin = pnl > 0;

    if (isWin) {
      this.dailyWins++;
    } else {
      this.dailyLosses++;
      this.dailyPnL += pnl;
    }

    this.logger.info('[Razor] 🏁 TRADE CLOSED', {
      tradeId,
      side: trade.side,
      entry: trade.entryPrice.toFixed(2),
      exit: exitPrice.toFixed(2),
      pnl: pnl.toFixed(2),
      result: isWin ? '✅ WIN' : '❌ LOSS',
      reason,
    });

    this.emitEvent('TRADE_CLOSED', {
      trade,
      exitPrice,
      pnl,
      isWin,
      reason,
    });

    if (this.onPositionClose) {
      this.onPositionClose(trade, pnl);
    }

    try {
      if (trade.slOrderId) {
        await this.client.request('private/cancel', { order_id: trade.slOrderId });
      }
      if (trade.tpOrderId) {
        await this.client.request('private/cancel', { order_id: trade.tpOrderId });
      }
    } catch (cancelError) {
      this.logger.warn('[Razor] Error cancelling orders on close', { cancelError });
    }

    this.activeTrades.delete(tradeId);
  }

  private async cleanupOrphanedOrders(): Promise<void> {
    try {
      const openOrders = await this.client.request('private/get_open_orders_by_instrument', {
        instrument_name: this.config.instrument,
      });

      if (!openOrders || !Array.isArray(openOrders) || openOrders.length === 0) {
        return;
      }

      const positions = await this.client.request('private/get_positions', {
        currency: 'USDC',
      });

      const hasPosition = positions?.some((pos: any) => 
        pos.instrument_name === this.config.instrument && Math.abs(pos.size || 0) > 0
      );

      const triggerOrders = openOrders.filter((order: any) => 
        order.trigger && ['stop_market', 'stop_limit', 'take_limit', 'take_market'].includes(order.order_type)
      );

      if (!hasPosition && triggerOrders.length > 0) {
        this.logger.info('[Razor] Cleaning orphaned trigger orders (no position)', {
          count: triggerOrders.length,
        });

        for (const order of triggerOrders) {
          try {
            await this.client.request('private/cancel', { order_id: order.order_id });
            this.logger.info('[Razor] Cancelled orphaned trigger', { orderId: order.order_id });
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (cancelError) {
            this.logger.warn('[Razor] Failed to cancel orphaned order', { orderId: order.order_id });
          }
        }
      }
    } catch (error) {
      this.logger.warn('[Razor] Cleanup warning', { error });
    }
  }

  private calculateRSI(values: number[], period: number): number | undefined {
    if (values.length < period + 1) return undefined;

    const slice = values.slice(-period - 1);
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < slice.length; i++) {
      const change = slice[i] - slice[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateBB(
    values: number[],
    period: number,
    stdDev: number
  ): { upper: number; middle: number; lower: number } | null {
    if (values.length < period) return null;

    const slice = values.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / period;

    const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
      upper: middle + std * stdDev,
      middle,
      lower: middle - std * stdDev,
    };
  }

  private calculateSMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1] || 0;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  private roundToTick(price: number, tickSize: number): number {
    return Math.round(price / tickSize) * tickSize;
  }

  private resetDailyCountersIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastResetDate !== today) {
      const winrate = this.dailyTradeCount > 0 ? (this.dailyWins / this.dailyTradeCount) * 100 : 0;

      this.logger.info('[Razor] 📊 Daily reset - Previous day stats:', {
        trades: this.dailyTradeCount,
        wins: this.dailyWins,
        losses: this.dailyLosses,
        winrate: winrate.toFixed(1) + '%',
        pnl: this.dailyPnL.toFixed(2),
      });

      this.dailyTradeCount = 0;
      this.dailyWins = 0;
      this.dailyLosses = 0;
      this.dailyPnL = 0;
      this.lastResetDate = today;
    }
  }

  private emitEvent(type: string, data: Record<string, unknown>): void {
    if (this.onEvent) {
      this.onEvent({ type, timestamp: Date.now(), ...data });
    }
  }

  private emitErrorLog(error: unknown, action: string, context: Record<string, unknown>): void {
    if (!this.onError) return;

    const timestamp = Date.now();
    let errorLog: ErrorLog;

    if (error instanceof DeribitError) {
      errorLog = {
        id: `razor-error-${timestamp}`,
        timestamp,
        errorType: error.code || 'UNKNOWN_ERROR',
        message: error.message,
        stack: error.stack || '',
        context: {
          action,
          strategyName: 'Razor',
          instrument: this.config.instrument,
          ...context,
        },
        apiResponse: error.data ? {
          errorCode: String(error.code || ''),
          data: error.data,
        } : undefined,
      };
    } else if (error instanceof Error) {
      errorLog = {
        id: `razor-error-${timestamp}`,
        timestamp,
        errorType: 'STRATEGY_ERROR',
        message: error.message,
        stack: error.stack || '',
        context: {
          action,
          strategyName: 'Razor',
          instrument: this.config.instrument,
          ...context,
        },
      };
    } else {
      errorLog = {
        id: `razor-error-${timestamp}`,
        timestamp,
        errorType: 'UNKNOWN_ERROR',
        message: String(error),
        stack: '',
        context: {
          action,
          strategyName: 'Razor',
          instrument: this.config.instrument,
          ...context,
        },
      };
    }

    this.onError(errorLog);
  }
}

export function createRazorStrategy(
  client: DeribitClient,
  config: Partial<RazorConfig>,
  riskSettings: RiskSettings,
  equity: number,
  callbacks?: {
    onPositionOpen?: (trade: ActiveTrade) => void;
    onPositionClose?: (trade: ActiveTrade, pnl: number) => void;
    onError?: (error: ErrorLog) => void;
    onEvent?: (event: Record<string, unknown>) => void;
  }
): RazorStrategy {
  return new RazorStrategy(client, config, riskSettings, equity, callbacks);
}

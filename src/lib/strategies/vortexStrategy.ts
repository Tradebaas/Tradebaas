import type { DeribitClient, Ticker } from '@/lib/deribitClient';
import type { RiskSettings } from '@/state/store';
import { calculatePosition } from '@/lib/riskEngine';
import { validateAndNormalizeAmount } from '@/lib/utils';
import type { ErrorLog } from '@/components/dialogs/ErrorDetailsDialog';
import { DeribitError } from '@/lib/deribitClient';
import { AdvancedBracketManager, type IndicatorData } from '@/lib/orders/AdvancedBracketManager';
import { ema, bollinger, rsi } from '@/lib/indicators/basic';
import type { Candle } from '@/lib/indicators/types';

export type TrailMethod = 'swing' | 'ema20' | 'oppBB' | 'rsiFlip';

interface TradingViewResult {
  ticks: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

interface DeribitBalance {
  equity?: number;
}

interface DeribitOrderState {
  order_state: string;
}

export interface VortexConfig {
  instrument: string;
  riskMode: 'percent' | 'fixed';
  riskValue: number;
  maxLeverage: number;
  trailMethod: TrailMethod;
  monitorIntervalMs: number;
  minSpreadTicks?: number;
  cancelOnNews?: boolean;
  maxDailyTrades?: number;
  maxDailyLoss?: number;
}

export interface Signal {
  side: 'buy' | 'sell';
  entryTrigger: 'rsiCross' | 'reversalCandle' | 'manual';
  entryPrice: number;
  stopPrice: number;
  oneRPrice: number;
  meta: Record<string, unknown>;
}

export interface ActivePosition {
  id?: string;
  orderId: string;
  instrumentName: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  stopPrice: number;
  takeProfitPrice?: number;
  oneRPrice?: number;
  entryTime: number;
  strategyName?: string;
  confidence?: number;
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

export const DEFAULT_VORTEX_CONFIG: VortexConfig = {
  instrument: 'BTC_USDC-PERPETUAL',
  riskMode: 'percent',
  riskValue: 1.5,
  maxLeverage: 50,
  trailMethod: 'swing',
  monitorIntervalMs: 5000,
  minSpreadTicks: 2,
  cancelOnNews: false,
  maxDailyTrades: 10,
  maxDailyLoss: 100,
};

export class VortexStrategy {
  private config: VortexConfig;
  private client: DeribitClient;
  private riskSettings: RiskSettings;
  private equity: number;
  private isRunning: boolean = false;
  private monitorInterval: number | null = null;
  private position: ActivePosition | null = null;
  private bracketManager: AdvancedBracketManager | null = null;
  
  private candleHistory: Candle[] = [];
  private ema100: number | undefined;
  private bb20: { mid?: number; upper?: number; lower?: number } = {};
  private rsi4: number | undefined;
  
  private dailyTradeCount: number = 0;
  private dailyLoss: number = 0;
  private lastResetDate: string = '';
  
  // CRITICAL: Circuit breaker to prevent mass order spam
  private isTradeInProgress: boolean = false;
  private fatalErrorOccurred: boolean = false;
  private consecutiveErrors: number = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 3;
  
  private logger: Logger = simpleLogger;
  private onEvent?: (event: Record<string, unknown>) => void;
  private onPositionOpen?: (position: ActivePosition) => void;
  private onPositionClose?: (position: ActivePosition, pnl: number) => void;
  private onError?: (error: ErrorLog) => void;

  constructor(
    client: DeribitClient,
    config: Partial<VortexConfig>,
    riskSettings: RiskSettings,
    equity: number,
    callbacks?: {
      onPositionOpen?: (position: ActivePosition) => void;
      onPositionClose?: (position: ActivePosition, pnl: number) => void;
      onError?: (error: ErrorLog) => void;
      onEvent?: (event: Record<string, unknown>) => void;
    }
  ) {
    this.client = client;
    this.config = { ...DEFAULT_VORTEX_CONFIG, ...config };
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
    this.resetDailyCountersIfNeeded();
    
    this.logger.info('[Vortex] Started', {
      instrument: this.config.instrument,
      trailMethod: this.config.trailMethod,
    });
    
    this.emitEvent('STRATEGY_STARTED', { config: this.config });

    try {
      await this.recoverStateIfNeeded();
    } catch (error) {
      this.logger.warn('[Vortex] State recovery failed', { error });
    }

    try {
      await this.client.subscribe(
        [`user.portfolio.${this.config.instrument.toLowerCase()}`],
        async (channel, data) => {
          await this.handlePortfolioUpdate(data);
        }
      );
      this.logger.info('[Vortex] Subscribed to portfolio updates');
    } catch (error) {
      this.logger.warn('[Vortex] Failed to subscribe', { error });
    }

    this.monitorInterval = window.setInterval(() => {
      this.monitorAndTrade();
    }, this.config.monitorIntervalMs);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    // Clear circuit breaker flags
    this.isTradeInProgress = false;
    
    if (this.monitorInterval !== null) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.bracketManager) {
      await this.bracketManager.cancelAll('Strategy stopped');
      this.bracketManager = null;
    }

    this.logger.info('[Vortex] Stopped', {
      fatalErrorOccurred: this.fatalErrorOccurred,
      consecutiveErrors: this.consecutiveErrors,
    });
    this.emitEvent('STRATEGY_STOPPED', {
      fatalErrorOccurred: this.fatalErrorOccurred,
      consecutiveErrors: this.consecutiveErrors,
    });
  }

  hasActivePosition(): boolean {
    return this.position !== null;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getAnalysisState() {
    const signal = this.buildSignal(this.candleHistory);
    
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
    
    const lastCandle = this.candleHistory.length > 0 ? this.candleHistory[this.candleHistory.length - 1] : null;
    const lastPrice = lastCandle?.c || null;
    
    if (this.position) {
      status = 'position_open';
      waitingFor = 'Positie wordt gemonitord voor exit condities';
      
      mechanicalCheckpoints.push({
        id: 'position-active',
        label: 'Actieve positie',
        description: 'Trade is geopend en wordt gemonitord',
        status: 'met',
        value: this.position.side === 'buy' ? 'Long' : 'Short',
        details: `Entry: $${this.position.entryPrice.toFixed(2)} | Amount: ${this.position.amount}`,
      });
      
      if (this.bracketManager) {
        const bracketState = this.bracketManager.getState();
        mechanicalCheckpoints.push({
          id: 'bracket-status',
          label: 'Bracket Management',
          description: 'TP1 (50% @ 1R) en Trailing SL',
          status: bracketState.status === 'tp1Hit' ? 'met' : 'pending',
          value: bracketState.status === 'tp1Hit' ? 'TP1 Hit - Trailing' : 'TP1 Pending',
          details: `Trail method: ${this.config.trailMethod} | Remaining: ${bracketState.remainingQty}`,
        });
      }
    } else {
      mechanicalCheckpoints.push({
        id: 'candle-data',
        label: 'Candle data verzameling',
        description: '120+ candles nodig voor EMA 100 berekening',
        status: this.candleHistory.length >= 120 ? 'met' : 'pending',
        value: `${this.candleHistory.length}/120`,
        details: `Timeframe: 1m | Instrument: ${this.config.instrument}`,
      });
      
      if (this.candleHistory.length >= 100) {
        mechanicalCheckpoints.push({
          id: 'ema100-calculated',
          label: 'EMA 100 berekend',
          description: '100-periode exponential moving average als trend filter',
          status: this.ema100 !== undefined ? 'met' : 'not-met',
          value: this.ema100 ? `$${this.ema100.toFixed(2)}` : '—',
          details: lastPrice ? `Prijs vs EMA: ${lastPrice > this.ema100! ? 'Boven' : 'Onder'} (${((lastPrice - (this.ema100 || 0)) / (this.ema100 || 1) * 100).toFixed(2)}%)` : undefined,
        });
      }
      
      if (this.candleHistory.length >= 20) {
        const bbCalculated = this.bb20.mid !== undefined && this.bb20.upper !== undefined && this.bb20.lower !== undefined;
        mechanicalCheckpoints.push({
          id: 'bollinger-calculated',
          label: 'Bollinger Bands (20, 2σ)',
          description: 'Volatiliteit bands voor entry/exit condities',
          status: bbCalculated ? 'met' : 'not-met',
          value: bbCalculated ? `$${this.bb20.mid!.toFixed(2)}` : '—',
          details: bbCalculated ? `Upper: $${this.bb20.upper!.toFixed(2)} | Lower: $${this.bb20.lower!.toFixed(2)}` : undefined,
        });
        
        if (bbCalculated && lastPrice) {
          const bandwidth = ((this.bb20.upper! - this.bb20.lower!) / this.bb20.mid!) * 100;
          const pricePosition = ((lastPrice - this.bb20.lower!) / (this.bb20.upper! - this.bb20.lower!)) * 100;
          
          mechanicalCheckpoints.push({
            id: 'bb-position',
            label: 'Prijs positie in BB',
            description: 'Waar bevindt prijs zich tussen de bands',
            status: pricePosition > 20 && pricePosition < 80 ? 'met' : 'not-met',
            value: `${pricePosition.toFixed(1)}%`,
            details: pricePosition < 20 ? 'Te laag (oversold zone)' : pricePosition > 80 ? 'Te hoog (overbought zone)' : 'Binnen normale range',
          });
          
          mechanicalCheckpoints.push({
            id: 'bb-bandwidth',
            label: 'BB Bandwidth',
            description: 'Volatiliteit indicatie',
            status: bandwidth > 0.5 ? 'met' : 'not-met',
            value: `${bandwidth.toFixed(2)}%`,
            details: bandwidth < 0.5 ? 'Te lage volatiliteit' : bandwidth > 4 ? 'Hoge volatiliteit' : 'Normale volatiliteit',
          });
        }
      }
      
      if (this.candleHistory.length >= 5) {
        mechanicalCheckpoints.push({
          id: 'rsi4-calculated',
          label: 'RSI (4) berekend',
          description: 'Snelle RSI voor momentum detectie',
          status: this.rsi4 !== undefined ? 'met' : 'not-met',
          value: this.rsi4 !== undefined ? this.rsi4.toFixed(1) : '—',
          details: this.rsi4 !== undefined 
            ? (this.rsi4 < 30 ? 'Oversold' : this.rsi4 > 70 ? 'Overbought' : 'Neutraal')
            : undefined,
        });
      }
      
      
      if (this.ema100 && this.bb20.upper && this.bb20.lower && this.rsi4 !== undefined && lastPrice) {
        const isAboveEMA = lastPrice > this.ema100;
        const isBelowEMA = lastPrice < this.ema100;
        
        mechanicalCheckpoints.push({
          id: 'trend-direction',
          label: 'Trend richting (EMA 100)',
          description: 'Prijs moet boven EMA100 voor long, onder EMA100 voor short',
          status: isAboveEMA || isBelowEMA ? 'met' : 'not-met',
          value: isAboveEMA ? 'Boven EMA (Uptrend)' : isBelowEMA ? 'Onder EMA (Downtrend)' : 'Op EMA',
          details: `Prijs: $${lastPrice.toFixed(2)} | EMA100: $${this.ema100.toFixed(2)} | Verschil: ${((lastPrice - this.ema100) / this.ema100 * 100).toFixed(2)}%`,
        });
        
        if (isAboveEMA) {
          const touchedLowerBB = lastCandle && lastCandle.l <= this.bb20.lower;
          mechanicalCheckpoints.push({
            id: 'long-bb-touch',
            label: 'Long: BB Lower geraakt',
            description: 'Prijs moet onderste Bollinger Band raken',
            status: touchedLowerBB ? 'met' : 'not-met',
            value: touchedLowerBB ? 'Ja' : 'Nee',
            details: lastCandle ? `Low: $${lastCandle.l.toFixed(2)} | BB Lower: $${this.bb20.lower.toFixed(2)}` : '—',
          });
          
          const rsiOversold = this.rsi4 < 20;
          mechanicalCheckpoints.push({
            id: 'long-rsi-oversold',
            label: 'Long: RSI < 20 (Oversold)',
            description: 'RSI(4) moet onder 20 zijn',
            status: rsiOversold ? 'met' : 'not-met',
            value: this.rsi4.toFixed(1),
            details: rsiOversold ? 'Oversold zone bereikt' : `Nog ${(20 - this.rsi4).toFixed(1)} punten nodig`,
          });
          
          const prevCandle = this.candleHistory.length > 1 ? this.candleHistory[this.candleHistory.length - 2] : null;
          const prevRSI = prevCandle ? rsi(4, this.candleHistory.slice(0, -1).map(c => c.c)) : undefined;
          const rsiCrossedUp = prevRSI !== undefined && prevRSI < 20 && this.rsi4 > 20;
          const bullishCandle = lastCandle && lastCandle.c > lastCandle.o;
          
          mechanicalCheckpoints.push({
            id: 'long-entry-trigger',
            label: 'Long: Entry trigger',
            description: 'RSI stijgt door 20 OF bullish omkeercandle',
            status: (rsiCrossedUp || (rsiOversold && bullishCandle)) ? 'met' : 'not-met',
            value: rsiCrossedUp ? 'RSI crossover' : bullishCandle ? 'Bullish candle' : 'Wachten',
            details: rsiCrossedUp 
              ? `RSI kruiste van ${prevRSI?.toFixed(1)} naar ${this.rsi4.toFixed(1)}` 
              : bullishCandle 
                ? `Close ($${lastCandle.c.toFixed(2)}) > Open ($${lastCandle.o.toFixed(2)})`
                : 'Wachten op RSI omhoog of bullish candle',
          });
          
          if (touchedLowerBB && rsiOversold && (rsiCrossedUp || bullishCandle)) {
            mechanicalCheckpoints.push({
              id: 'long-signal-ready',
              label: '✓ LONG SIGNAL KLAAR',
              description: 'Alle long entry criteria voldaan',
              status: 'met',
              value: 'READY',
              details: 'Entry zal worden geplaatst in volgende cyclus',
            });
          }
        }
        
        if (isBelowEMA) {
          const touchedUpperBB = lastCandle && lastCandle.h >= this.bb20.upper;
          mechanicalCheckpoints.push({
            id: 'short-bb-touch',
            label: 'Short: BB Upper geraakt',
            description: 'Prijs moet bovenste Bollinger Band raken',
            status: touchedUpperBB ? 'met' : 'not-met',
            value: touchedUpperBB ? 'Ja' : 'Nee',
            details: lastCandle ? `High: $${lastCandle.h.toFixed(2)} | BB Upper: $${this.bb20.upper.toFixed(2)}` : '—',
          });
          
          const rsiOverbought = this.rsi4 > 80;
          mechanicalCheckpoints.push({
            id: 'short-rsi-overbought',
            label: 'Short: RSI > 80 (Overbought)',
            description: 'RSI(4) moet boven 80 zijn',
            status: rsiOverbought ? 'met' : 'not-met',
            value: this.rsi4.toFixed(1),
            details: rsiOverbought ? 'Overbought zone bereikt' : `Nog ${(this.rsi4 - 80).toFixed(1)} punten nodig`,
          });
          
          const prevCandle = this.candleHistory.length > 1 ? this.candleHistory[this.candleHistory.length - 2] : null;
          const prevRSI = prevCandle ? rsi(4, this.candleHistory.slice(0, -1).map(c => c.c)) : undefined;
          const rsiCrossedDown = prevRSI !== undefined && prevRSI > 80 && this.rsi4 < 80;
          const bearishCandle = lastCandle && lastCandle.c < lastCandle.o;
          
          mechanicalCheckpoints.push({
            id: 'short-entry-trigger',
            label: 'Short: Entry trigger',
            description: 'RSI daalt door 80 OF bearish omkeercandle',
            status: (rsiCrossedDown || (rsiOverbought && bearishCandle)) ? 'met' : 'not-met',
            value: rsiCrossedDown ? 'RSI crossover' : bearishCandle ? 'Bearish candle' : 'Wachten',
            details: rsiCrossedDown 
              ? `RSI daalde van ${prevRSI?.toFixed(1)} naar ${this.rsi4.toFixed(1)}` 
              : bearishCandle 
                ? `Close ($${lastCandle.c.toFixed(2)}) < Open ($${lastCandle.o.toFixed(2)})`
                : 'Wachten op RSI omlaag of bearish candle',
          });
          
          if (touchedUpperBB && rsiOverbought && (rsiCrossedDown || bearishCandle)) {
            mechanicalCheckpoints.push({
              id: 'short-signal-ready',
              label: '✓ SHORT SIGNAL KLAAR',
              description: 'Alle short entry criteria voldaan',
              status: 'met',
              value: 'READY',
              details: 'Entry zal worden geplaatst in volgende cyclus',
            });
          }
        }
      } else {
        mechanicalCheckpoints.push({
          id: 'mechanical-ruleset',
          label: 'Mechanische entry regels',
          description: 'Nog niet alle indicatoren beschikbaar',
          status: 'pending',
          value: 'Wachten op data',
          details: `EMA100: ${this.ema100 ? '✓' : '✗'} | BB: ${this.bb20.upper ? '✓' : '✗'} | RSI: ${this.rsi4 !== undefined ? '✓' : '✗'}`,
        });
      }
      
      if (this.candleHistory.length < 20) {
        status = 'waiting_for_data';
        waitingFor = `Verzamelen van candledata (${this.candleHistory.length}/120)`;
      } else {
        status = 'analyzing';
        waitingFor = 'Mechanische entry criteria worden geëvalueerd';
      }
      
      if (this.ema100) {
        marketConditions.push({
          label: 'EMA 100',
          value: this.ema100.toFixed(2),
          status: 'neutral',
        });
      }
      
      if (this.bb20.mid && this.bb20.upper && this.bb20.lower) {
        marketConditions.push({
          label: 'BB Mid',
          value: this.bb20.mid.toFixed(2),
          status: 'neutral',
        });
        marketConditions.push({
          label: 'BB Upper',
          value: this.bb20.upper.toFixed(2),
          status: 'neutral',
        });
        marketConditions.push({
          label: 'BB Lower',
          value: this.bb20.lower.toFixed(2),
          status: 'neutral',
        });
      }
      
      if (this.rsi4 !== undefined) {
        marketConditions.push({
          label: 'RSI (4)',
          value: this.rsi4.toFixed(1),
          status: 'neutral',
        });
      }
    }
    
    return {
      status,
      waitingFor,
      dataPoints: this.candleHistory.length,
      lastPrice,
      lastPriceTimestamp: lastCandle?.t || null,
      emaFast: this.ema100,
      emaSlow: null,
      rsi: this.rsi4,
      marketConditions,
      mechanicalCheckpoints,
      config: this.config,
      position: this.position,
      cooldownRemaining: 0,
    };
  }

  private async monitorAndTrade(): Promise<void> {
    if (!this.isRunning) return;
    
    // CRITICAL: Circuit breaker - if fatal error occurred, immediately stop
    if (this.fatalErrorOccurred) {
      this.logger.error('[Vortex] ⛔ Fatal error flag set - stopping monitor loop');
      await this.stop();
      return;
    }
    
    // CRITICAL: Prevent concurrent trade execution
    if (this.isTradeInProgress) {
      this.logger.info('[Vortex] Trade already in progress, skipping monitor cycle');
      return;
    }
    
    try {
      if (this.position !== null) {
        if (this.bracketManager) {
          try {
            const ticker = await this.getTicker();
            await this.bracketManager.maybeTrail(ticker.last_price);
          } catch (error) {
            this.logger.warn('[Vortex] Trailing failed', { error });
            this.emitErrorLog(error, 'maybeTrail', {
              instrument: this.config.instrument,
              hasPosition: true,
            });
          }
        }
        return;
      }

      if (this.dailyTradeCount >= (this.config.maxDailyTrades || 999)) {
        this.logger.warn('[Vortex] Max daily trades reached');
        this.emitEvent('MAX_DAILY_TRADES', { count: this.dailyTradeCount });
        return;
      }

      if (this.dailyLoss >= (this.config.maxDailyLoss || Infinity)) {
        this.logger.warn('[Vortex] Max daily loss reached');
        this.emitEvent('MAX_DAILY_LOSS', { loss: this.dailyLoss });
        await this.stop();
        return;
      }

      const openPosition = await this.client.getPosition(this.config.instrument);
      
      if (openPosition && openPosition.size !== 0) {
        this.logger.info('[Vortex] ⏸️  Position already open, pausing strategy', {
          instrument: openPosition.instrument_name,
          size: openPosition.size,
          direction: openPosition.direction,
          avgPrice: openPosition.average_price.toFixed(2),
          unrealizedPnL: openPosition.floating_profit_loss.toFixed(2),
        });
        
        this.emitEvent('POSITION_DETECTED', {
          position: openPosition,
          message: 'Strategy paused - existing position detected',
        });
        
        return;
      }

      try {
        await this.fetchAndUpdateCandles();
      } catch (error) {
        this.logger.error('[Vortex] Failed to fetch candles', { error });
        this.emitErrorLog(error, 'fetchAndUpdateCandles', {
          instrument: this.config.instrument,
        });
        return;
      }

      try {
        this.calculateIndicators();
      } catch (error) {
        this.logger.error('[Vortex] Failed to calculate indicators', { error });
        this.emitErrorLog(error, 'calculateIndicators', {
          candleCount: this.candleHistory.length,
        });
        return;
      }
      
      try {
        const signal = this.buildSignal(this.candleHistory);
        if (signal) {
          this.emitEvent('SIGNAL', { signal });
          await this.executeTrade(signal);
          
          // Reset consecutive error counter on successful trade path
          this.consecutiveErrors = 0;
        }
      } catch (error) {
        this.consecutiveErrors++;
        
        this.logger.error('[Vortex] Failed to build or execute signal', { 
          error,
          consecutiveErrors: this.consecutiveErrors,
          maxAllowed: this.MAX_CONSECUTIVE_ERRORS,
        });
        this.emitErrorLog(error, 'buildSignalOrExecuteTrade', {
          instrument: this.config.instrument,
          candleCount: this.candleHistory.length,
          consecutiveErrors: this.consecutiveErrors,
        });
      }
    } catch (error) {
      this.consecutiveErrors++;
      
      this.logger.error('[Vortex] Unexpected monitor error', { 
        error,
        consecutiveErrors: this.consecutiveErrors,
        maxAllowed: this.MAX_CONSECUTIVE_ERRORS,
      });
      this.emitErrorLog(error, 'monitorAndTrade', {
        instrument: this.config.instrument,
        hasPosition: this.position !== null,
        consecutiveErrors: this.consecutiveErrors,
      });
      
      // ============================================================================
      // CRITICAL SAFETY: Check if error is fatal (bracket/SL/TP related)
      // If so, STOP the strategy immediately to prevent repeated failures
      // ============================================================================
      const errorMsg = String(error);
      const isFatalError = 
        errorMsg.includes('CRITICAL') ||
        errorMsg.includes('FATAL') ||
        errorMsg.includes('no_more_triggers') ||
        errorMsg.includes('trigger') ||
        errorMsg.includes('bracket') ||
        errorMsg.includes('SL') ||
        errorMsg.includes('missing order_id') ||
        errorMsg.includes('invalid_reduce_only') ||
        errorMsg.includes('Emergency close') ||
        this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS;
      
      if (isFatalError) {
        this.fatalErrorOccurred = true;
        
        this.logger.error('[Vortex] ⛔⛔⛔ FATAL ERROR DETECTED - STOPPING STRATEGY IMMEDIATELY', {
          error: errorMsg,
          consecutiveErrors: this.consecutiveErrors,
          action: 'Strategy stopped to prevent repeated failures and fee costs',
          reason: this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS 
            ? `${this.MAX_CONSECUTIVE_ERRORS} consecutive errors`
            : 'Fatal error pattern detected',
        });
        
        await this.stop();
        
        this.emitEvent('STRATEGY_STOPPED_FATAL_ERROR', {
          reason: 'Fatal error detected - strategy stopped for safety',
          error: errorMsg,
          consecutiveErrors: this.consecutiveErrors,
        });
      }
    }
  }

  private async fetchAndUpdateCandles(): Promise<void> {
    if (!this.client.isConnected()) {
      throw new Error('Client is not connected - cannot fetch candles');
    }

    const endTimestamp = Date.now();
    const startTimestamp = endTimestamp - 120 * 60 * 1000;

  const result = await this.client.request('public/get_tradingview_chart_data', {
      instrument_name: this.config.instrument,
      start_timestamp: startTimestamp,
      end_timestamp: endTimestamp,
      resolution: '1',
  }) as TradingViewResult;

  if (result && Array.isArray(result.ticks) && Array.isArray(result.open) && Array.isArray(result.close) && Array.isArray(result.high) && Array.isArray(result.low) && Array.isArray(result.volume)) {
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
      this.candleHistory = newCandles.slice(-120);
    }
  }

  private calculateIndicators(): void {
    const closes = this.candleHistory.map(c => c.c);
    
    if (closes.length >= 100) {
      this.ema100 = ema(100, closes);
    }
    
    if (closes.length >= 20) {
      this.bb20 = bollinger(20, 2, closes);
    }
    
    if (closes.length >= 5) {
      this.rsi4 = rsi(4, closes);
    }
  }

  private buildSignal(candles: Candle[]): Signal | null {
    if (candles.length < 20) return null;
    if (!this.ema100 || !this.bb20.mid || !this.bb20.upper || !this.bb20.lower) return null;
    if (this.rsi4 === undefined) return null;

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles.length > 1 ? candles[candles.length - 2] : null;
    const lastPrice = lastCandle.c;

    let signal: Signal | null = null;

    if (lastPrice > this.ema100) {
      if (lastCandle.l <= this.bb20.lower && this.rsi4 < 20) {
        if (prevCandle && this.rsi4 > 20) {
          const entryPrice = lastPrice;
          const stopPrice = Math.min(lastCandle.l, this.bb20.lower) * 0.997;
          const oneRDistance = Math.abs(entryPrice - stopPrice);
          const oneRPrice = entryPrice + oneRDistance;

          signal = {
            side: 'buy',
            entryTrigger: 'rsiCross',
            entryPrice,
            stopPrice,
            oneRPrice,
            meta: {
              ema100: this.ema100,
              bbLower: this.bb20.lower,
              rsi4: this.rsi4,
              reason: 'Long setup: Price above EMA100, touched BB lower, RSI crossed above 20',
            },
          };
        } else if (lastCandle.c > lastCandle.o) {
          const entryPrice = lastPrice;
          const stopPrice = Math.min(lastCandle.l, this.bb20.lower) * 0.997;
          const oneRDistance = Math.abs(entryPrice - stopPrice);
          const oneRPrice = entryPrice + oneRDistance;

          signal = {
            side: 'buy',
            entryTrigger: 'reversalCandle',
            entryPrice,
            stopPrice,
            oneRPrice,
            meta: {
              ema100: this.ema100,
              bbLower: this.bb20.lower,
              rsi4: this.rsi4,
              reason: 'Long setup: Price above EMA100, touched BB lower, RSI<20, bullish candle formed',
            },
          };
        }
      }
    }

    if (lastPrice < this.ema100) {
      if (lastCandle.h >= this.bb20.upper && this.rsi4 > 80) {
        if (prevCandle && this.rsi4 < 80) {
          const entryPrice = lastPrice;
          const stopPrice = Math.max(lastCandle.h, this.bb20.upper) * 1.003;
          const oneRDistance = Math.abs(entryPrice - stopPrice);
          const oneRPrice = entryPrice - oneRDistance;

          signal = {
            side: 'sell',
            entryTrigger: 'rsiCross',
            entryPrice,
            stopPrice,
            oneRPrice,
            meta: {
              ema100: this.ema100,
              bbUpper: this.bb20.upper,
              rsi4: this.rsi4,
              reason: 'Short setup: Price below EMA100, touched BB upper, RSI dropped below 80',
            },
          };
        } else if (lastCandle.c < lastCandle.o) {
          const entryPrice = lastPrice;
          const stopPrice = Math.max(lastCandle.h, this.bb20.upper) * 1.003;
          const oneRDistance = Math.abs(entryPrice - stopPrice);
          const oneRPrice = entryPrice - oneRDistance;

          signal = {
            side: 'sell',
            entryTrigger: 'reversalCandle',
            entryPrice,
            stopPrice,
            oneRPrice,
            meta: {
              ema100: this.ema100,
              bbUpper: this.bb20.upper,
              rsi4: this.rsi4,
              reason: 'Short setup: Price below EMA100, touched BB upper, RSI>80, bearish candle formed',
            },
          };
        }
      }
    }

    return signal;
  }

  private async executeTrade(signal: Signal): Promise<void> {
    // CRITICAL: Set trade-in-progress flag to prevent concurrent executions
    if (this.isTradeInProgress) {
      this.logger.warn('[Vortex] Trade already in progress, skipping execution');
      return;
    }
    
    this.isTradeInProgress = true;
    
    try {
      await this._executeTradeInternal(signal);
    } finally {
      // Always clear the flag, even if execution fails
      this.isTradeInProgress = false;
    }
  }

  private async _executeTradeInternal(signal: Signal): Promise<void> {
    let freshEquity: number;
    let instrument: any;

    try {
  const balanceResult = await this.client.request('private/get_account_summary', {
        currency: 'USDC',
        extended: false,
  }) as DeribitBalance;
  freshEquity = typeof balanceResult?.equity === 'number' ? balanceResult.equity : this.equity;

      if (!freshEquity || freshEquity <= 0) {
        this.logger.warn('[Vortex] Invalid equity balance', { equity: freshEquity });
        this.emitErrorLog(
          new Error('Invalid equity balance'),
          'executeTrade:fetchBalance',
          { equity: freshEquity }
        );
        return;
      }
    } catch (error) {
      this.logger.error('[Vortex] Failed to fetch balance', { error });
      this.emitErrorLog(error, 'executeTrade:fetchBalance', {
        instrument: this.config.instrument,
      });
      return;
    }

    try {
      const instrumentResult = await this.client.request('public/get_instrument', {
        instrument_name: this.config.instrument,
      });
      instrument = instrumentResult;

      if (!instrument || !instrument.tick_size || !instrument.contract_size) {
        this.logger.warn('[Vortex] Invalid instrument data', { instrument });
        this.emitErrorLog(
          new Error('Invalid instrument data'),
          'executeTrade:fetchInstrument',
          { instrument: this.config.instrument }
        );
        return;
      }
    } catch (error) {
      this.logger.error('[Vortex] Failed to fetch instrument', { error });
      this.emitErrorLog(error, 'executeTrade:fetchInstrument', {
        instrument: this.config.instrument,
      });
      return;
    }

    let riskCalc;
    try {
      riskCalc = calculatePosition({
        equity: freshEquity,
        riskMode: this.riskSettings.mode,
        riskValue: this.riskSettings.value,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        brokerRules: {
          maxLeverage: Math.min(this.config.maxLeverage, instrument.max_leverage || 50),
          tickSize: instrument.tick_size,
          lotSize: instrument.contract_size,
          minTradeAmount: instrument.min_trade_amount,
          contractSize: instrument.contract_size,
        },
      });

      if (!riskCalc.success) {
        this.logger.warn('[Vortex] Risk calculation failed', { reason: riskCalc.reason });
        this.emitEvent('RISK_CALCULATION_FAILED', { reason: riskCalc.reason });
        this.emitErrorLog(
          new Error(`Risk calculation failed: ${riskCalc.reason}`),
          'executeTrade:riskCalculation',
          {
            equity: freshEquity,
            riskMode: this.riskSettings.mode,
            riskValue: this.riskSettings.value,
            entryPrice: signal.entryPrice,
            stopPrice: signal.stopPrice,
          }
        );
        return;
      }
    } catch (error) {
      this.logger.error('[Vortex] Risk calculation error', { error });
      this.emitErrorLog(error, 'executeTrade:riskCalculation', {
        equity: freshEquity,
        signal,
      });
      return;
    }

    const { quantity, effectiveLeverage, warnings } = riskCalc;

    if (effectiveLeverage > this.config.maxLeverage) {
      this.logger.warn('[Vortex] Leverage too high', { effectiveLeverage, max: this.config.maxLeverage });
      this.emitEvent('LEVERAGE_EXCEEDED', { effectiveLeverage, maxLeverage: this.config.maxLeverage });
      this.emitErrorLog(
        new Error(`Leverage ${effectiveLeverage.toFixed(2)}x exceeds max ${this.config.maxLeverage}x`),
        'executeTrade:leverageCheck',
        { effectiveLeverage, maxLeverage: this.config.maxLeverage }
      );
      return;
    }

    if (warnings.length > 0) {
      this.logger.info('[Vortex] Risk warnings', { warnings });
      this.emitEvent('RISK_WARNINGS', { warnings });
    }

    let normalizedQty: number;
    try {
      const validation = validateAndNormalizeAmount(quantity, instrument.contract_size, instrument.min_trade_amount);
      if (!validation.valid) {
        this.logger.warn('[Vortex] Amount validation failed', { error: validation.error, details: validation.details });
        this.emitEvent('AMOUNT_VALIDATION_FAILED', { error: validation.error });
        this.emitErrorLog(
          new Error(`Amount validation failed: ${validation.error}`),
          'executeTrade:amountValidation',
          {
            quantity,
            contractSize: instrument.contract_size,
            minTradeAmount: instrument.min_trade_amount,
            details: validation.details,
          }
        );
        return;
      }
      normalizedQty = validation.amount;
    } catch (error) {
      this.logger.error('[Vortex] Amount validation error', { error });
      this.emitErrorLog(error, 'executeTrade:amountValidation', {
        quantity,
        instrument: this.config.instrument,
      });
      return;
    }

    let entryOrder;
    try {
      const direction = signal.side === 'buy' ? 'buy' : 'sell';
      
      this.logger.info('[Vortex] Placing entry order', {
        direction,
        amount: normalizedQty,
        signal,
      });

      entryOrder = await this.client.request(`private/${direction}`, {
        instrument_name: this.config.instrument,
        amount: normalizedQty,
        type: 'market',
      });

      if (!entryOrder || !entryOrder.order_id) {
        throw new Error('Entry order response missing order_id');
      }

      this.logger.info('[Vortex] Entry order placed', {
        orderId: entryOrder.order_id,
        amount: normalizedQty,
      });
    } catch (error) {
      this.logger.error('[Vortex] Failed to place entry order', { error });
      this.emitErrorLog(error, 'executeTrade:placeEntry', {
        side: signal.side,
        amount: normalizedQty,
        instrument: this.config.instrument,
      });
      return;
    }

    try {
      this.bracketManager = new AdvancedBracketManager({
        client: this.client,
        symbol: this.config.instrument,
        logger: this.logger,
        getIndicators: () => this.getIndicatorData(),
        tickSize: instrument.tick_size,
      });

      await this.bracketManager.attachInitialBracket({
        side: signal.side,
        entryOrderId: entryOrder.order_id,
        totalQty: normalizedQty,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        oneRPrice: signal.oneRPrice,
      });

      this.logger.info('[Vortex] ✅ Bracket orders attached successfully', {
        side: signal.side,
        qty: normalizedQty,
        entry: signal.entryPrice,
        stop: signal.stopPrice,
        oneR: signal.oneRPrice,
      });
    } catch (error) {
      this.logger.error('[Vortex] ❌ CRITICAL: Failed to attach bracket orders - CLOSING POSITION IMMEDIATELY', { error });
      this.emitErrorLog(error, 'executeTrade:attachBracket', {
        orderId: entryOrder?.order_id,
        instrument: this.config.instrument,
        signal,
      });

      // Try emergency close
      let emergencyCloseSucceeded = false;
      try {
        const closeDirection = signal.side === 'buy' ? 'sell' : 'buy';
        await this.client.request(`private/${closeDirection}`, {
          instrument_name: this.config.instrument,
          amount: normalizedQty,
          type: 'market',
          reduce_only: true,
        });
        emergencyCloseSucceeded = true;
        this.logger.info('[Vortex] Emergency position close executed - position closed without SL/TP');
      } catch (closeError) {
        this.logger.error('[Vortex] ❌ EMERGENCY CLOSE FAILED - MANUAL INTERVENTION REQUIRED', { closeError });
        this.emitErrorLog(closeError, 'executeTrade:emergencyClose', {
          originalError: String(error),
          entryOrderId: entryOrder.order_id,
        });
      }

      this.position = null;
      this.bracketManager = null;
      
      // ============================================================================
      // CRITICAL: STOP THE ENTIRE STRATEGY AFTER BRACKET FAILURE
      // We cannot continue trading if we can't place SL/TP protection
      // This prevents the disaster of placing multiple unprotected positions
      // ============================================================================
      this.logger.error('[Vortex] ⛔ STOPPING STRATEGY - Cannot place protective brackets', {
        reason: 'Bracket attachment failure',
        action: 'Strategy will stop to prevent unprotected trades',
      });
      
      await this.stop();
      
      this.emitEvent('STRATEGY_STOPPED_ERROR', {
        reason: 'Cannot place SL/TP brackets - safety measure activated',
        error: String(error),
        emergencyCloseSucceeded,
      });
      
      return;
    }

    this.position = {
      orderId: entryOrder.order_id,
      instrumentName: this.config.instrument,
      side: signal.side,
      entryPrice: signal.entryPrice,
      amount: normalizedQty,
      stopPrice: signal.stopPrice,
      oneRPrice: signal.oneRPrice,
      entryTime: Date.now(),
      strategyName: 'Vortex',
    };

    this.dailyTradeCount++;
    this.emitEvent('ENTRY_PLACED', { position: this.position });
    
    if (this.onPositionOpen) {
      this.onPositionOpen(this.position);
    }

    this.logger.info('[Vortex] Trade executed with bracket - position tracked', {
      orderId: this.position.orderId,
    });
  }

  private getIndicatorData(): IndicatorData {
    return {
      ema20: this.ema100,
      upperBB: this.bb20.upper,
      lowerBB: this.bb20.lower,
      rsi: this.rsi4,
      swing: undefined,
    };
  }

  private async handlePortfolioUpdate(data: unknown): Promise<void> {
    if (!this.position || !this.bracketManager) return;

    const posData = data as { trades?: Array<{ instrument_name: string; amount: number; direction: string }> };
    
    if (posData.trades) {
      for (const trade of posData.trades) {
        if (trade.instrument_name === this.config.instrument) {
          const isClosed = trade.amount === 0;
          if (isClosed) {
            this.logger.info('[Vortex] Position closed via portfolio update');
            this.emitEvent('ALL_EXITED', { position: this.position });
            
            if (this.onPositionClose && this.position) {
              this.onPositionClose(this.position, 0);
            }
            
            this.position = null;
            this.bracketManager = null;
          }
        }
      }
    }
  }

  private async getTicker(): Promise<Ticker> {
    const result = await this.client.request('public/ticker', {
      instrument_name: this.config.instrument,
    });
    return result as Ticker;
  }

  private async recoverStateIfNeeded(): Promise<void> {
  const openOrdersRaw = await this.client.request('private/get_open_orders_by_instrument', {
      instrument_name: this.config.instrument,
    });

  const openOrders: Array<{ order_id: string }> = Array.isArray(openOrdersRaw) ? openOrdersRaw : [];

  if (openOrders.length > 0) {
      this.logger.info('[Vortex] Found open orders, attempting recovery', {
        count: openOrders.length,
      });
    }

    const positions = await this.client.request('private/get_positions', {});
    if (positions && Array.isArray(positions)) {
      const myPos = positions.find((p: { instrument_name: string }) => p.instrument_name === this.config.instrument);
      if (myPos && myPos.size && myPos.size !== 0) {
        this.logger.info('[Vortex] Found existing position', { size: myPos.size });
      }
    }
  }

  private resetDailyCountersIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastResetDate !== today) {
      this.dailyTradeCount = 0;
      this.dailyLoss = 0;
      this.lastResetDate = today;
      this.logger.info('[Vortex] Daily counters reset');
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
        id: `strategy-error-${timestamp}`,
        timestamp,
  errorType: String(error.code || 'UNKNOWN_ERROR'),
        message: error.message,
        stack: error.stack || '',
        context: {
          action,
          strategyName: 'Vortex',
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
        id: `strategy-error-${timestamp}`,
        timestamp,
        errorType: 'STRATEGY_ERROR',
        message: error.message,
        stack: error.stack || '',
        context: {
          action,
          strategyName: 'Vortex',
          instrument: this.config.instrument,
          ...context,
        },
      };
    } else {
      errorLog = {
        id: `strategy-error-${timestamp}`,
        timestamp,
        errorType: 'UNKNOWN_ERROR',
        message: String(error),
        stack: '',
        context: {
          action,
          strategyName: 'Vortex',
          instrument: this.config.instrument,
          ...context,
        },
      };
    }

    this.onError(errorLog);
  }
}

export function createVortexStrategy(
  client: DeribitClient,
  config: Partial<VortexConfig>,
  riskSettings: RiskSettings,
  equity: number,
  callbacks?: {
    onPositionOpen?: (position: ActivePosition) => void;
    onPositionClose?: (position: ActivePosition, pnl: number) => void;
    onError?: (error: ErrorLog) => void;
    onEvent?: (event: Record<string, unknown>) => void;
  }
): VortexStrategy {
  return new VortexStrategy(client, config, riskSettings, equity, callbacks);
}

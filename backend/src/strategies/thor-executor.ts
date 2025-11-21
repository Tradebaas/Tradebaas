import type { BackendDeribitClient } from '../deribit-client';
import type { AnalysisState, Checkpoint } from '../types/analysis';
import { getTradeHistoryService, ensureTradeHistoryInitialized } from '../services/trade-history';
import { getOrderLifecycleManager, initializeOrderLifecycleManager } from '../services/order-lifecycle-manager';

export interface ThorConfig {
  instrument: string;

  // Risk
  maxRiskPercent: number; // from UI riskSettings when mode === 'percent'
  fixedRiskUsd?: number; // optional when mode === 'fixed'
  accountEquityUsd: number; // approximate equity to size position

  // Thor core parameters
  rsiPeriod: number; // 4
  rsiLongLevel: number; // e.g. 30
  rsiShortLevel: number; // e.g. 70
  bbPeriod: number; // 20
  bbStdDev: number; // 2
  atrPeriod: number; // 14

  spreadFilterBps: number; // max spread in basis points (e.g. 5 = 0.05%)
  minAtrBps: number; // min ATR% of price
  maxAtrBps: number; // max ATR% of price

  // General safety
  maxDailyTrades: number;
  cooldownCandles: number; // after anti-trend trigger
}

type SignalType = 'long' | 'short' | 'none';

interface ThorSignal {
  type: SignalType;
  reasons: string[];
}

export class ThorExecutor {
  private client: BackendDeribitClient;
  private config: ThorConfig;
  private strategyId: string;
  private strategyName: string;

  private analysisState: AnalysisState;

  // 1m candles
  private candles: { open: number; high: number; low: number; close: number; ts: number }[] = [];
  private currentCandle: { open: number; high: number; low: number; close: number; ts: number } | null = null;
  private candleMs = 60_000;
  private candleStart = Date.now();

  private dailyTrades = 0;
  private dailyReset = Date.now();
  private currentTradeId: string | null = null;

  // Anti-trend protection (placeholder: controlled via cooldownCandles if extended later)
  private cooldownUntilCandle: number | null = null;

  constructor(client: BackendDeribitClient, strategyId: string, strategyName: string, config: ThorConfig) {
    this.client = client;
    this.strategyId = strategyId;
    this.strategyName = strategyName;
    this.config = config;

    this.analysisState = {
      strategyId,
      strategyName,
      instrument: config.instrument,
      status: 'initializing',
      currentPrice: null,
      lastUpdated: Date.now(),
      indicators: {
        emaFast: null,
        emaSlow: null,
        rsi: null,
        volume: null,
        volatility: null,
      },
      signal: { type: 'none', strength: 0, confidence: 0, reasons: [] },
      checkpoints: [],
      dataPoints: 0,
      requiredDataPoints: 30,
      cooldownUntil: null,
      nextCheckAt: Date.now() + 5000,
    };
  }

  async initialize(): Promise<void> {
    console.log('[Thor] INITIALIZE');
    initializeOrderLifecycleManager(this.client);

    try {
      const candles = await this.client.getCandles(this.config.instrument, '1', 200);
      if (candles && Array.isArray(candles.close)) {
        const n = candles.close.length;
        for (let i = Math.max(0, n - 200); i < n; i++) {
          this.candles.push({
            open: candles.open[i],
            high: candles.high[i],
            low: candles.low[i],
            close: candles.close[i],
            ts: candles.timestamp?.[i] ?? Date.now(),
          });
        }
        this.analysisState.dataPoints = this.candles.length;
        this.analysisState.currentPrice = this.candles[this.candles.length - 1]?.close ?? null;
      }
    } catch (err) {
      console.error('[Thor] Failed to load historical candles', err);
    }

    await this.reconcileOnStartup();
    this.analysisState.status = 'analyzing';
    this.analysisState.lastUpdated = Date.now();
  }

  getAnalysisState(): AnalysisState {
    return { ...this.analysisState };
  }

  async onTicker(price: number): Promise<void> {
    this.analysisState.currentPrice = price;
    this.analysisState.lastUpdated = Date.now();

    if (this.analysisState.status === 'position_open') {
      await this.checkPositionAndResume();
      return;
    }

    const now = Date.now();
    const elapsed = now - this.candleStart;
    let closedCandle = false;

    if (elapsed >= this.candleMs) {
      if (this.currentCandle) {
        this.candles.push(this.currentCandle);
        if (this.candles.length > 300) this.candles.shift();
        closedCandle = true;
      }
      this.currentCandle = { open: price, high: price, low: price, close: price, ts: now };
      this.candleStart = now;
    } else {
      if (!this.currentCandle) {
        this.currentCandle = { open: price, high: price, low: price, close: price, ts: now };
      } else {
        this.currentCandle.high = Math.max(this.currentCandle.high, price);
        this.currentCandle.low = Math.min(this.currentCandle.low, price);
        this.currentCandle.close = price;
      }
    }

    this.analysisState.dataPoints = this.candles.length;

    // Daily reset
    if (now - this.dailyReset > 24 * 60 * 60 * 1000) {
      this.dailyTrades = 0;
      this.dailyReset = now;
    }

    if (this.candles.length < this.analysisState.requiredDataPoints) {
      this.analysisState.status = 'initializing';
      this.analysisState.checkpoints = [
        {
          id: 'data',
          label: 'Marktdata verzamelen',
          status: 'pending',
          value: `${this.candles.length}/${this.analysisState.requiredDataPoints}`,
          description: 'Thor wacht op voldoende 1m candles voor analyse',
          timestamp: now,
        },
      ];
      return;
    }

    this.updateIndicators();
    this.updateCheckpoints();

    const signal = this.analyzeSignal();
    this.analysisState.signal = {
      type: signal.type,
      strength: signal.type === 'none' ? 0 : 70,
      confidence: signal.type === 'none' ? 0 : 80,
      reasons: signal.reasons,
    };

    if (!closedCandle || signal.type === 'none') {
      this.analysisState.status = 'analyzing';
      return;
    }

    // Execute only on candle close
    await this.executeTrade(signal.type);
  }

  private updateIndicators(): void {
    const closes = this.candles.map(c => c.close);
    const highs = this.candles.map(c => c.high);
    const lows = this.candles.map(c => c.low);

    // RSI(4)
    this.analysisState.indicators.rsi = this.calculateRSI(closes, this.config.rsiPeriod);

    // Volatility via ATR% for filters
    const atr = this.calculateATR(highs, lows, closes, this.config.atrPeriod);
    const last = closes[closes.length - 1];
    const atrPct = atr && last ? (atr / last) * 100 : null;
    this.analysisState.indicators.volatility = atrPct ?? null;
  }

  private updateCheckpoints(): void {
    const cps: Checkpoint[] = [];
    const { indicators } = this.analysisState;
    const now = Date.now();

    if (indicators.rsi != null) {
      cps.push({
        id: 'rsi',
        label: 'RSI(4)',
        status: 'met',
        value: indicators.rsi.toFixed(1),
  description: 'Momentum voor Thor-strategie',
        timestamp: now,
      });
    }

    if (indicators.volatility != null) {
      cps.push({
        id: 'atr',
        label: 'ATR %',
        status: 'met',
        value: indicators.volatility.toFixed(2) + '%',
        description: 'Volatiliteit filter',
        timestamp: now,
      });
    }

    cps.push({
      id: 'status',
      label: 'Thor status',
      status: 'met',
      value: this.analysisState.status,
  description: 'Thor-strategie engine',
      timestamp: now,
    });

    this.analysisState.checkpoints = cps;
  }

  private analyzeSignal(): ThorSignal {
    const closes = this.candles.map(c => c.close);
    const highs = this.candles.map(c => c.high);
    const lows = this.candles.map(c => c.low);
    const last = this.candles[this.candles.length - 1];
    const rsi = this.analysisState.indicators.rsi ?? null;
    const reasons: string[] = [];

    if (!last || rsi == null) {
      return { type: 'none', reasons: ['Onvoldoende data'] };
    }

    // Daily trade limit
    if (this.dailyTrades >= this.config.maxDailyTrades) {
      return { type: 'none', reasons: ['Dagelijkse limiet bereikt'] };
    }

    // ATR volatility band
    const atr = this.calculateATR(highs, lows, closes, this.config.atrPeriod);
    if (!atr) return { type: 'none', reasons: ['Geen ATR data'] };
    const atrPct = (atr / last.close) * 100;
    const atrMin = this.config.minAtrBps / 100;
    const atrMax = this.config.maxAtrBps / 100;
    if (atrPct < atrMin || atrPct > atrMax) {
      return { type: 'none', reasons: ['ATR-filter buiten bereik'] };
    }

    // Simple BB using closes
    const bb = this.calculateBollinger(closes, this.config.bbPeriod, this.config.bbStdDev);
    const middle = bb?.middle ?? last.close;

    // Core VIPER idee (vereenvoudigd): RSI extremes + mean reversion richting BB mid
    let type: SignalType = 'none';
    if (rsi <= this.config.rsiLongLevel && last.close < middle) {
      type = 'long';
      reasons.push('RSI laag + onder BB mid');
    } else if (rsi >= this.config.rsiShortLevel && last.close > middle) {
      type = 'short';
      reasons.push('RSI hoog + boven BB mid');
    }

    if (type === 'none') return { type, reasons: reasons.length ? reasons : ['Geen Viper signaal'] };
    return { type, reasons };
  }

  private async executeTrade(direction: 'long' | 'short'): Promise<void> {
    try {
      console.log('[Thor] EXECUTE', direction);

      const positions = await this.client.getPositions('USDC');
      const existing = positions.find((p: any) => p.instrument_name === this.config.instrument && p.size !== 0);
      if (existing) {
        console.error('[Thor] Position already open, skipping');
        this.analysisState.status = 'stopped';
        return;
      }

      const [instrument, ticker] = await Promise.all([
        this.client.getInstrument(this.config.instrument),
        this.client.getTicker(this.config.instrument),
      ]);

      const price = ticker.last_price as number;
      const mid = price;

      // Spread filter if order book available via ticker (best_ask/bid)
      const bestAsk = (ticker as any).best_ask ?? price;
      const bestBid = (ticker as any).best_bid ?? price;
      const spreadPct = ((bestAsk - bestBid) / mid) * 100;
      const maxSpreadPct = this.config.spreadFilterBps / 100;
      if (spreadPct > maxSpreadPct) {
        console.warn('[Thor] Spread te hoog, geen entry', { spreadPct, maxSpreadPct });
        return;
      }

      // Determine SL via last 5 swing high/low
      const swings = this.candles.slice(-5);
      if (swings.length < 5) return;

      const swingLow = Math.min(...swings.map(c => c.low));
      const swingHigh = Math.max(...swings.map(c => c.high));

      const minSlDistancePct = 0.05; // 0.05%
      const offsetPct = 0.02; // 0.02%

      let stopPrice: number;
      if (direction === 'long') {
        stopPrice = swingLow * (1 - offsetPct / 100);
        if ((price - stopPrice) / price * 100 < minSlDistancePct) {
          stopPrice = price * (1 - minSlDistancePct / 100);
        }
      } else {
        stopPrice = swingHigh * (1 + offsetPct / 100);
        if ((stopPrice - price) / price * 100 < minSlDistancePct) {
          stopPrice = price * (1 + minSlDistancePct / 100);
        }
      }

      // Position sizing based on risk (FIXED for proper USD sizing)
      const riskPercent = this.config.maxRiskPercent;
      const maxRiskUsd = this.config.fixedRiskUsd && this.config.fixedRiskUsd > 0
        ? this.config.fixedRiskUsd
        : (this.config.accountEquityUsd * (riskPercent / 100));

      const slDistance = Math.abs(price - stopPrice);
      if (slDistance <= 0) {
        console.error('[Thor] SL distance zero, abort');
        return;
      }

      // For USDC perpetuals: Risk = Amount × |Entry - SL|
      // So: Amount = Risk / |Entry - SL|
      // Example: $100 equity, 3% risk = $3 max loss
      // Entry $100, SL $99 => distance $1
      // Amount = $3 / $1 = 3 contracts (each contract is $1 of the coin)
      let amount = maxRiskUsd / slDistance;
      
      // Round to min_trade_amount increments
      amount = Math.max(
        Math.round(amount / instrument.min_trade_amount) * instrument.min_trade_amount,
        instrument.min_trade_amount,
      );
      amount = Number(amount.toFixed(8));

      if (!Number.isFinite(amount) || amount <= 0) {
        console.error('[Thor] Invalid amount', amount);
        return;
      }

      // Log sizing calculation for transparency
      console.log('[Thor] Position Sizing:', {
        equity: this.config.accountEquityUsd,
        riskPercent,
        maxRiskUsd: maxRiskUsd.toFixed(2),
        entry: price.toFixed(2),
        stopLoss: stopPrice.toFixed(2),
        slDistance: slDistance.toFixed(2),
        slDistancePct: ((slDistance / price) * 100).toFixed(3) + '%',
        amount: amount.toFixed(8),
        estimatedLossIfSL: (amount * slDistance).toFixed(2),
      });

      // TP at BB midline
      const closes = this.candles.map(c => c.close);
      const bb = this.calculateBollinger(closes, this.config.bbPeriod, this.config.bbStdDev);
      const tpPrice = bb?.middle ?? (direction === 'long' ? price * 1.0015 : price * 0.9985);

      const tick = instrument.tick_size;
      const round = (v: number) => Math.round(v / tick) * tick;

      const entryPrice = price;
      const slRounded = round(stopPrice);
      const tpRounded = round(tpPrice);

      const label = `thor_${direction}_${Date.now()}`;

      const entry = direction === 'long'
        ? await this.client.placeBuyOrder(this.config.instrument, amount, undefined, 'market', label)
        : await this.client.placeSellOrder(this.config.instrument, amount, undefined, 'market', label);

      await new Promise(r => setTimeout(r, 400));

      const slOrder = direction === 'long'
        ? await this.client.placeSellOrder(this.config.instrument, amount, slRounded, 'stop_market', `${label}_sl`, true)
        : await this.client.placeBuyOrder(this.config.instrument, amount, slRounded, 'stop_market', `${label}_sl`, true);

      const tpOrder = direction === 'long'
        ? await this.client.placeSellOrder(this.config.instrument, amount, tpRounded, 'limit', `${label}_tp`, true)
        : await this.client.placeBuyOrder(this.config.instrument, amount, tpRounded, 'limit', `${label}_tp`, true);

      await ensureTradeHistoryInitialized();
      const history = getTradeHistoryService();
      this.currentTradeId = await history.recordTrade({
        strategyName: this.strategyName,
        instrument: this.config.instrument,
        side: direction === 'long' ? 'buy' : 'sell',
        entryOrderId: entry.order?.order_id || entry.order_id,
        slOrderId: slOrder.order?.order_id || slOrder.order_id,
        tpOrderId: tpOrder.order?.order_id || tpOrder.order_id,
        entryPrice,
        amount,
        stopLoss: slRounded,
        takeProfit: tpRounded,
      });

      this.analysisState.status = 'position_open';
      this.dailyTrades += 1;
      console.log('[Thor] Trade opened', {
        direction,
        entry: entryPrice,
        sl: slRounded,
        tp: tpRounded,
        riskUsd: maxRiskUsd,
      });
    } catch (err) {
      console.error('[Thor] Trade execution failed', err);
      this.analysisState.status = 'analyzing';
    }
  }

  private async checkPositionAndResume(): Promise<void> {
    if (!this.currentTradeId) {
      this.analysisState.status = 'analyzing';
      return;
    }

    try {
      const manager = getOrderLifecycleManager();
      const closed = await manager.checkPositionAndCleanup(this.currentTradeId, this.config.instrument);
      if (closed) {
        this.analysisState.status = 'analyzing';
        this.currentTradeId = null;
      }
    } catch (err) {
      console.error('[Thor] checkPositionAndResume error', err);
    }
  }

  private async reconcileOnStartup(): Promise<void> {
    try {
      const history = getTradeHistoryService();
      const open = await history.queryTrades({ strategyName: this.strategyName, status: 'open', limit: 1 });
      const positions = await this.client.getPositions('USDC');
      const existing = positions.find((p: any) =>
        p.size !== 0 && (p.instrument_name === this.config.instrument || p.instrument === this.config.instrument),
      );

      if (open.length && existing) {
        this.currentTradeId = open[0].id;
        this.analysisState.status = 'position_open';
      } else if (!open.length && !existing) {
        this.analysisState.status = 'analyzing';
      } else if (open.length && !existing) {
        // Clean ghost
        await history.closeTrade({
          tradeId: open[0].id,
          exitPrice: open[0].entryPrice,
          exitReason: 'manual',
          pnl: 0,
          pnlPercentage: 0,
        });
        this.analysisState.status = 'analyzing';
      } else if (!open.length && existing) {
        // Create record from position
        const tradeId = await history.recordTrade({
          strategyName: this.strategyName,
          instrument: this.config.instrument,
          side: existing.size > 0 ? 'buy' : 'sell',
          entryOrderId: 'auto_resume',
          slOrderId: undefined,
          tpOrderId: undefined,
          entryPrice: existing.average_price,
          amount: Math.abs(existing.size),
          stopLoss: 0,
          takeProfit: 0,
        });
        this.currentTradeId = tradeId;
        this.analysisState.status = 'position_open';
      }
    } catch (err) {
      console.error('[Thor] reconcileOnStartup failed', err);
      this.analysisState.status = 'analyzing';
    }
  }

  private calculateRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 50;
    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    const gains = changes.map(c => (c > 0 ? c : 0));
    const losses = changes.map(c => (c < 0 ? -c : 0));
    const avgGain = gains.slice(-period).reduce((s, v) => s + v, 0) / period;
    const avgLoss = losses.slice(-period).reduce((s, v) => s + v, 0) / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateATR(highs: number[], lows: number[], closes: number[], period: number): number | null {
    if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) return null;
    const trs: number[] = [];
    for (let i = highs.length - period; i < highs.length; i++) {
      const h = highs[i];
      const l = lows[i];
      const cPrev = closes[i - 1];
      const tr = Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev));
      trs.push(tr);
    }
    return trs.reduce((s, v) => s + v, 0) / trs.length;
  }

  private calculateBollinger(prices: number[], period: number, stdDev: number):
    | { middle: number; upper: number; lower: number }
    | null {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    return {
      middle: mean,
      upper: mean + stdDev * sd,
      lower: mean - stdDev * sd,
    };
  }
}

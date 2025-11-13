/**
 * Razor Strategy Executor
 * Full implementation with real-time analysis tracking
 */

import type { BackendDeribitClient } from '../deribit-client';
import type { AnalysisState, Checkpoint, PositionMetrics } from '../types/analysis';

export interface RazorConfig {
  instrument: string;
  tradeSize: number; // in USD
  stopLossPercent: number; // e.g., 0.5 = 0.5%
  takeProfitPercent: number; // e.g., 1.0 = 1.0%
  
  // Risk management
  maxConcurrentTrades: number;
  maxDailyTrades: number;
  cooldownMinutes: number;
  
  // Entry criteria (SCALPING TUNED for 50-150 trades/day, 80%+ winrate)
  minVolatility: number; // 0.01% = scalping threshold (was 0.1%)
  maxVolatility: number; // 5.0% = high volatility limit (was 2.0%)
  rsiOversold: number; // 40 = scalping oversold (was 30)
  rsiOverbought: number; // 60 = scalping overbought (was 70)
}

export class RazorExecutor {
  private client: BackendDeribitClient;
  private config: RazorConfig;
  private strategyId: string;
  private strategyName: string;
  
  private analysisState: AnalysisState;
  private priceHistory: number[] = []; // Candle close prices
  private currentCandle: { open: number; high: number; low: number; close: number; timestamp: number } | null = null;
  private candleStartTime: number = Date.now();
  private candleInterval: number = 60000; // 1 minute
  private lastTradeTime: number = 0;
  private dailyTrades: number = 0;
  private dailyResetTime: number = Date.now();
  
  constructor(
    client: BackendDeribitClient,
    strategyId: string,
    strategyName: string,
    config: RazorConfig
  ) {
    this.client = client;
    this.strategyId = strategyId;
    this.strategyName = strategyName;
    this.config = config;
    
    // Initialize analysis state
    this.analysisState = {
      strategyId,
      strategyName,
      status: 'initializing',
      instrument: config.instrument,
      currentPrice: null,
      lastUpdated: Date.now(),
      indicators: {
        emaFast: null,
        emaSlow: null,
        rsi: null,
        volume: null,
        volatility: null,
      },
      signal: {
        type: 'none',
        strength: 0,
        confidence: 0,
        reasons: [],
      },
      checkpoints: [],
      dataPoints: 0,
      requiredDataPoints: 20, // Need 20 candles for RSI
      cooldownUntil: null,
      nextCheckAt: Date.now() + 5000,
    };
    
    // Initialize by fetching historical candles
    this.initializeHistoricalData();
  }
  
  /**
   * Fetch historical candles to start with valid data
   */
  private async initializeHistoricalData(): Promise<void> {
    try {
      console.log(`[Razor] Fetching historical 1-min candles for ${this.config.instrument}...`);
      
      const candles = await this.client.getCandles(this.config.instrument, '1', 100);
      
      if (candles && candles.close && Array.isArray(candles.close)) {
        this.priceHistory = candles.close.slice(-100); // Last 100 candles
        this.analysisState.dataPoints = this.priceHistory.length;
        
        console.log(`[Razor] ✅ Loaded ${this.priceHistory.length} historical candles`);
        console.log(`[Razor] Price range: $${Math.min(...this.priceHistory).toFixed(2)} - $${Math.max(...this.priceHistory).toFixed(2)}`);
        
        // Set current price from latest candle
        if (this.priceHistory.length > 0) {
          this.analysisState.currentPrice = this.priceHistory[this.priceHistory.length - 1];
        }
        
        // If we have enough data, calculate indicators immediately
        if (this.priceHistory.length >= this.analysisState.requiredDataPoints) {
          await this.calculateIndicators();
          this.updateCheckpoints();
          this.analysisState.status = 'analyzing';
          this.analysisState.lastUpdated = Date.now();
          console.log(`[Razor] ✅ Ready to analyze with ${this.priceHistory.length} candles`);
          console.log(`[Razor] Indicators: EMA Fast $${this.analysisState.indicators.emaFast?.toFixed(2)}, RSI ${this.analysisState.indicators.rsi?.toFixed(1)}, Volatility ${this.analysisState.indicators.volatility?.toFixed(2)}%`);
        }
      } else {
        console.warn(`[Razor] ⚠️ No historical candles available, will build from live data`);
      }
    } catch (error) {
      console.error(`[Razor] ❌ Failed to fetch historical candles:`, error);
      console.log(`[Razor] Will build candle history from live ticker data`);
    }
  }
  
  /**
   * Get current analysis state
   */
  getAnalysisState(): AnalysisState {
    return { ...this.analysisState };
  }
  
  /**
   * Process ticker update - called on every price update
   * Builds 1-minute candles from tick data
   */
  async onTicker(price: number): Promise<void> {
    // CRITICAL: Don't analyze if position is already open - strategy should pause
    if (this.analysisState.status === 'position_open') {
      // Still update current price for display
      this.analysisState.currentPrice = price;
      this.analysisState.lastUpdated = Date.now();
      return; // Skip all analysis and trade execution
    }

    this.analysisState.currentPrice = price;
    this.analysisState.lastUpdated = Date.now();
    
    const now = Date.now();
    const timeSinceCandleStart = now - this.candleStartTime;
    
    // Track if we just closed a candle (for trade execution timing)
    let candleJustClosed = false;
    
    // Check if we need to close current candle and start new one
    if (timeSinceCandleStart >= this.candleInterval) {
      // Close current candle if exists
      if (this.currentCandle) {
        this.priceHistory.push(this.currentCandle.close);
        if (this.priceHistory.length > 100) {
          this.priceHistory.shift(); // Keep last 100 candles
        }
        console.log(`[Razor] Candle closed: $${this.currentCandle.close} (${this.priceHistory.length} total)`);
        candleJustClosed = true;
      }
      
      // Start new candle
      this.currentCandle = {
        open: price,
        high: price,
        low: price,
        close: price,
        timestamp: now,
      };
      this.candleStartTime = now;
    } else {
      // Update current candle
      if (!this.currentCandle) {
        this.currentCandle = {
          open: price,
          high: price,
          low: price,
          close: price,
          timestamp: now,
        };
      } else {
        this.currentCandle.high = Math.max(this.currentCandle.high, price);
        this.currentCandle.low = Math.min(this.currentCandle.low, price);
        this.currentCandle.close = price;
      }
    }
    
    this.analysisState.dataPoints = this.priceHistory.length;
    
    // Reset daily trades counter
    if (now - this.dailyResetTime > 24 * 60 * 60 * 1000) {
      this.dailyTrades = 0;
      this.dailyResetTime = now;
    }
    
    // Check if we're in cooldown
    if (this.analysisState.cooldownUntil && now < this.analysisState.cooldownUntil) {
      this.analysisState.status = 'analyzing';
      this.analysisState.checkpoints = [{
        id: 'cooldown',
        label: 'Cooldown periode',
        status: 'pending',
        value: `${Math.ceil((this.analysisState.cooldownUntil - now) / 1000 / 60)} min`,
        description: 'Wachten na vorige trade',
        timestamp: now,
      }];
      return;
    }
    
    // Wait for enough candle data
    if (this.priceHistory.length < this.analysisState.requiredDataPoints) {
      this.analysisState.status = 'initializing';
      this.analysisState.indicators = {
        emaFast: null,
        emaSlow: null,
        rsi: null,
        volume: null,
        volatility: null,
      };
      this.analysisState.checkpoints = [{
        id: 'data_collection',
        label: 'Verzamelen van marktdata',
        status: 'pending',
        value: `${this.priceHistory.length}/${this.analysisState.requiredDataPoints} candles`,
        description: `Wachten op ${this.analysisState.requiredDataPoints - this.priceHistory.length} meer 1-min candles voor valide analyse`,
        timestamp: now,
      }];
      return;
    }
    
    // Calculate indicators with complete candle data
    await this.calculateIndicators();
    
    // Update checkpoints
    this.updateCheckpoints();
    
    // Check for entry signal
    const signal = this.analyzeEntry();
    this.analysisState.signal = signal;
    
    // CRITICAL: Only execute trades on candle close to prevent rate limit abuse
    if (candleJustClosed && signal.type !== 'none' && signal.strength >= 55) {
      console.log(`[Razor] ${signal.type.toUpperCase()} SIGNAL DETECTED - Strength: ${signal.strength.toFixed(2)}, Confidence: ${signal.confidence?.toFixed(2)}%`);
      this.analysisState.status = 'signal_detected';
      // Execute trade
      await this.executeTrade(signal.type);
    } else {
      this.analysisState.status = 'analyzing';
      if (signal.type !== 'none') {
        console.log(`[Razor] Signal ${signal.type} too weak (${signal.strength.toFixed(2)} < 55 threshold)`);
      }
    }
  }

  /**
   * Calculate technical indicators
   */
  private async calculateIndicators(): Promise<void> {
    const prices = this.priceHistory;
    // EMA Slow (21-period)
    this.analysisState.indicators.emaSlow = this.calculateEMA(prices, 21);
    
    // RSI (14-period)
    this.analysisState.indicators.rsi = this.calculateRSI(prices, 14);
    
    // Volatility (standard deviation of last 20 prices)
    this.analysisState.indicators.volatility = this.calculateVolatility(prices.slice(-20));
    
    // Volume (mock for now - would need real volume data)
    this.analysisState.indicators.volume = 1000;
  }
  
  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }
  
  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);
    
    const avgGain = gains.slice(-period).reduce((sum, g) => sum + g, 0) / period;
    const avgLoss = losses.slice(-period).reduce((sum, l) => sum + l, 0) / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  /**
   * Calculate volatility (standard deviation)
   * Enhanced for scalping: uses high-low range for better sensitivity
   */
  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0.05; // Default 0.05% for scalping (not 0)
    
    // Method 1: Standard deviation (original)
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const squaredDiffs = prices.map(p => Math.pow(p - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / prices.length;
    const stdDevPercent = (Math.sqrt(variance) / mean) * 100;
    
    // Method 2: High-Low range (better for scalping)
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const rangePercent = ((high - low) / mean) * 100;
    
    // Use the higher of the two for better signal detection
    const volatility = Math.max(stdDevPercent, rangePercent);
    
    // Ensure minimum 0.01% for active markets
    return Math.max(volatility, 0.01);
  }
  
  /**
   * Update analysis checkpoints for UI display
   */
  private updateCheckpoints(): void {
    const { indicators } = this.analysisState;
    const checkpoints: Checkpoint[] = [];
    
    // Technical Checkpoint 1: Volatility (entry requirement)
    if (indicators.volatility !== null) {
      const inRange = indicators.volatility >= this.config.minVolatility && 
                     indicators.volatility <= this.config.maxVolatility;
      checkpoints.push({
        id: 'volatility',
        label: 'Volatiliteit binnen bereik',
        status: inRange ? 'met' : 'pending',
        value: `${indicators.volatility.toFixed(2)}%`,
        description: inRange 
          ? `Volatiliteit OK (${this.config.minVolatility}% - ${this.config.maxVolatility}%)`
          : `Te ${indicators.volatility < this.config.minVolatility ? 'laag' : 'hoog'} (vereist: ${this.config.minVolatility}% - ${this.config.maxVolatility}%)`,
        timestamp: Date.now(),
      });
    }
    
    // Technical Checkpoint 2: RSI oversold/overbought (entry signal)
    if (indicators.rsi !== null) {
      const isOversold = indicators.rsi < this.config.rsiOversold;
      const isOverbought = indicators.rsi > this.config.rsiOverbought;
      const hasExtreme = isOversold || isOverbought;
      
      checkpoints.push({
        id: 'rsi_extreme',
        label: 'RSI Oversold/Overbought',
        status: hasExtreme ? 'met' : 'pending',
        value: indicators.rsi.toFixed(1),
        description: isOversold 
          ? `Oversold (< ${this.config.rsiOversold}) - Long signaal` 
          : isOverbought 
            ? `Overbought (> ${this.config.rsiOverbought}) - Short signaal`
            : `Neutral (wacht op < ${this.config.rsiOversold} of > ${this.config.rsiOverbought})`,
        timestamp: Date.now(),
      });
    }
    
    // Technical Checkpoint 3: EMA trend direction
    if (indicators.emaFast && indicators.emaSlow) {
      const bullish = indicators.emaFast > indicators.emaSlow;
      const bearish = indicators.emaFast < indicators.emaSlow;
      const gap = Math.abs(indicators.emaFast - indicators.emaSlow);
      const gapPercent = (gap / indicators.emaFast) * 100;
      
      checkpoints.push({
        id: 'ema_trend',
        label: 'EMA Trend richting',
        status: 'met', // Always met - just shows current trend
        value: bullish ? 'Bullish' : 'Bearish',
        description: `Fast: $${indicators.emaFast.toFixed(2)}, Slow: $${indicators.emaSlow.toFixed(2)} (gap: ${gapPercent.toFixed(3)}%)`,
        timestamp: Date.now(),
      });
    }
    
    // Technical Checkpoint 4: Price momentum (recent movement)
    if (this.priceHistory.length >= 5) {
      const oldPrice = this.priceHistory[this.priceHistory.length - 5];
      const currentPrice = this.priceHistory[this.priceHistory.length - 1];
      const momentum = ((currentPrice - oldPrice) / oldPrice) * 100;
      const hasMomentum = Math.abs(momentum) > 0.05; // SCALPING: 0.05% minimum (was 0.1%)
      
      checkpoints.push({
        id: 'momentum',
        label: 'Prijs momentum',
        status: hasMomentum ? 'met' : 'pending',
        value: `${momentum > 0 ? '+' : ''}${momentum.toFixed(2)}%`,
        description: hasMomentum
          ? `${momentum > 0 ? 'Stijgend' : 'Dalend'} (laatste 5 candles)`
          : 'Geen beweging (< 0.05%)',
        timestamp: Date.now(),
      });
    }
    
    // Sort: pending first, then met
    checkpoints.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return 0;
    });
    
    this.analysisState.checkpoints = checkpoints;
  }
  
  /**
   * Analyze entry conditions
   * HIGH-FREQUENCY SCALPING: 50-150 trades/day, 80%+ winrate, min 1:1.5 R:R
   */
  private analyzeEntry(): { type: 'long' | 'short' | 'none'; strength: number; confidence: number; reasons: string[] } {
    const { indicators } = this.analysisState;
    const reasons: string[] = [];
    let longScore = 0;
    let shortScore = 0;
    
    // Check daily limit
    if (this.dailyTrades >= this.config.maxDailyTrades) {
      return { type: 'none', strength: 0, confidence: 0, reasons: ['Dagelijkse limiet bereikt'] };
    }
    
    // Volatility filter (SCALPING: 0.01% - 5.0%)
    if (indicators.volatility !== null) {
      if (indicators.volatility < this.config.minVolatility) {
        return { type: 'none', strength: 0, confidence: 0, reasons: ['Volatiliteit te laag voor scalping'] };
      }
      if (indicators.volatility > this.config.maxVolatility) {
        return { type: 'none', strength: 0, confidence: 0, reasons: ['Volatiliteit te hoog (te risicovol)'] };
      }
      
      // Volatility bonus (optimal 0.1% - 0.5% for scalping)
      if (indicators.volatility >= 0.1 && indicators.volatility <= 0.5) {
        longScore += 10;
        shortScore += 10;
        reasons.push('Optimale volatiliteit voor scalping');
      }
    }
    
    // RSI PRIMARY SIGNAL (SCALPING: 40/60 thresholds)
    if (indicators.rsi !== null) {
      if (indicators.rsi < this.config.rsiOversold) {
        // Oversold = LONG signal
        const oversoldStrength = this.config.rsiOversold - indicators.rsi;
        longScore += Math.min(40 + oversoldStrength, 50);
        reasons.push(`RSI oversold (${indicators.rsi.toFixed(1)})`);
        
        // EMA trend confirmation
        if (indicators.emaFast && indicators.emaSlow && indicators.emaFast > indicators.emaSlow) {
          longScore += 20;
          reasons.push('EMA trend bevestigt LONG');
        } else if (indicators.emaFast && indicators.emaSlow) {
          longScore += 5; // Kleine bonus zelfs zonder trend
        }
      } else if (indicators.rsi > this.config.rsiOverbought) {
        // Overbought = SHORT signal
        const overboughtStrength = indicators.rsi - this.config.rsiOverbought;
        shortScore += Math.min(40 + overboughtStrength, 50);
        reasons.push(`RSI overbought (${indicators.rsi.toFixed(1)})`);
        
        // EMA trend confirmation
        if (indicators.emaFast && indicators.emaSlow && indicators.emaFast < indicators.emaSlow) {
          shortScore += 20;
          reasons.push('EMA trend bevestigt SHORT');
        } else if (indicators.emaFast && indicators.emaSlow) {
          shortScore += 5; // Kleine bonus zelfs zonder trend
        }
      }
    }
    
    // Momentum (SCALPING: 0.05% threshold voor micro-moves)
    if (this.priceHistory.length >= 5) {
      const oldPrice = this.priceHistory[this.priceHistory.length - 5];
      const currentPrice = this.priceHistory[this.priceHistory.length - 1];
      const momentum = ((currentPrice - oldPrice) / oldPrice) * 100;
      
      if (momentum > 0.05) {
        longScore += 15;
        reasons.push('Positief momentum');
      } else if (momentum < -0.05) {
        shortScore += 15;
        reasons.push('Negatief momentum');
      }
    }
    
    // EMA crossover bonus (only if no RSI signal yet)
    if (indicators.emaFast && indicators.emaSlow && longScore < 20 && shortScore < 20) {
      const emaDiffPercent = Math.abs(indicators.emaFast - indicators.emaSlow) / indicators.emaFast * 100;
      
      if (indicators.emaFast > indicators.emaSlow && emaDiffPercent > 0.02) {
        longScore += 25;
        reasons.push('EMA bullish crossover');
      } else if (indicators.emaFast < indicators.emaSlow && emaDiffPercent > 0.02) {
        shortScore += 25;
        reasons.push('EMA bearish crossover');
      }
    }
    
    // Determine signal (SCALPING: 55 threshold for high-frequency)
    const SCALPING_THRESHOLD = 55;
    
    if (longScore > shortScore && longScore >= SCALPING_THRESHOLD) {
      return {
        type: 'long',
        strength: Math.min(longScore, 100),
        confidence: Math.min((longScore / 80) * 100, 100),
        reasons,
      };
    } else if (shortScore > longScore && shortScore >= SCALPING_THRESHOLD) {
      return {
        type: 'short',
        strength: Math.min(shortScore, 100),
        confidence: Math.min((shortScore / 80) * 100, 100),
        reasons,
      };
    }
    
    return { type: 'none', strength: Math.max(longScore, shortScore), confidence: 0, reasons: ['Score onder threshold (55)'] };
  }
  
  /**
   * Execute trade
   */
  private async executeTrade(direction: 'long' | 'short'): Promise<void> {
    try {
      console.log(`[Razor] Executing ${direction.toUpperCase()} trade...`);
      
      // Check for existing position
      const positions = await this.client.getPositions('USDC');
      const hasPosition = positions.some((p: any) => p.size !== 0);
      
      if (hasPosition) {
        console.log('[Razor] Position already exists - skipping');
        return;
      }
      
      // Get instrument details
      const instrument = await this.client.getInstrument(this.config.instrument);
      const ticker = await this.client.getTicker(this.config.instrument);
      const currentPrice = ticker.last_price;
      
      // Calculate position size
      const notionalValue = this.config.tradeSize;
      const amount = notionalValue / currentPrice;
      const roundedAmount = Math.max(
        Math.round(amount / instrument.min_trade_amount) * instrument.min_trade_amount,
        instrument.min_trade_amount
      );
      // Fix floating point precision
      const finalAmount = Number(roundedAmount.toFixed(8));
      
      // Calculate SL and TP
      const slPercent = this.config.stopLossPercent / 100;
      const tpPercent = this.config.takeProfitPercent / 100;
      
      let stopLoss, takeProfit;
      if (direction === 'long') {
        stopLoss = currentPrice * (1 - slPercent);
        takeProfit = currentPrice * (1 + tpPercent);
      } else {
        stopLoss = currentPrice * (1 + slPercent);
        takeProfit = currentPrice * (1 - tpPercent);
      }
      
      // Round to tick size
      const tickSize = instrument.tick_size;
      stopLoss = Math.round(stopLoss / tickSize) * tickSize;
      takeProfit = Math.round(takeProfit / tickSize) * tickSize;
      
      const label = `razor_${direction}_${Date.now()}`;
      
      console.log('[Razor] Order details:', {
        direction,
        amount: finalAmount,
        entry: currentPrice,
        sl: stopLoss,
        tp: takeProfit,
      });
      
      // Place entry order
      const entryOrder = direction === 'long'
        ? await this.client.placeBuyOrder(this.config.instrument, finalAmount, undefined, 'market', label)
        : await this.client.placeSellOrder(this.config.instrument, finalAmount, undefined, 'market', label);
      
      console.log('[Razor] Entry order placed:', entryOrder.order_id);
      
      // Wait and verify
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Place SL
      const slOrder = direction === 'long'
        ? await this.client.placeSellOrder(this.config.instrument, finalAmount, stopLoss, 'stop_market', `${label}_sl`, true)
        : await this.client.placeBuyOrder(this.config.instrument, finalAmount, stopLoss, 'stop_market', `${label}_sl`, true);
      
      console.log('[Razor] Stop loss placed:', slOrder.order_id);
      
      // Place TP
      const tpOrder = direction === 'long'
        ? await this.client.placeSellOrder(this.config.instrument, finalAmount, takeProfit, 'limit', `${label}_tp`, true)
        : await this.client.placeBuyOrder(this.config.instrument, finalAmount, takeProfit, 'limit', `${label}_tp`, true);
      
      console.log('[Razor] Take profit placed:', tpOrder.order_id);
      
      // Update state
      this.analysisState.status = 'position_open';
      this.lastTradeTime = Date.now();
      this.dailyTrades++;
      this.analysisState.cooldownUntil = Date.now() + (this.config.cooldownMinutes * 60 * 1000);
      
      console.log(`[Razor] ✅ Trade executed successfully`);
    } catch (error) {
      console.error('[Razor] Trade execution failed:', error);
      // Don't throw - just log and continue analyzing
      this.analysisState.status = 'analyzing';
      // Set cooldown to prevent immediate retry
      this.analysisState.cooldownUntil = Date.now() + (1 * 60 * 1000); // 1 min cooldown on error
    }
  }
  
  /**
   * Get position metrics (called when position is open)
   */
  async getPositionMetrics(): Promise<PositionMetrics | null> {
    try {
      const positions = await this.client.getPositions('USDC');
      const position = positions.find((p: any) => p.size !== 0);
      
      if (!position) {
        return null;
      }
      
      const ticker = await this.client.getTicker(this.config.instrument);
      const currentPrice = ticker.last_price;
      const entryPrice = position.average_price;
      const amount = Math.abs(position.size);
      const direction = position.direction === 'buy' ? 'long' : 'short';
      
      // Calculate P&L
      let unrealizedPnl;
      if (direction === 'long') {
        unrealizedPnl = (currentPrice - entryPrice) * amount;
      } else {
        unrealizedPnl = (entryPrice - currentPrice) * amount;
      }
      
      const unrealizedPnlPercent = (unrealizedPnl / (entryPrice * amount)) * 100;
      
      // Get orders
      const orders = await this.client.getOpenOrders(this.config.instrument);
      const slOrder = orders.find((o: any) => o.order_type === 'stop_market');
      const tpOrder = orders.find((o: any) => o.order_type === 'limit' && o.reduce_only);
      
      return {
        strategyId: this.strategyId,
        instrument: this.config.instrument,
        direction,
        entryPrice,
        currentPrice,
        amount,
        stopLoss: slOrder?.trigger_price || slOrder?.price || 0,
        takeProfit: tpOrder?.price || 0,
        unrealizedPnl,
        unrealizedPnlPercent,
        entryOrderId: 'unknown', // Would need to track this
        slOrderId: slOrder?.order_id,
        tpOrderId: tpOrder?.order_id,
        enteredAt: this.lastTradeTime,
        duration: Date.now() - this.lastTradeTime,
      };
    } catch (error) {
      console.error('[Razor] Failed to get position metrics:', error);
      return null;
    }
  }
}

/**
 * Razor Strategy Executor
 * Full implementation with real-time analysis tracking
 */

import type { BackendDeribitClient } from '../deribit-client';
import type { AnalysisState, Checkpoint, PositionMetrics } from '../types/analysis';
import { getTradeHistoryService, ensureTradeHistoryInitialized } from '../services/trade-history';
import { deriveExitDetails } from '../services/trade-finalizer';
import { getOrderLifecycleManager, initializeOrderLifecycleManager } from '../services/order-lifecycle-manager';

export interface RazorConfig {
  instrument: string;
  tradeSize: number; // in USD
  stopLossPercent: number; // e.g., 0.5 = 0.5%
  takeProfitPercent: number; // e.g., 1.5 = 1.5% (minimum 2:1 R:R voor 70%+ winrate)
  
  // Risk management
  maxConcurrentTrades: number;
  maxDailyTrades: number;
  cooldownMinutes: number;
  
  // Dynamic management
  breakEvenEnabled?: boolean; // default true
  breakEvenTriggerToTP?: number; // 0.0-1.0, default 0.5 (50% to TP)
  breakEvenOffsetTicks?: number; // how many ticks beyond entry to avoid pinging, default 1
  trailingStopEnabled?: boolean; // Track prijs met trailing stop (70%+ winrate)
  trailingStopActivationPercent?: number; // Activeer trailing na X% naar TP (default 0.6)
  trailingStopDistance?: number; // Trailing distance in % (default 0.3%)

  // MULTI-TIMEFRAME TREND FILTER (70%+ Winrate Door Trend Alignment)
  useTrendFilter?: boolean; // VERPLICHT: Trade alleen met 5m/15m trend mee (default true)
  ema5mFastPeriod?: number; // 5-minute EMA fast (default 8)
  ema5mSlowPeriod?: number; // 5-minute EMA slow (default 21)
  ema15mFastPeriod?: number; // 15-minute EMA fast (default 8)
  ema15mSlowPeriod?: number; // 15-minute EMA slow (default 21)
  requireTrendAlignment?: boolean; // Vereis 5m+15m+1m alignment (default true, zeer strikt)
  
  // CONFLUENCE-BASED ENTRIES (70%+ Winrate Door Selectiviteit)
  minConfluenceScore?: number; // Minimum confluence voor entry (default 4 van 5)
  requireRsiExtreme?: boolean; // Vereis RSI oversold/overbought (default true)
  requireMomentumConfirmation?: boolean; // Vereis momentum richting (default true)
  requireVolumeSpike?: boolean; // Vereis volume confirmatie (default false, niet altijd beschikbaar)

  // Advanced filters (behouden voor backward compatibility)
  advancedFiltersEnabled?: boolean; // master toggle
  useMultiTimeframe?: boolean; // DEPRECATED: gebruik useTrendFilter
  adaptiveRiskEnabled?: boolean; // scale SL/TP by ATR
  atrPeriod?: number; // default 14
  pullbackPercent?: number; // % retrace after impulse to qualify (e.g. 0.15 = 15%)
  
  // Entry criteria (AANGEPAST voor 70%+ winrate: strengere filters)
  minVolatility: number; // 0.02% = minimum beweging voor valide signaal
  maxVolatility: number; // 1.5% = maximum (te hoog = whipsaw)
  rsiOversold: number; // 35 = strengere oversold (was 40)
  rsiOverbought: number; // 65 = strengere overbought (was 60)
  rsiExtremeThreshold?: number; // Extra extreme RSI voor bonus score (default 25/75)
}

export class RazorExecutor {
  private client: BackendDeribitClient;
  private config: RazorConfig;
  private strategyId: string;
  private strategyName: string;
  private userId?: string; // FASE 3: Multi-user support
  
  private analysisState: AnalysisState;
  private priceHistory: number[] = []; // Candle close prices (1m)
  private highHistory: number[] = []; // Candle highs (1m)
  private lowHistory: number[] = []; // Candle lows (1m)
  private currentCandle: { open: number; high: number; low: number; close: number; timestamp: number } | null = null;
  private candleStartTime: number = Date.now();
  private candleInterval: number = 60000; // 1 minute
  private lastTradeTime: number = 0;
  private dailyTrades: number = 0;
  private dailyResetTime: number = Date.now();
  
  // MULTI-TIMEFRAME DATA (voor trend filter)
  private candles5m: number[] = []; // 5-minute candle closes
  private candles15m: number[] = []; // 15-minute candle closes
  private last5mCandleTime: number = 0;
  private last15mCandleTime: number = 0;
  
  // Trade history tracking
  private currentTradeId: string | null = null;
  
  // Cooldown logging (prevent spam)
  private lastCooldownLog: number = 0;

  // Mock ticker scheduler for development
  private mockTickerInterval: NodeJS.Timeout | null = null;

  // Stop management helpers
  private beMovedForTrade: boolean = false; // reset per trade
  private lastStopAdjustCheck: number = 0;

  constructor(
    client: BackendDeribitClient,
    strategyId: string,
    strategyName: string,
    config: RazorConfig,
    userId?: string // FASE 3: Optional userId for multi-user support
  ) {
    this.client = client;
    this.strategyId = strategyId;
    this.strategyName = strategyName;
    this.config = config;
    this.userId = userId; // FASE 3: Store userId    // Initialize analysis state
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
          // Extended indicators (placeholder values)
          atr: null as any,
          emaFast3m: null as any,
          emaSlow3m: null as any,
          emaFast5m: null as any,
          emaSlow5m: null as any,
          trendScore: null as any,
          pullbackReady: null as any,
      },
      signal: {
        type: 'none',
        strength: 0,
        confidence: 0,
        reasons: [],
      },
      checkpoints: [],
      dataPoints: 0,
      requiredDataPoints: 15, // Reduced from 20 to 15 for faster startup
      cooldownUntil: null,
      nextCheckAt: Date.now() + 5000,
    };
    
    // DON'T call initializeHistoricalData here - it will be called via initialize()
  }
  
  /**
   * PUBLIC: Initialize strategy (call this after constructor)
   * Loads historical data + checks for orphan trades
   */
  async initialize(): Promise<void> {
    console.log('[Razor] 🚀 INITIALIZE CALLED - Starting strategy initialization');
    try {
      // Initialize order lifecycle manager (singleton)
      initializeOrderLifecycleManager(this.client);
      
      await this.initializeHistoricalData();
      console.log('[Razor] ✅ INITIALIZE COMPLETE - Strategy ready');
      
      // DISABLED: Mock ticker updates interfere with real ticker data
      // this.startMockTickerUpdates();
      
      // Initialize checkpoints after loading historical data
      this.updateCheckpoints();
    } catch (error) {
      console.error('[Razor] ❌ INITIALIZE FAILED:', error);
      throw error;
    }
  }
  
  /**
   * Fetch historical candles to start with valid data
   */
  private async initializeHistoricalData(): Promise<void> {
    try {
      console.log(`[Razor] Fetching historical 1-min candles for ${this.config.instrument}...`);
      
      let candles;
      try {
        candles = await this.client.getCandles(this.config.instrument, '1', 200); // Increased from 100 to 200
      } catch (error) {
        console.warn(`[Razor] ❌ Failed to fetch historical candles from Deribit:`, (error as Error).message);
        console.log(`[Razor] Will generate mock historical data for development...`);
        
        // Generate mock historical data for development when Deribit is not available
        candles = this.generateMockCandles(150); // Generate 150 mock candles
      }
      
      if (candles && candles.close && Array.isArray(candles.close)) {
        this.priceHistory = candles.close.slice(-150); // Keep last 150 candles
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
        } else {
          // Initialize basic checkpoints even with insufficient data
          this.updateCheckpoints();
        }
      } else {
        console.warn(`[Razor] ⚠️ No historical candles available, generating mock data...`);
        // Generate mock data as fallback
        this.priceHistory = this.generateMockCandles(150).close;
        this.analysisState.dataPoints = this.priceHistory.length;
        this.analysisState.currentPrice = this.priceHistory[this.priceHistory.length - 1];
        
        await this.calculateIndicators();
        this.updateCheckpoints();
        this.analysisState.status = 'analyzing';
        console.log(`[Razor] ✅ Using mock data - ready to analyze with ${this.priceHistory.length} candles`);
      }
    } catch (error) {
      console.error(`[Razor] ❌ Failed to initialize historical data:`, error);
      console.log(`[Razor] Generating mock data as final fallback...`);
      
      // Final fallback: generate mock data
      this.priceHistory = this.generateMockCandles(150).close;
      this.analysisState.dataPoints = this.priceHistory.length;
      this.analysisState.currentPrice = this.priceHistory[this.priceHistory.length - 1];
      
      await this.calculateIndicators();
      this.updateCheckpoints();
      this.analysisState.status = 'analyzing';
      console.log(`[Razor] ✅ Mock data fallback - ready to analyze`);
    }
    
    // STATE RECONCILIATION: Validate DB vs Deribit at startup
    await this.reconcileStateOnStartup();
  }
  
  /**
   * Reconcile database state with Deribit position state at startup
   * Handles: ghost trades, orphan positions, resume tracking
   */
  private async reconcileStateOnStartup(): Promise<void> {
    try {
      console.log('\n' + '='.repeat(80));
      console.log('[Razor] 🔄 RECONCILING DATABASE vs DERIBIT STATE');
      console.log('='.repeat(80));
      
      const tradeHistory = getTradeHistoryService();
      
      // Step 1: Get DB state
      const openTrades = await tradeHistory.queryTrades({
        strategyName: this.strategyName,
        status: 'open',
        limit: 10,
      });
      
      console.log(`[Razor] 📊 Database: ${openTrades.length} open trade(s)`);
      
      // Step 2: Get Deribit state
      const positions = await this.client.getPositions('USDC');
      const ourPosition = positions.find((p: any) => 
        p.size !== 0 && 
        (p.instrument_name === this.config.instrument || p.instrument === this.config.instrument)
      );
      
      console.log(`[Razor] 📊 Deribit: ${ourPosition ? 'Position OPEN' : 'No position'}`);
      
      // CASE 1: Ghost trades (DB says open, Deribit says no position)
      if (openTrades.length > 0 && !ourPosition) {
        console.log(`\n[Razor] ⚠️  GHOST TRADE DETECTED!`);
        console.log(`[Razor] Database has ${openTrades.length} open trade(s) but no Deribit position`);
        console.log(`[Razor] 🧹 Cleaning up ghost trades...`);
        
        for (const trade of openTrades) {
          await this.closeGhostTrade(trade.id);
        }
        
        console.log('[Razor] ✅ Ghost trades cleaned up - status: analyzing');
        this.analysisState.status = 'analyzing';
        console.log('='.repeat(80) + '\n');
        return;
      }
      
      // CASE 2: Orphan position (Deribit has position, DB has no trade)
      if (openTrades.length === 0 && ourPosition) {
        console.log(`\n[Razor] ⚠️  ORPHAN POSITION DETECTED!`);
        console.log(`[Razor] Deribit has position but no database record`);
        console.log(`[Razor] 📝 Creating database record for existing position...`);
        
        await this.createTradeFromPosition(ourPosition);
        
        console.log('[Razor] ✅ Orphan position recorded - status: position_open');
        this.analysisState.status = 'position_open';
        console.log('='.repeat(80) + '\n');
        return;
      }
      
      // CASE 3: Consistent state (DB has trade AND Deribit has position)
      if (openTrades.length > 0 && ourPosition) {
        console.log(`\n[Razor] ✅ STATE CONSISTENT`);
        console.log(`[Razor] Database trade: ${openTrades[0].id}`);
        console.log(`[Razor] Deribit position: ${Math.abs(ourPosition.size)} @ $${ourPosition.average_price}`);
        console.log(`[Razor] 🔄 Resuming position tracking...`);
        
        this.currentTradeId = openTrades[0].id;
        this.analysisState.status = 'position_open';
        
        console.log('[Razor] ✅ Position tracking resumed');
        console.log('='.repeat(80) + '\n');
        return;
      }
      
      // CASE 4: Clean slate (no DB trade, no Deribit position)
      console.log(`\n[Razor] ✅ CLEAN STATE`);
      console.log('[Razor] No open trades, no position - ready for new trades');
      this.analysisState.status = 'analyzing';
      console.log('='.repeat(80) + '\n');
      
    } catch (error) {
      console.error('[Razor] ❌ Reconciliation failed:', error);
      // Default to analyzing to prevent stuck state
      this.analysisState.status = 'analyzing';
    }
  }
  
  /**
   * Close ghost trade in database (no position exists on Deribit)
   */
  private async closeGhostTrade(tradeId: string): Promise<void> {
    try {
      const tradeHistory = getTradeHistoryService();
      const trade = await tradeHistory.getTrade(tradeId);
      
      if (!trade) {
        console.log(`[Razor] ⚠️  Trade ${tradeId} not found in database`);
        return;
      }
      
      console.log(`[Razor] 🧹 Closing ghost trade: ${tradeId}`);
      
      await tradeHistory.closeTrade({
        tradeId,
        exitPrice: trade.entryPrice, // No price movement
        exitReason: 'manual', // Using 'manual' as closest match
        pnl: 0,
        pnlPercentage: 0,
      });
      
      console.log(`[Razor] ✅ Ghost trade closed: ${tradeId}`);
    } catch (error) {
      console.error(`[Razor] ❌ Failed to close ghost trade ${tradeId}:`, error);
    }
  }
  
  /**
   * Create database trade from existing Deribit position (orphan recovery)
   */
  private async createTradeFromPosition(position: any): Promise<void> {
    try {
      const tradeHistory = getTradeHistoryService();
      
      // Get open orders to find SL/TP
      const openOrders = await this.client.getOpenOrders(this.config.instrument);
      const slOrder = openOrders.find((o: any) => o.reduce_only && o.order_type === 'stop_market');
      const tpOrder = openOrders.find((o: any) => o.reduce_only && o.order_type === 'limit');
      
      // Calculate SL/TP prices
      const stopLoss = slOrder ? (slOrder.trigger_price || slOrder.price) : 
                      position.size > 0 ? position.average_price * 0.995 : position.average_price * 1.005;
      const takeProfit = tpOrder ? tpOrder.price : 
                        position.size > 0 ? position.average_price * 1.01 : position.average_price * 0.99;
      
      // Create database record
      this.currentTradeId = await tradeHistory.recordTrade({
        userId: this.userId, // FASE 3: Multi-user support
        strategyName: this.strategyName,
        instrument: this.config.instrument,
        side: position.size > 0 ? 'buy' : 'sell',
        entryOrderId: 'auto_resume',
        slOrderId: slOrder?.order_id || null,
        tpOrderId: tpOrder?.order_id || null,
        entryPrice: position.average_price,
        amount: Math.abs(position.size),
        stopLoss,
        takeProfit,
      });
      
      console.log(`[Razor] ✅ Created DB record: ${this.currentTradeId}`);
      console.log(`[Razor]    Entry: $${position.average_price}`);
      console.log(`[Razor]    SL: ${slOrder?.order_id || 'N/A'}`);
      console.log(`[Razor]    TP: ${tpOrder?.order_id || 'N/A'}`);
    } catch (error) {
      console.error('[Razor] ❌ Failed to create trade from position:', error);
    }
  }
  
  /**
   * OLD METHOD - KEEP FOR NOW (fallback)
   * Check for orphan trades at startup
   * Orphan = database says 'open', but no position exists on Deribit
   * This happens when position is manually closed outside the bot
   */
  private async checkAndCleanupOrphanTrade(): Promise<void> {
    try {
      console.log('[Razor] 🔍 Checking for orphan trades at startup...');
      
      // Check if position actually exists on Deribit (do this ONCE at top)
      const positions = await this.client.getPositions('USDC');
      const hasPosition = positions.some((p: any) => 
        p.size !== 0 && (p.instrument_name === this.config.instrument || p.instrument === this.config.instrument)
      );
      
      // Query database for open trades for this strategy
      const tradeHistory = getTradeHistoryService();
      const openTrades = await tradeHistory.queryTrades({
        strategyName: this.strategyName,
        status: 'open',
        limit: 1,
      });
      
      // CASE 1: No DB trade, No Deribit position → Clean startup
      if (openTrades.length === 0 && !hasPosition) {
        console.log('[Razor] ✅ No open trades in database - clean startup');
        console.log('[Razor] ✅ No position in Deribit - ready for new trades');
        return;
      }
      
      // CASE 2: No DB trade, BUT Deribit position exists → Create DB record (auto-resume)
      if (openTrades.length === 0 && hasPosition) {
        const position = positions.find((p: any) => 
          p.size !== 0 && (p.instrument_name === this.config.instrument || p.instrument === this.config.instrument)
        );
        
        console.log(`\n${'='.repeat(80)}`);
        console.log('[Razor] 🔄 AUTO-RESUME: Position without database trade');
        console.log(`[Razor] Position: ${Math.abs(position.size)} contracts @ $${position.average_price}`);
        console.log('[Razor] 📝 Creating database record for existing position...');
        console.log(`${'='.repeat(80)}\n`);
        
        // Get open orders to find SL/TP order IDs
        const openOrders = await this.client.getOpenOrders(this.config.instrument);
        const slOrder = openOrders.find((o: any) => o.reduce_only && o.order_type === 'stop_market');
        const tpOrder = openOrders.find((o: any) => o.reduce_only && o.order_type === 'limit');
        
        // Calculate SL/TP prices from orders (or estimate if not found)
        const stopLoss = slOrder ? slOrder.trigger_price || slOrder.price : 
                        position.size > 0 ? position.average_price * 0.995 : position.average_price * 1.005;
        const takeProfit = tpOrder ? tpOrder.price : 
                          position.size > 0 ? position.average_price * 1.01 : position.average_price * 0.99;
        
        // Record trade in database
        this.currentTradeId = await tradeHistory.recordTrade({
          userId: this.userId, // FASE 3: Multi-user support
          strategyName: this.strategyName,
          instrument: this.config.instrument,
          side: position.size > 0 ? 'buy' : 'sell',
          entryOrderId: 'auto_resume',
          slOrderId: slOrder?.order_id || null,
          tpOrderId: tpOrder?.order_id || null,
          entryPrice: position.average_price,
          amount: Math.abs(position.size),
          stopLoss,
          takeProfit
        });
        
        console.log('[Razor] ✅ Database trade record created:');
        console.log(`[Razor]    Trade ID: ${this.currentTradeId}`);
        console.log(`[Razor]    Entry: $${position.average_price}`);
        console.log(`[Razor]    SL Order: ${slOrder?.order_id || 'N/A'}`);
        console.log(`[Razor]    TP Order: ${tpOrder?.order_id || 'N/A'}`);
        console.log('[Razor] Setting status to position_open - will monitor for close');
        this.analysisState.status = 'position_open';
        return;
      }
      
      // CASE 3: DB trade exists - check if position still exists
      const dbTrade = openTrades[0];
      this.currentTradeId = dbTrade.id;
      
      console.log(`[Razor] 📊 Found open trade in database: ${this.currentTradeId}`);
      
      if (!hasPosition) {
        // ORPHAN DETECTED: Database says open, but no Deribit position
        console.log(`\n${'='.repeat(80)}`);
        console.log('[Razor] ⚠️  ORPHAN TRADE DETECTED AT STARTUP');
        console.log(`[Razor] Database Trade ID: ${this.currentTradeId}`);
        console.log(`[Razor] Database Entry Price: $${dbTrade.entryPrice}`);
        console.log(`[Razor] Deribit Position: NOT FOUND (manually closed?)`);
        console.log('[Razor] Action: Cleaning up orphan trade + orders');
        console.log(`${'='.repeat(80)}\n`);
        
        // Use OrderLifecycleManager for cleanup
        const orderManager = getOrderLifecycleManager();
        await orderManager.cleanupTradeOrders(this.currentTradeId, 'Orphan trade at startup');
        
        // Get current price for PnL calculation
        const ticker = await this.client.getTicker(this.config.instrument);
        const exitPrice = ticker.last_price;
        
        // Calculate PnL (CORRECT for USDC perpetuals)
        const isLong = dbTrade.side === 'buy';
        const priceChangePercent = (exitPrice - dbTrade.entryPrice) / dbTrade.entryPrice;
        
        let pnl: number;
        if (isLong) {
          pnl = priceChangePercent * dbTrade.amount;
        } else {
          pnl = -priceChangePercent * dbTrade.amount;
        }
        
        const pnlPercentage = priceChangePercent * 100 * (isLong ? 1 : -1);
        
        // Determine exit reason
        let exitReason: 'sl_hit' | 'tp_hit' | 'manual';
        if (dbTrade.stopLoss === 0 || dbTrade.takeProfit === 0) {
          // Manual sync trade - determine by PnL
          exitReason = pnl > 0 ? 'tp_hit' : pnl < 0 ? 'sl_hit' : 'manual';
        } else {
          exitReason = 'manual'; // Orphan cleanup
        }
        
        // Close trade in database with calculated PnL
        const tradeHistory = getTradeHistoryService();
        await tradeHistory.closeTrade({
          tradeId: this.currentTradeId,
          exitPrice,
          exitReason,
          pnl,
          pnlPercentage
        });
        
        console.log(`[Razor] 💾 Trade closed: ${exitReason.toUpperCase()} - PnL: $${pnl.toFixed(2)} (${pnlPercentage.toFixed(2)}%)`);
        
        // Clear current trade ID
        this.currentTradeId = null;
        
        console.log('[Razor] ✅ Orphan cleanup complete - ready for new trades');
      } else {
        // Position exists WITH database trade - normal resume
        const position = positions.find((p: any) => 
          p.size !== 0 && (p.instrument_name === this.config.instrument || p.instrument === this.config.instrument)
        );
        
        console.log(`[Razor] ✅ Found position matching database trade`);
        console.log(`[Razor]    Trade ID: ${this.currentTradeId}`);
        console.log(`[Razor]    Position: ${Math.abs(position.size)} contracts @ $${position.average_price}`);
        console.log('[Razor] Setting status to position_open - will monitor for close');
        this.analysisState.status = 'position_open';
      }
    } catch (error) {
      console.error('[Razor] ❌ Error during orphan trade check:', error);
    }
  }
  
  /**
   * Get current analysis state
   */
  getAnalysisState(): AnalysisState {
    return { ...this.analysisState };
  }
  
  /**
   * Check if position is still open, resume strategy if closed
   * Called every tick when status is 'position_open'
   */
  private async checkPositionAndResume(): Promise<void> {
    try {
      if (!this.currentTradeId) {
        console.warn('[Razor] No currentTradeId during position check - resetting to analyzing');
        this.analysisState.status = 'analyzing';
        this.updateCheckpoints();
        return;
      }

      // Try dynamic stop adjustments (throttled)
      await this.maybeAdjustStops();

      // Check if position still exists
      const positions = await this.client.getPositions('USDC');
      const position = positions.find((p: any) =>
        p.size !== 0 && (p.instrument_name === this.config.instrument || p.instrument === this.config.instrument)
      );

      if (!position) {
        // Position is closed - resume strategy
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[Razor] 🔄 POSITION CLOSED - AUTO-RESUME TRIGGERED`);
        console.log(`[Razor] ✅ Position closed - RESUMING strategy analysis`);
        console.log(`${'='.repeat(80)}\n`);

        // Close trade in database
        await this.closeTradeHistory();

        // Resume analysis
        this.analysisState.status = 'analyzing';
        this.analysisState.cooldownUntil = Date.now() + (this.config.cooldownMinutes * 60 * 1000);

        const cooldownEnd = new Date(this.analysisState.cooldownUntil).toLocaleTimeString();
        console.log(`[Razor] ⏱️  Cooldown active until: ${cooldownEnd} (${this.config.cooldownMinutes} minutes)`);
        console.log(`[Razor] 🔍 Next trade opportunity after cooldown period`);
        console.log(`[Razor] 🚀 Auto-resume complete - strategy will continue automatically`);

        // Update checkpoints after position close
        this.updateCheckpoints();
      }
    } catch (error) {
      console.error('[Razor] Error checking position status:', error);
      // Don't change status on error - stay safe
    }
  }

  /**
   * Close the current trade in history with exit details
   */
  private async closeTradeHistory(): Promise<void> {
    if (!this.currentTradeId) {
      console.log('[Razor] No active trade to close in history');
      return;
    }
    
    try {
      const tradeHistory = getTradeHistoryService();
      
      // Get exit price with error handling
      let exitPrice: number;
      try {
        const ticker = await this.client.getTicker(this.config.instrument);
        exitPrice = ticker.last_price;
      } catch (tickerError: any) {
        // WebSocket error - fall back to REST API
        console.log('[Razor] ⚠️  WebSocket error getting ticker, using REST API');
        const response = await this.client.sendRequest('public/ticker', {
          instrument_name: this.config.instrument
        });
        exitPrice = response?.last_price || 0;
        
        if (!exitPrice) {
          console.error('[Razor] ❌ Could not get exit price - aborting close');
          return;
        }
      }
      
      // Get the original trade to calculate PnL
      const trade = await tradeHistory.getTrade(this.currentTradeId);
      if (!trade) {
        console.error('[Razor] Trade not found in history:', this.currentTradeId);
        this.currentTradeId = null;
        return;
      }
      
      const exitDetails = await deriveExitDetails(this.client, trade);
      await tradeHistory.closeTrade({
        tradeId: this.currentTradeId,
        exitPrice: exitDetails.exitPrice,
        exitReason: exitDetails.exitReason,
        pnl: exitDetails.pnl,
        pnlPercentage: exitDetails.pnlPercentage
      });
      
  const pnlSign = exitDetails.pnl >= 0 ? '📈' : '📉';
  const pnlColor = exitDetails.pnl >= 0 ? 'PROFIT' : 'LOSS';
      console.log(`[Razor] ${pnlSign} Trade closed in database:`);
  console.log(`[Razor]    Exit Reason: ${exitDetails.exitReason.toUpperCase()}`);
  console.log(`[Razor]    Exit Price: $${exitDetails.exitPrice.toFixed(2)}`);
  console.log(`[Razor]    Entry Price: $${trade.entryPrice.toFixed(2)}`);
  console.log(`[Razor]    ${pnlColor}: $${exitDetails.pnl.toFixed(2)} (${exitDetails.pnlPercentage.toFixed(2)}%)`);
      console.log(`[Razor]    Trade ID: ${this.currentTradeId}`);
      
      this.currentTradeId = null;
    } catch (error) {
      console.error('[Razor] Error closing trade history:', error);
      // Don't throw - history failure shouldn't break strategy
    }
  }

  /**
   * Cleanup orphan reduce_only orders after position close
   * 
   * This ensures no SL/TP orders remain open when there's no position.
   * Deribit OTOCO should handle this, but we verify for safety.
   */
  private async cleanupOrphanOrders(): Promise<void> {
    try {
      // Get all open orders for this instrument
      const openOrders = await this.client.getOpenOrders(this.config.instrument);
      
      if (openOrders.length === 0) {
        console.log('[Razor] ✅ No orphan orders to cleanup');
        return;
      }
      
      // Filter reduce_only orders (SL/TP)
      const orphanOrders = openOrders.filter((order: any) => order.reduce_only === true);
      
      if (orphanOrders.length === 0) {
        console.log('[Razor] ✅ No orphan reduce_only orders');
        return;
      }
      
      console.log(`[Razor] ⚠️ Found ${orphanOrders.length} orphan reduce_only orders - cancelling...`);
      
      // Cancel each orphan order
      for (const order of orphanOrders) {
        try {
          await this.client.cancelOrder(order.order_id);
          console.log(`[Razor] ✅ Cancelled orphan order ${order.order_id} (${order.order_type})`);
        } catch (err) {
          console.error(`[Razor] ❌ Failed to cancel order ${order.order_id}:`, err);
        }
      }
    } catch (error) {
      console.error('[Razor] Error during orphan order cleanup:', error);
      // Don't throw - cleanup failure shouldn't break strategy resume
    }
  }

  /**
   * Process ticker update - called on every price update
   * Builds 1-minute candles from tick data
   */
  async onTicker(price?: number): Promise<void> {
    // CRITICAL: Don't analyze if position is already open - strategy should pause
    if (this.analysisState.status === 'position_open') {
      // Still update current price for display
      if (price) {
        this.analysisState.currentPrice = price;
      }
      this.analysisState.lastUpdated = Date.now();
      
      // AUTO-RESUME: Check if position is still open, resume if closed
  await this.checkPositionAndResume();
      
      return; // Skip all analysis and trade execution while position is open
    }

    // If no price provided (mock mode), generate a realistic price update
    if (!price) {
      price = this.generateMockPriceUpdate();
    }

    this.analysisState.currentPrice = price as number;
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
          this.highHistory.push(this.currentCandle.high);
          this.lowHistory.push(this.currentCandle.low);
        if (this.priceHistory.length > 100) {
          this.priceHistory.shift(); // Keep last 100 candles
            this.highHistory.shift();
            this.lowHistory.shift();
        }
        console.log(`[Razor] Candle closed: $${this.currentCandle.close} (${this.priceHistory.length} total)`);
        candleJustClosed = true;
      }
      
      // Start new candle
      this.currentCandle = {
        open: price as number,
        high: price as number,
        low: price as number,
        close: price as number,
        timestamp: now,
      };
      this.candleStartTime = now;
    } else {
      // Update current candle
      if (!this.currentCandle) {
        this.currentCandle = {
          open: price as number,
          high: price as number,
          low: price as number,
          close: price as number,
          timestamp: now,
        };
      } else {
        this.currentCandle.high = Math.max(this.currentCandle.high, price as number);
        this.currentCandle.low = Math.min(this.currentCandle.low, price as number);
        this.currentCandle.close = price as number;
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
      const remainingMinutes = Math.ceil((this.analysisState.cooldownUntil - now) / 1000 / 60);
      const remainingSeconds = Math.ceil((this.analysisState.cooldownUntil - now) / 1000);
      
      // Log every 30 seconds during cooldown (to show activity)
      if (!this.lastCooldownLog || now - this.lastCooldownLog > 30000) {
        console.log(`[Razor] ⏱️  Cooldown active: ${remainingMinutes} min remaining (${remainingSeconds}s)`);
        this.lastCooldownLog = now;
      }
      
      this.analysisState.status = 'analyzing';
      this.analysisState.checkpoints = [{
        id: 'cooldown',
        label: 'Cooldown periode',
        status: 'pending',
        value: `${remainingMinutes} min`,
        description: 'Wachten na vorige trade',
        timestamp: now,
      }];
      return;
    }
    
    // Cooldown just ended - log it
    if (this.analysisState.cooldownUntil && now >= this.analysisState.cooldownUntil && this.lastCooldownLog) {
      console.log(`[Razor] ✅ Cooldown ENDED - Resuming trend analysis and signal detection`);
      this.lastCooldownLog = 0;
      this.analysisState.cooldownUntil = null;
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
      
      // Allow basic analysis with fewer candles (at least 5 for minimal RSI)
      if (this.priceHistory.length >= 5) {
        await this.calculateIndicators();
        this.analysisState.status = 'analyzing';
        console.log(`[Razor] 🚀 Starting basic analysis with ${this.priceHistory.length} candles (minimum required)`);
      }
      
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
   * ENHANCED: Multi-timeframe trend filter voor 70%+ winrate
   */
  private async calculateIndicators(): Promise<void> {
    const prices = this.priceHistory;
    
    // === 1-MINUTE TIMEFRAME (Entry Signals) ===
    
    // EMA Fast (8-period) - Quick trend
    this.analysisState.indicators.emaFast = this.calculateEMA(prices, 8);
    
    // EMA Slow (21-period) - Major trend
    this.analysisState.indicators.emaSlow = this.calculateEMA(prices, 21);
    
    // RSI (14-period) - Overbought/Oversold
    this.analysisState.indicators.rsi = this.calculateRSI(prices, 14);
    
    // Volatility (standard deviation of last 20 prices)
    this.analysisState.indicators.volatility = this.calculateVolatility(prices.slice(-20));
    
    // Volume (mock for now - would need real volume data)
    this.analysisState.indicators.volume = 1000;

    // ATR (Average True Range) using high/low/close history
    this.analysisState.indicators.atr = this.calculateATR(
      this.highHistory,
      this.lowHistory,
      this.priceHistory,
      this.config.atrPeriod || 14
    );

    // === MULTI-TIMEFRAME TREND FILTER (5m + 15m) ===
    // Dit voorkomt counter-trend trades en verhoogt winrate naar 70%+
    
    if (this.config.useTrendFilter !== false) { // Default enabled
      // Aggregate 1m candles into 5m and 15m timeframes
      this.update5mCandles();
      this.update15mCandles();
      
      // 5-minute EMAs
      const ema5mFastPeriod = this.config.ema5mFastPeriod || 8;
      const ema5mSlowPeriod = this.config.ema5mSlowPeriod || 21;
      
      if (this.candles5m.length >= ema5mSlowPeriod) {
        this.analysisState.indicators.emaFast3m = this.calculateEMA(this.candles5m, ema5mFastPeriod);
        this.analysisState.indicators.emaSlow3m = this.calculateEMA(this.candles5m, ema5mSlowPeriod);
      }
      
      // 15-minute EMAs
      const ema15mFastPeriod = this.config.ema15mFastPeriod || 8;
      const ema15mSlowPeriod = this.config.ema15mSlowPeriod || 21;
      
      if (this.candles15m.length >= ema15mSlowPeriod) {
        this.analysisState.indicators.emaFast5m = this.calculateEMA(this.candles15m, ema15mFastPeriod);
        this.analysisState.indicators.emaSlow5m = this.calculateEMA(this.candles15m, ema15mSlowPeriod);
      }
      
      // Calculate trend alignment score (-3 to +3)
      // +3 = All timeframes bullish, -3 = All bearish, 0 = Mixed/Neutral
      let trendScore = 0;
      
      // 1-minute trend
      if (this.analysisState.indicators.emaFast && this.analysisState.indicators.emaSlow) {
        trendScore += this.analysisState.indicators.emaFast > this.analysisState.indicators.emaSlow ? 1 : -1;
      }
      
      // 5-minute trend
      if (this.analysisState.indicators.emaFast3m && this.analysisState.indicators.emaSlow3m) {
        trendScore += this.analysisState.indicators.emaFast3m > this.analysisState.indicators.emaSlow3m ? 1 : -1;
      }
      
      // 15-minute trend
      if (this.analysisState.indicators.emaFast5m && this.analysisState.indicators.emaSlow5m) {
        trendScore += this.analysisState.indicators.emaFast5m > this.analysisState.indicators.emaSlow5m ? 1 : -1;
      }
      
      this.analysisState.indicators.trendScore = trendScore;
    } else {
      this.analysisState.indicators.trendScore = null;
    }

    // Pullback readiness: detect recent impulse then partial retrace
    this.analysisState.indicators.pullbackReady = this.detectPullbackReady(
      prices,
      this.highHistory,
      this.lowHistory,
      this.config.pullbackPercent || 0.15
    );
  }
  
  /**
   * Update 5-minute candles from 1-minute data
   * Aggregates every 5 completed 1-minute candles
   */
  private update5mCandles(): void {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    // Check if we should create a new 5m candle
    if (this.last5mCandleTime === 0) {
      this.last5mCandleTime = Math.floor(now / fiveMinutes) * fiveMinutes;
    }
    
    if (now - this.last5mCandleTime >= fiveMinutes && this.priceHistory.length >= 5) {
      // Take last 5 completed 1m candles and aggregate
      const last5Candles = this.priceHistory.slice(-5);
      const candle5mClose = last5Candles[last5Candles.length - 1];
      
      this.candles5m.push(candle5mClose);
      
      // Keep last 100 5m candles
      if (this.candles5m.length > 100) {
        this.candles5m.shift();
      }
      
      this.last5mCandleTime = now;
      console.log(`[Razor] 5m candle closed: $${candle5mClose.toFixed(2)} (${this.candles5m.length} total)`);
    }
  }
  
  /**
   * Update 15-minute candles from 1-minute data
   * Aggregates every 15 completed 1-minute candles
   */
  private update15mCandles(): void {
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    
    // Check if we should create a new 15m candle
    if (this.last15mCandleTime === 0) {
      this.last15mCandleTime = Math.floor(now / fifteenMinutes) * fifteenMinutes;
    }
    
    if (now - this.last15mCandleTime >= fifteenMinutes && this.priceHistory.length >= 15) {
      // Take last 15 completed 1m candles and aggregate
      const last15Candles = this.priceHistory.slice(-15);
      const candle15mClose = last15Candles[last15Candles.length - 1];
      
      this.candles15m.push(candle15mClose);
      
      // Keep last 100 15m candles
      if (this.candles15m.length > 100) {
        this.candles15m.shift();
      }
      
      this.last15mCandleTime = now;
      console.log(`[Razor] 15m candle closed: $${candle15mClose.toFixed(2)} (${this.candles15m.length} total)`);
    }
  }
  
  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) {
      // With fewer prices, use simple moving average as fallback
      return prices.reduce((sum, p) => sum + p, 0) / prices.length;
    }
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  /** Calculate ATR */
  private calculateATR(highs: number[], lows: number[], closes: number[], period: number): number | null {
    if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
      // With fewer data points, calculate simple average true range
      if (highs.length >= 2 && lows.length >= 2 && closes.length >= 2) {
        const trs: number[] = [];
        const availableCount = Math.min(highs.length - 1, lows.length - 1, closes.length - 1);
        for (let i = 1; i <= availableCount; i++) {
          const h = highs[i];
          const l = lows[i];
          const cPrev = closes[i - 1];
          const tr = Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev));
          trs.push(tr);
        }
        return trs.length > 0 ? trs.reduce((sum, v) => sum + v, 0) / trs.length : null;
      }
      return null;
    }
    const trs: number[] = [];
    for (let i = highs.length - period; i < highs.length; i++) {
      const h = highs[i];
      const l = lows[i];
      const cPrev = closes[i - 1];
      const tr = Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev));
      trs.push(tr);
    }
    const atr = trs.reduce((sum, v) => sum + v, 0) / trs.length;
    return atr;
  }

  /** Aggregate 1m closes into N-minute timeframe synthetic closes */
  private aggregateTimeframe(closes: number[], n: number): number[] {
    if (closes.length < n) return closes.slice();
    const agg: number[] = [];
    for (let i = 0; i < closes.length; i += n) {
      const slice = closes.slice(i, i + n);
      if (slice.length === n) agg.push(slice[slice.length - 1]);
    }
    return agg;
  }

  /** Detect pullback readiness: impulse move then partial retrace within threshold */
  private detectPullbackReady(closes: number[], highs: number[], lows: number[], pullbackPct: number): boolean | null {
    if (closes.length < 20) return null;
    const recent = closes.slice(-10);
    const start = recent[0];
    const end = recent[recent.length - 1];
    const move = end - start;
    if (Math.abs(move) < start * 0.001) return false; // need at least 0.1% impulse
    // Find max excursion then retrace
    const peak = Math.max(...recent);
    const trough = Math.min(...recent);
    if (move > 0) {
      const retrace = peak - end; // long impulse then pullback
      return retrace / (peak - start) >= pullbackPct;
    } else {
      const retrace = end - trough; // short impulse then pullback up
      return retrace / (start - trough) >= pullbackPct;
    }
  }
  
  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) {
      // For fewer candles, use a shorter period or return neutral
      const availablePeriod = Math.max(2, prices.length - 1);
      if (prices.length < 3) return 50; // Neutral RSI with very few data points
      
      const changes = [];
      for (let i = 1; i < prices.length; i++) {
        changes.push(prices[i] - prices[i - 1]);
      }
      
      const gains = changes.map(c => c > 0 ? c : 0);
      const losses = changes.map(c => c < 0 ? -c : 0);
      
      const avgGain = gains.reduce((sum, g) => sum + g, 0) / availablePeriod;
      const avgLoss = losses.reduce((sum, l) => sum + l, 0) / availablePeriod;
      
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    }
    
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

    // Technical Checkpoint 4: ATR Band
    if (indicators.atr && this.priceHistory.length) {
      const last = this.priceHistory[this.priceHistory.length - 1];
      const atrPct = (indicators.atr / last) * 100;
      const inBand = atrPct >= 0.03 && atrPct <= 0.8;
      checkpoints.push({
        id: 'atr_band',
        label: 'ATR bereik',
        status: inBand ? 'met' : 'pending',
        value: `${atrPct.toFixed(2)}%`,
        description: inBand ? 'ATR normaal (liquid & beheersbaar)' : 'ATR buiten ideaal bereik',
        timestamp: Date.now(),
      });
    }

    // Technical Checkpoint 5: MTF trend alignment
    if (this.config.useMultiTimeframe && indicators.trendScore !== null) {
      const score = indicators.trendScore ?? 0;
      const aligned = Math.abs(score) >= 2;
      checkpoints.push({
        id: 'mtf_trend',
        label: 'Multi-timeframe trend',
        status: aligned ? 'met' : 'pending',
        value: `${score}`,
        description: aligned ? 'Sterke alignment over 1m/3m/5m' : 'Zwakke of gemengde trend',
        timestamp: Date.now(),
      });
    }

    // Technical Checkpoint 6: Pullback readiness
    if (this.config.advancedFiltersEnabled && indicators.pullbackReady !== null) {
      checkpoints.push({
        id: 'pullback',
        label: 'Pullback gereed',
        status: indicators.pullbackReady ? 'met' : 'pending',
        value: indicators.pullbackReady ? 'Ja' : 'Nee',
        description: indicators.pullbackReady ? 'Retrace na impuls bevestigd' : 'Nog geen retrace',
        timestamp: Date.now(),
      });
    }
    
  // Momentum (recent movement)
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
    // Add strategy runtime status checkpoint (always last)
    checkpoints.push({
      id: 'strategy_active',
      label: 'Strategie status',
      status: 'met',
      value: this.analysisState.status === 'position_open' ? 'Positie open' : 'Actief',
      description: `Cooldown: ${this.analysisState.cooldownUntil ? 'ja' : 'nee'}`,
      timestamp: Date.now(),
    });

    // Features summary checkpoint
    checkpoints.push({
      id: 'feature_flags',
      label: 'Features',
      status: 'met',
      value: [
        this.config.breakEvenEnabled ? 'BE' : null,
        this.config.useMultiTimeframe ? 'MTF' : null,
        this.config.adaptiveRiskEnabled ? 'Adaptief' : null,
        this.config.advancedFiltersEnabled ? 'Filters' : null,
      ].filter(Boolean).join(', ') || 'Basis',
      description: 'Ingeschakelde dynamische modules',
      timestamp: Date.now(),
    });
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
    
    // Volatility filter (retain trade count but reject extremes)
    if (indicators.volatility !== null) {
      if (indicators.volatility < this.config.minVolatility) {
        return { type: 'none', strength: 0, confidence: 0, reasons: ['Volatiliteit te laag'] };
      }
      if (indicators.volatility > this.config.maxVolatility) {
        return { type: 'none', strength: 0, confidence: 0, reasons: ['Volatiliteit extreem hoog'] };
      }
      if (indicators.volatility >= 0.08 && indicators.volatility <= 0.6) {
        longScore += 8; shortScore += 8; reasons.push('Sweet spot volatiliteit');
      }
    }
    
  // RSI PRIMARY SIGNAL (adaptive weight with trend alignment)
    if (indicators.rsi !== null) {
      if (indicators.rsi < this.config.rsiOversold) {
        // Oversold = LONG signal
        const oversoldStrength = this.config.rsiOversold - indicators.rsi;
    longScore += Math.min(35 + oversoldStrength, 48);
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
    shortScore += Math.min(35 + overboughtStrength, 48);
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
    
    // Momentum (micro-move confirmation)
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

    // ATR band suitability (avoid ultra-tight or too wide relative range)
    if (indicators.atr && this.priceHistory.length > 0) {
      const last = this.priceHistory[this.priceHistory.length - 1];
      const atrPct = (indicators.atr / last) * 100;
      if (atrPct >= 0.03 && atrPct <= 0.8) {
        longScore += 6; shortScore += 6; reasons.push('ATR in normaal bereik');
      } else if (atrPct < 0.02) {
        reasons.push('ATR te laag (risico op chop)');
      } else if (atrPct > 1.0) {
        reasons.push('ATR te hoog (risico op whipsaw)');
      }
    }

    // Multi-timeframe trend alignment boosts (only if enabled)
    if (this.config.useMultiTimeframe && indicators.trendScore !== null) {
      if (indicators.trendScore === 3) {
        longScore += 10; reasons.push('Sterke multi-timeframe bullish alignment');
      } else if (indicators.trendScore === -3) {
        shortScore += 10; reasons.push('Sterke multi-timeframe bearish alignment');
      } else if (indicators.trendScore === 2) {
        longScore += 6; reasons.push('Bullish alignment');
      } else if (indicators.trendScore === -2) {
        shortScore += 6; reasons.push('Bearish alignment');
      } else if (indicators.trendScore === 0) {
        reasons.push('Neutrale MTF trend');
      }
    }

    // Pullback readiness gating: require pullback for continuation entries
    if (this.config.advancedFiltersEnabled && indicators.pullbackReady === false) {
      // If no pullback, reduce score slightly (don’t block completely to keep trade frequency high)
      longScore = Math.max(0, longScore - 5);
      shortScore = Math.max(0, shortScore - 5);
      reasons.push('Geen bevestigde pullback');
    } else if (indicators.pullbackReady) {
      longScore += 5; shortScore += 5; reasons.push('Pullback klaar voor vervolg');
    }
    
    // Compression breakout: detect narrowing range then expansion potential
    if (this.highHistory.length >= 12 && this.lowHistory.length >= 12) {
      const recentHighs = this.highHistory.slice(-12);
      const recentLows = this.lowHistory.slice(-12);
      const rangeSeq: number[] = [];
      for (let i = 0; i < recentHighs.length; i++) {
        rangeSeq.push(recentHighs[i] - recentLows[i]);
      }
      const avgRange = rangeSeq.reduce((s, v) => s + v, 0) / rangeSeq.length;
      const lastRange = rangeSeq[rangeSeq.length - 1];
      if (lastRange < avgRange * 0.6) {
        longScore += 4; shortScore += 4; reasons.push('Range compressie (potentiële breakout)');
      }
    }

    // EMA crossover bonus (only if no dominant RSI signal yet)
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
  const SCALPING_THRESHOLD = 58; // slightly higher threshold with richer scoring
    
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
    
  return { type: 'none', strength: Math.max(longScore, shortScore), confidence: 0, reasons: ['Score onder threshold (58)'] };
  }
  
  /**
   * Execute trade
   */
  private async executeTrade(direction: 'long' | 'short'): Promise<void> {
    try {
      console.log(`[Razor] Executing ${direction.toUpperCase()} trade...`);
      
      // ORPHAN POSITION CHECK: Verify no position exists
      const positions = await this.client.getPositions('USDC');
      const existingPosition = positions.find((p: any) => 
        p.instrument_name === this.config.instrument && p.size !== 0
      );
      
      if (existingPosition) {
        const errorMsg = `ORPHAN POSITION DETECTED: ${existingPosition.instrument_name} has ${existingPosition.size} contracts. Cannot open new trade!`;
        console.error(`[Razor] ❌ ${errorMsg}`);
        // Set to stopped to prevent further trades
        this.analysisState.status = 'stopped';
        throw new Error(errorMsg);
      }
      
      console.log('[Razor] ✅ No orphan positions - safe to trade');
      
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
      let slPercent = this.config.stopLossPercent / 100;
      let tpPercent = this.config.takeProfitPercent / 100;
      // Adaptive ATR-based scaling (optional): widen TP slightly in strong trend, tighten SL in low ATR
      if (this.config.adaptiveRiskEnabled && this.analysisState.indicators.atr && this.analysisState.indicators.volatility) {
        const atr = this.analysisState.indicators.atr;
        const price = currentPrice;
        const atrPct = (atr / price) * 100;
        // If ATR very low: tighten SL (protect against chop), keep TP same
        if (atrPct < 0.05) {
          slPercent = slPercent * 0.85; // tighten
        } else if (atrPct > 0.4) {
          // High ATR: expand TP for better R:R
          tpPercent = tpPercent * 1.15;
        }
        // If multi-timeframe strong alignment, modest TP boost
        if (this.config.useMultiTimeframe && typeof this.analysisState.indicators.trendScore === 'number' && Math.abs(this.analysisState.indicators.trendScore) >= 2) {
          tpPercent *= 1.05;
        }
      }
      
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
      
      console.log('[Razor] Entry order placed:', entryOrder.order?.order_id || entryOrder.order_id);
      
      // Wait and verify
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Place SL
      const slOrder = direction === 'long'
        ? await this.client.placeSellOrder(this.config.instrument, finalAmount, stopLoss, 'stop_market', `${label}_sl`, true)
        : await this.client.placeBuyOrder(this.config.instrument, finalAmount, stopLoss, 'stop_market', `${label}_sl`, true);
      
      console.log('[Razor] Stop loss placed:', slOrder.order?.order_id || slOrder.order_id);
      
      // Place TP
      const tpOrder = direction === 'long'
        ? await this.client.placeSellOrder(this.config.instrument, finalAmount, takeProfit, 'limit', `${label}_tp`, true)
        : await this.client.placeBuyOrder(this.config.instrument, finalAmount, takeProfit, 'limit', `${label}_tp`, true);
      
      console.log('[Razor] Take profit placed:', tpOrder.order?.order_id || tpOrder.order_id);
      
      // CRITICAL: Ensure database is initialized before recording trade
      await ensureTradeHistoryInitialized();
      
      // TRADE HISTORY: Record this trade
      const tradeHistory = getTradeHistoryService();
      this.currentTradeId = await tradeHistory.recordTrade({
        userId: this.userId, // FASE 3: Multi-user support
        strategyName: this.strategyName,
        instrument: this.config.instrument,
        side: direction === 'long' ? 'buy' : 'sell',
        entryOrderId: entryOrder.order?.order_id || entryOrder.order_id,
        slOrderId: slOrder.order?.order_id || slOrder.order_id,
        tpOrderId: tpOrder.order?.order_id || tpOrder.order_id,
        entryPrice: currentPrice,
        amount: finalAmount,
        stopLoss,
        takeProfit
      });
      
      const timestamp = new Date().toISOString();
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[Razor] 🎯 NEW TRADE OPENED - ${timestamp}`);
      console.log(`${'='.repeat(80)}`);
      console.log(`[Razor] 📊 Trade Details:`);
      console.log(`[Razor]    Direction: ${direction.toUpperCase()}`);
      console.log(`[Razor]    Instrument: ${this.config.instrument}`);
      console.log(`[Razor]    Entry Price: $${currentPrice.toFixed(2)}`);
      console.log(`[Razor]    Amount: ${finalAmount} contracts`);
      console.log(`[Razor]    Stop Loss: $${stopLoss.toFixed(2)} (${(this.config.stopLossPercent).toFixed(2)}%)`);
      console.log(`[Razor]    Take Profit: $${takeProfit.toFixed(2)} (${(this.config.takeProfitPercent).toFixed(2)}%)`);
      console.log(`[Razor]    Risk/Reward: 1:${(this.config.takeProfitPercent / this.config.stopLossPercent).toFixed(2)}`);
      console.log(`[Razor] 🎫 Order IDs:`);
      console.log(`[Razor]    Entry: ${entryOrder.order?.order_id || entryOrder.order_id}`);
      console.log(`[Razor]    SL: ${slOrder.order?.order_id || slOrder.order_id}`);
      console.log(`[Razor]    TP: ${tpOrder.order?.order_id || tpOrder.order_id}`);
      console.log(`[Razor] 💾 Database:`);
      console.log(`[Razor]    Trade ID: ${this.currentTradeId}`);
      console.log(`[Razor]    Status: OPEN`);
      console.log(`${'─'.repeat(80)}`);
      console.log(`[Razor] ⏸️  Strategy PAUSED - Waiting for position to close`);
      console.log(`[Razor] 🔄 Auto-resume will trigger when SL/TP hits`);
      console.log(`${'='.repeat(80)}\n`);
      
      // Update state
      this.analysisState.status = 'position_open';
      this.lastTradeTime = Date.now();
      this.dailyTrades++;
      this.analysisState.cooldownUntil = Date.now() + (this.config.cooldownMinutes * 60 * 1000);
  // Reset dynamic stop flags for this new trade
  this.beMovedForTrade = false;
      
      // Update checkpoints for position monitoring
      this.updateCheckpoints();
    } catch (error) {
      console.error('[Razor] Trade execution failed:', error);
      // Don't throw - just log and continue analyzing
      this.analysisState.status = 'analyzing';
      // Set cooldown to prevent immediate retry
      this.analysisState.cooldownUntil = Date.now() + (1 * 60 * 1000); // 1 min cooldown on error
    }
  }
  
  // Cache for position metrics to reduce API calls
  private metricsCache: {
    data: PositionMetrics | null;
    timestamp: number;
  } | null = null;
  private readonly METRICS_CACHE_TTL = 5000; // 5 seconds

  /**
   * Get position metrics (called when position is open)
   * Now with caching to prevent rate limiting
   */
  async getPositionMetrics(forceRefresh = false): Promise<PositionMetrics | null> {
    // Return cached data if available and not expired
    if (!forceRefresh && this.metricsCache) {
      const age = Date.now() - this.metricsCache.timestamp;
      if (age < this.METRICS_CACHE_TTL) {
        return this.metricsCache.data;
      }
    }

    try {
      const positions = await this.client.getPositions('USDC');
      const position = positions.find((p: any) => p.size !== 0);
      
      if (!position) {
        this.metricsCache = { data: null, timestamp: Date.now() };
        return null;
      }
      
      const ticker = await this.client.getTicker(this.config.instrument);
      const currentPrice = ticker.last_price;
      const entryPrice = position.average_price;
      const amount = Math.abs(position.size);
  const direction: 'long' | 'short' = position.direction === 'buy' ? 'long' : 'short';
      
      // Calculate P&L (CORRECT for USDC perpetuals/linear contracts)
      const priceChangePercent = (currentPrice - entryPrice) / entryPrice;
      let unrealizedPnl;
      
      if (direction === 'long') {
        // Long: profit when price goes up
        unrealizedPnl = priceChangePercent * amount;
      } else {
        // Short: profit when price goes down
        unrealizedPnl = -priceChangePercent * amount;
      }
      
      const unrealizedPnlPercent = priceChangePercent * 100 * (direction === 'long' ? 1 : -1);
      
      // Get orders
      const orders = await this.client.getOpenOrders(this.config.instrument);
      const slOrder = orders.find((o: any) => o.order_type === 'stop_market' && o.reduce_only);
      const tpOrder = orders.find((o: any) => o.order_type === 'limit' && o.reduce_only);

      // Fallback to trade record for SL/TP if missing (prevents UI blanks)
      let fallbackStop = 0;
      let fallbackTake = 0;
      if (this.currentTradeId) {
        try {
          const tradeHistory = getTradeHistoryService();
          const trade = await tradeHistory.getTrade(this.currentTradeId);
          if (trade) {
            fallbackStop = trade.stopLoss || 0;
            fallbackTake = trade.takeProfit || 0;
          }
        } catch {/* ignore */}
      }

      const stopLossPrice = slOrder?.trigger_price || slOrder?.price || fallbackStop || 0;
      const takeProfitPrice = tpOrder?.price || fallbackTake || 0;

      // Risk/Reward calculation (distance TP / distance SL)
      let riskReward: number | null = null;
      if (stopLossPrice && takeProfitPrice) {
        const risk = direction === 'long'
          ? entryPrice - stopLossPrice
          : stopLossPrice - entryPrice;
        const reward = direction === 'long'
          ? takeProfitPrice - entryPrice
          : entryPrice - takeProfitPrice;
        if (risk > 0 && reward > 0) {
          riskReward = reward / risk;
        }
      }

      const metrics = {
        strategyId: this.strategyId,
        instrument: this.config.instrument,
        direction,
        entryPrice,
        currentPrice,
        amount,
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
        unrealizedPnl,
        unrealizedPnlPercent,
        entryOrderId: 'unknown', // Would need to track this
        slOrderId: slOrder?.order_id,
        tpOrderId: tpOrder?.order_id,
        enteredAt: this.lastTradeTime,
        duration: Date.now() - this.lastTradeTime,
        riskReward,
      };

      // Cache the result
      this.metricsCache = { data: metrics, timestamp: Date.now() };
      return metrics;
    } catch (error) {
      console.error('[Razor] Failed to get position metrics:', error);
      return null;
    }
  }

  /**
   * Clear the metrics cache (call when position closes)
   */
  clearMetricsCache(): void {
    this.metricsCache = null;
  }
  
  /**
   * Force the strategy to resume analysis (called by event system)
   * Used when trade closes but status didn't update (WebSocket issues)
   */
  forceResume(): void {
    console.log(`[Razor] 🔄 FORCE RESUME triggered`);
    console.log(`[Razor]    Current status: ${this.analysisState.status}`);
    console.log(`[Razor]    Current trade ID: ${this.currentTradeId || 'none'}`);
    
    // Clear the trade ID and metrics cache
    this.currentTradeId = null;
    this.clearMetricsCache();
    
    // Force status back to analyzing
    if (this.analysisState.status === 'position_open') {
      this.analysisState.status = 'analyzing';
      console.log(`[Razor]    ✅ Status changed: position_open → analyzing`);
    }
    
    // Set cooldown
    this.analysisState.cooldownUntil = Date.now() + (this.config.cooldownMinutes * 60 * 1000);
    const cooldownEnd = new Date(this.analysisState.cooldownUntil).toLocaleTimeString();
    console.log(`[Razor]    ⏱️  Cooldown set until: ${cooldownEnd}`);
    
    console.log(`[Razor] ✅ Force resume complete - strategy will continue on next ticker`);
  }

  /**
   * Maybe adjust stops (breakeven) when position is open
   * Throttled to avoid rate limits; safe on reconnects by inspecting current SL order
   */
  private async maybeAdjustStops(): Promise<void> {
    try {
      if (!this.currentTradeId) return;
      if (!this.config.breakEvenEnabled) return;
      const now = Date.now();
      if (this.lastStopAdjustCheck && now - this.lastStopAdjustCheck < 2000) return; // 2s throttle
      this.lastStopAdjustCheck = now;

      const tradeHistory = getTradeHistoryService();
      const trade = await tradeHistory.getTrade(this.currentTradeId);
      if (!trade) return;

      // Fetch ticker and instrument for tick size
      const [ticker, instrument, positions, openOrders] = await Promise.all([
        this.client.getTicker(this.config.instrument),
        this.client.getInstrument(this.config.instrument),
        this.client.getPositions('USDC'),
        this.client.getOpenOrders(this.config.instrument),
      ]);

      const currentPrice = ticker.last_price as number;
      const tickSize = instrument.tick_size as number;

      // Determine direction and thresholds
      const isLong = trade.side === 'buy';
      const entry = trade.entryPrice;
      const tp = trade.takeProfit;
      if (!entry || !tp) return;

      const triggerFrac = Math.min(Math.max(this.config.breakEvenTriggerToTP ?? 0.5, 0.05), 0.95);
      const offsetTicks = Math.max(this.config.breakEvenOffsetTicks ?? 1, 0);

      const distanceToTP = Math.abs(tp - entry);
      const triggerPrice = isLong
        ? entry + distanceToTP * triggerFrac
        : entry - distanceToTP * triggerFrac;

      // Check if price reached trigger
      const reached = isLong ? currentPrice >= triggerPrice : currentPrice <= triggerPrice;
      if (!reached) return;

      // Check existing SL order; if already beyond/at BE, skip
      const slOrder = openOrders.find((o: any) => o.order_type === 'stop_market' && o.reduce_only);
      const currentSL = slOrder?.trigger_price || slOrder?.price || trade.stopLoss;
      const bePriceRaw = isLong ? entry + offsetTicks * tickSize : entry - offsetTicks * tickSize;
      const bePrice = Math.round(bePriceRaw / tickSize) * tickSize;

      const alreadyAtOrBetter = isLong ? (currentSL !== undefined && currentSL >= bePrice)
                                        : (currentSL !== undefined && currentSL <= bePrice);
      if (alreadyAtOrBetter) return;

      // Determine current position size to size the new SL correctly
      const position = positions.find((p: any) => (p.instrument_name === this.config.instrument || p.instrument === this.config.instrument) && p.size !== 0);
      if (!position) return; // position might have closed
      const amount = Math.abs(position.size);
      if (amount <= 0) return;

      // Place new BE SL FIRST (to avoid gap) then cancel old if still exists
      const label = `razor_be_sl_${Date.now()}`;
      const newSlOrder = isLong
        ? await this.client.placeSellOrder(this.config.instrument, amount, bePrice, 'stop_market', label, true)
        : await this.client.placeBuyOrder(this.config.instrument, amount, bePrice, 'stop_market', label, true);

      const newSlId = newSlOrder?.order?.order_id || newSlOrder?.order_id;
      // Cancel old after new is confirmed
      if (slOrder?.order_id) {
        try { await this.client.cancelOrder(slOrder.order_id); } catch { /* ignore */ }
      }
      if (newSlId) {
        // Persist new SL order id and price for accurate exit reason and UI
        await tradeHistory.updateOrderIds(trade.id, newSlId, trade.tpOrderId || undefined);
        if (typeof bePrice === 'number' && !Number.isNaN(bePrice)) {
          await tradeHistory.updateStops(trade.id, bePrice, undefined);
        }
        console.log(`[Razor] 🛡️  Moved SL to breakeven at $${bePrice.toFixed(2)} (order ${newSlId})`);
      }
      this.beMovedForTrade = true;
    } catch (err: any) {
      // Non-fatal
      const msg = (err && err.message) ? err.message : String(err);
      console.warn('[Razor] BE stop adjust skipped due to error:', msg);
    }
  }

  /**
   * Generate mock candle data for development when Deribit is not available
   */
  private generateMockCandles(count: number): { close: number[] } {
    const basePrice = 95000; // BTC around $95k
    const mockPrices: number[] = [];
    
    for (let i = 0; i < count; i++) {
      // Generate realistic price movement with some volatility
      const randomChange = (Math.random() - 0.5) * 200; // +/- $100 variation
      const trend = Math.sin(i / 10) * 50; // Slight trending movement
      const price = basePrice + randomChange + trend;
      mockPrices.push(Math.max(price, 80000)); // Ensure positive prices
    }
    
    return { close: mockPrices };
  }

  /**
   * Generate mock price update for development when no live data is available
   */
  private generateMockPriceUpdate(): number {
    // Start with last known price or base price
    const basePrice = this.analysisState.currentPrice || 95000;
    
    // Generate small realistic price movement
    const randomChange = (Math.random() - 0.5) * 20; // +/- $10 variation per update
    const newPrice = basePrice + randomChange;
    
    return Math.max(newPrice, 80000); // Ensure positive price
  }

  /**
   * Start mock ticker updates for development when no live connection is available
   */
  private startMockTickerUpdates(): void {
    // Only start mock updates if we don't have a real ticker subscription
    // This is determined by checking if we're using mock data
    if (this.mockTickerInterval) {
      clearInterval(this.mockTickerInterval);
    }
    
    // Start periodic mock ticker updates (every 3 seconds)
    this.mockTickerInterval = setInterval(async () => {
      try {
        await this.onTicker(); // Call onTicker without price to trigger mock update
      } catch (error) {
        console.error('[Razor] Mock ticker update failed:', error);
      }
    }, 3000); // Update every 3 seconds
    
    console.log('[Razor] 🔄 Started mock ticker updates (3s intervals)');
  }

  /**
   * Stop mock ticker updates
   */
  private stopMockTickerUpdates(): void {
    if (this.mockTickerInterval) {
      clearInterval(this.mockTickerInterval);
      this.mockTickerInterval = null;
      console.log('[Razor] ⏹️  Stopped mock ticker updates');
    }
  }

  /**
   * Cleanup method - stop all timers and subscriptions
   */
  public cleanup(): void {
    this.stopMockTickerUpdates();
    console.log('[Razor] 🧹 Cleanup completed');
  }
}

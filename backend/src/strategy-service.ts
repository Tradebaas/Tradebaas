/**
 * Backend Strategy Service
 * Manages strategy execution independently from frontend
 * Handles connection, strategy lifecycle, and auto-resume
 */

import { BackendDeribitClient, type DeribitEnvironment } from './deribit-client';
import { stateManager, type StrategyState } from './state-manager';
import { credentialsManager } from './credentials-manager';
import { RazorExecutor, type RazorConfig } from './strategies/razor-executor';
import { updateStrategiesHealth } from './health';
import type { AnalysisState, PositionMetrics } from './types/analysis';

export interface StartStrategyRequest {
  strategyName: string;
  instrument: string;
  config: Record<string, any>;
  environment: DeribitEnvironment;
  disclaimerAccepted: boolean;
}

export interface StopStrategyRequest {
  strategyId: string;
}

export class StrategyService {
  private client: BackendDeribitClient | null = null;
  private runningStrategies = new Map<string, NodeJS.Timeout>();
  private strategyExecutors = new Map<string, RazorExecutor>();
  private environment: DeribitEnvironment = 'testnet';

  constructor() {}

  /**
   * Initialize service - load state only (NO auto-resume)
   * CRITICAL: User MUST manually connect via frontend
   */
  async initialize(): Promise<void> {
    console.log('[StrategyService] Initializing...');
    
    await stateManager.initialize();

    // Check if there was a previous manual connection that should be restored
    const connection = stateManager.getConnection();
    if (connection) {
      if (connection.connected && connection.connectedAt && !connection.manuallyDisconnected) {
        console.log('[StrategyService] Found active manual connection - attempting auto-resume...');
        console.log('[StrategyService] Previous connection:', { 
          broker: connection.broker, 
          environment: connection.environment,
          connectedAt: new Date(connection.connectedAt).toISOString()
        });
        
        try {
          // Auto-resume the previous manual connection
          await this.connect(connection.environment);
          console.log('[StrategyService] ✅ Successfully restored manual connection');
        } catch (error) {
          console.error('[StrategyService] ❌ Failed to restore connection:', error);
          // Clear the failed state
          await stateManager.setConnection({
            broker: connection.broker,
            environment: connection.environment,
            connected: false,
            connectedAt: undefined,
            manuallyDisconnected: false
          });
          console.log('[StrategyService] Connection state cleared after restore failure');
        }
      } else if (connection.manuallyDisconnected) {
        console.log('[StrategyService] Previous manual disconnect detected - no auto-reconnect');
      } else {
        console.log('[StrategyService] No previous active connection found');
      }
    }

    // Final initialization message
    if (this.client && this.client.isConnected()) {
      console.log('[StrategyService] Initialization complete - connection restored');
    } else {
      console.log('[StrategyService] Initialization complete - awaiting manual connection');
    }
  }

  /**
   * Connect to Deribit
   */
  async connect(environment: DeribitEnvironment): Promise<void> {
    if (this.client && this.client.isConnected()) {
      console.log('[StrategyService] Already connected');
      return;
    }

    // Load credentials from KV storage first (saved by frontend), fallback to .env
    let apiKey: string;
    let apiSecret: string;
    
    try {
      const kvCreds = await credentialsManager.getCredentials('deribit');
      if (kvCreds.success && kvCreds.credentials) {
        apiKey = kvCreds.credentials.api_key;
        apiSecret = kvCreds.credentials.api_secret;
        console.log('[StrategyService] Using credentials from KV storage');
      } else {
        throw new Error('No KV credentials, trying .env...');
      }
    } catch (kvError) {
      // Fallback to .env credentials
      console.log('[StrategyService] KV credentials failed, using .env fallback');
      const envKey = process.env.DERIBIT_API_KEY;
      const envSecret = process.env.DERIBIT_API_SECRET;
      
      if (!envKey || !envSecret) {
        throw new Error('No Deribit credentials found in KV storage or .env');
      }
      
      apiKey = envKey;
      apiSecret = envSecret;
    }

    if (!apiKey || !apiSecret) {
      throw new Error('Invalid Deribit credentials');
    }

    this.environment = environment;
    this.client = new BackendDeribitClient(environment);
    
    console.log(`[StrategyService] Connecting to Deribit ${environment}...`);
    await this.client.connect({
      apiKey,
      apiSecret,
    });

    // Verify connection is actually working
    if (!this.client.isConnected()) {
      throw new Error('Failed to establish WebSocket connection to Deribit');
    }

    console.log('[StrategyService] WebSocket connection verified');

    // Save connection state - clear manual disconnect flag
    await stateManager.setConnection({
      broker: 'deribit',
      environment,
      connected: true,
      connectedAt: Date.now(),
      manuallyDisconnected: false, // Clear manual disconnect flag
    });

    console.log(`[StrategyService] Connected to Deribit ${environment}`);
  }

  /**
   * Disconnect from Deribit and stop all strategies
   */
  async disconnect(): Promise<void> {
    console.log('[StrategyService] Disconnecting...');

    // Stop all running strategies
    for (const strategyId of this.runningStrategies.keys()) {
      await this.stopStrategy({ strategyId });
    }

    // Disconnect client
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    // Update state - mark as manually disconnected to prevent auto-reconnect
    await stateManager.setConnection({
      broker: 'deribit',
      environment: this.environment,
      connected: false,
      connectedAt: undefined, // Clear the timestamp
      manuallyDisconnected: true, // Prevent auto-reconnect on server restart
    });

    console.log('[StrategyService] Disconnected');
  }

  /**
   * Start a new strategy
   */
  async startStrategy(request: StartStrategyRequest): Promise<{ success: boolean; strategyId: string; message: string }> {
    console.log('[StrategyService] Start strategy request:', request.strategyName);

    // CRITICAL: Enforce max 1 concurrent strategy
    const activeStrategies = stateManager.getActiveStrategies();
    if (activeStrategies.length > 0) {
      return {
        success: false,
        strategyId: '',
        message: `Cannot start: strategy "${activeStrategies[0].name}" is already running. Stop it first.`,
      };
    }

    // Validate disclaimer
    if (!request.disclaimerAccepted && request.environment === 'live') {
      return {
        success: false,
        strategyId: '',
        message: 'Disclaimer must be accepted for live trading',
      };
    }

    // Save disclaimer acceptance
    if (request.disclaimerAccepted) {
      await stateManager.acceptDisclaimer();
    }

    // Connect if not connected
    if (!this.client || !this.client.isConnected()) {
      await this.connect(request.environment);
    }

    // Create strategy state
    const strategyId = `strategy-${Date.now()}`;
    const strategy: StrategyState = {
      id: strategyId,
      name: request.strategyName,
      status: 'active',
      startedAt: Date.now(),
      config: {
        ...request.config,
        instrument: request.instrument,
      },
    };

    await stateManager.addStrategy(strategy);
    
    // Update health metrics
    this.updateHealthMetrics();

    // Start strategy execution loop
    await this.runStrategy(strategy);

    return {
      success: true,
      strategyId,
      message: `Strategy ${request.strategyName} started`,
    };
  }

  /**
   * Stop a running strategy
   */
  async stopStrategy(request: StopStrategyRequest): Promise<{ success: boolean; message: string }> {
    console.log('[StrategyService] Stop strategy request:', request.strategyId);

    const timer = this.runningStrategies.get(request.strategyId);
    if (timer) {
      clearInterval(timer);
      this.runningStrategies.delete(request.strategyId);
    }

    await stateManager.updateStrategyStatus(request.strategyId, 'stopped');
    
    // Update health metrics
    this.updateHealthMetrics();

    return {
      success: true,
      message: 'Strategy stopped',
    };
  }

  /**
   * Resume a strategy from saved state
   */
  private async resumeStrategy(strategy: StrategyState): Promise<void> {
    console.log('[StrategyService] Resuming strategy:', strategy.name);
    await this.runStrategy(strategy);
  }

  /**
   * Run strategy execution loop
   */
  private async runStrategy(strategy: StrategyState): Promise<void> {
    console.log(`[StrategyService] Starting execution loop for ${strategy.name}`);

    if (!this.client || !this.client.isConnected()) {
      console.error('[StrategyService] Client not connected');
      await stateManager.updateStrategyStatus(strategy.id, 'error');
      return;
    }

    const instrument = strategy.config.instrument || 'BTC_USDC-PERPETUAL';

    // For Razor strategy: Use full executor with analysis tracking
    if (strategy.name === 'Razor') {
      const config: RazorConfig = {
        instrument,
        tradeSize: strategy.config.tradeSize || 100, // $100 USD
        stopLossPercent: strategy.config.stopLossPercent || 0.5, // 0.5%
        takeProfitPercent: strategy.config.takeProfitPercent || 1.0, // 1.0%
        maxConcurrentTrades: strategy.config.maxConcurrentTrades || 1,
        maxDailyTrades: strategy.config.maxDailyTrades || 150, // HIGH-FREQUENCY: 150 max
        cooldownMinutes: strategy.config.cooldownMinutes || 5, // SCALPING: 5 min cooldown
        minVolatility: strategy.config.minVolatility || 0.01, // SCALPING: 0.01% (was 0.1%)
        maxVolatility: strategy.config.maxVolatility || 5.0, // SCALPING: 5% (was 2.0%)
        rsiOversold: strategy.config.rsiOversold || 40, // SCALPING: 40 (was 30)
        rsiOverbought: strategy.config.rsiOverbought || 60, // SCALPING: 60 (was 70)
      };

      const executor = new RazorExecutor(this.client, strategy.id, strategy.name, config);
      this.strategyExecutors.set(strategy.id, executor);

      console.log(`[Razor] Subscribing to ${instrument} ticker...`);
      console.log(`[Razor] SCALPING CONFIG: Vol ${config.minVolatility}%-${config.maxVolatility}%, RSI ${config.rsiOversold}/${config.rsiOverbought}, Max ${config.maxDailyTrades} trades/day`);
      
      // Subscribe to ticker and pass to executor
      await this.client.subscribeTicker(instrument, async (ticker) => {
        try {
          await executor.onTicker(ticker.last_price);
          
          // Update analysis state in storage
          const analysisState = executor.getAnalysisState();
          await stateManager.updateStrategyAnalysis(strategy.id, analysisState);
          
          // If position is open, update metrics
          if (analysisState.status === 'position_open') {
            const metrics = await executor.getPositionMetrics();
            if (metrics) {
              await stateManager.updateStrategyMetrics(strategy.id, metrics);
            }
          }
        } catch (error) {
          console.error(`[Razor] Error processing ticker:`, error);
        }
      });

      console.log('[Razor] ✅ Executor monitoring live market data');
      return;
    }

    // For Fast Test strategy: place immediate test order
    if (strategy.name === 'Fast Test') {
      try {
        console.log('[StrategyService] Fast Test - placing test order immediately');
        await this.placeFastTestOrder(strategy, instrument);
      } catch (error) {
        console.error('[StrategyService] Fast Test order failed:', error);
        await stateManager.updateStrategyStatus(strategy.id, 'error');
        return;
      }
    }

    // Subscribe to ticker updates for ongoing monitoring (legacy behavior)
    await this.client.subscribeTicker(instrument, async (ticker) => {
      // Monitor position and ticker for strategy logic
      console.log(`[Strategy ${strategy.name}] Ticker: ${ticker.last_price}`);
    });

    // Store reference
    const checkInterval = setInterval(async () => {
      // Periodic checks (every 10 seconds)
      const currentStrategy = stateManager.getAllStrategies().find(s => s.id === strategy.id);
      if (!currentStrategy || currentStrategy.status !== 'active') {
        console.log(`[StrategyService] Strategy ${strategy.name} is no longer active, stopping`);
        clearInterval(checkInterval);
        this.runningStrategies.delete(strategy.id);
        this.strategyExecutors.delete(strategy.id);
      }
    }, 10000);

    this.runningStrategies.set(strategy.id, checkInterval);
  }

  /**
   * Place Fast Test order with stop loss and take profit
   */
  private async placeFastTestOrder(strategy: StrategyState, instrument: string): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    console.log('[StrategyService] Fast Test - getting instrument details');
    const instrumentDetails = await this.client.getInstrument(instrument);
    
    console.log('[StrategyService] Fast Test - checking for existing positions');
    const positions = await this.client.getPositions('USDC');
    const openPosition = positions.find((p: any) => p.size !== 0);
    
    if (openPosition) {
      throw new Error('Cannot start strategy: existing position found');
    }

    // Get current price
    const ticker = await this.client.getTicker(instrument);
    const entryPrice = ticker.last_price;

    // Calculate stop loss and take profit (0.3% each for fast test)
    const stopLoss = entryPrice * 0.997;  // -0.3%
    const takeProfit = entryPrice * 1.003; // +0.3%

    // Round to tick size
    const tickSize = instrumentDetails.tick_size;
    const roundedSL = Math.round(stopLoss / tickSize) * tickSize;
    const roundedTP = Math.round(takeProfit / tickSize) * tickSize;

    // Use minimum trade amount for test
    const amount = instrumentDetails.min_trade_amount;

    const label = `fast_test_${Date.now()}`;

    console.log('[StrategyService] Fast Test - placing ENTRY order', {
      instrument,
      amount,
      entryPrice,
      stopLoss: roundedSL,
      takeProfit: roundedTP,
    });

    // 1. Place entry order (market buy)
    const entryOrder = await this.client.placeBuyOrder(
      instrument,
      amount,
      undefined,
      'market',
      label
    );

    console.log('[StrategyService] Fast Test - entry order placed:', entryOrder.order_id);

    // 2. Verify entry order before placing SL/TP
    let entryVerified = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      try {
        const orderStatus = await this.client.getOrderStatus(entryOrder.order_id);
        if (orderStatus && ['filled', 'open'].includes(orderStatus.order_state)) {
          entryVerified = true;
          console.log('[StrategyService] Fast Test - entry VERIFIED:', orderStatus.order_state);
          break;
        }
      } catch (error) {
        console.warn(`[StrategyService] Verification attempt ${attempt + 1} failed`);
      }
    }

    if (!entryVerified) {
      throw new Error('Entry order verification failed - ABORTING SL/TP placement');
    }

    // 3. Place stop loss (stop_market)
    console.log('[StrategyService] Fast Test - placing STOP LOSS');
    const stopLossOrder = await this.client.placeSellOrder(
      instrument,
      amount,
      roundedSL,
      'stop_market',
      `${label}_sl`,
      true  // reduce_only
    );

    console.log('[StrategyService] Fast Test - stop loss placed:', stopLossOrder.order_id);

    // 4. Place take profit (limit)
    console.log('[StrategyService] Fast Test - placing TAKE PROFIT');
    const takeProfitOrder = await this.client.placeSellOrder(
      instrument,
      amount,
      roundedTP,
      'limit',
      `${label}_tp`,
      true  // reduce_only
    );

    console.log('[StrategyService] Fast Test - take profit placed:', takeProfitOrder.order_id);

    // Update strategy state with position info
    strategy.position = {
      instrument,
      direction: 'long',
      entryPrice,
      amount,
      stopLoss: roundedSL,
      takeProfit: roundedTP,
      orderId: entryOrder.order_id,
    };

    await stateManager.updateStrategy(strategy);

    console.log('[StrategyService] Fast Test - order placement COMPLETE ✅');

    // Monitor position for cleanup (when SL or TP hits)
    this.monitorPositionCleanup(strategy, instrument, stopLossOrder.order_id, takeProfitOrder.order_id);
  }

  /**
   * Monitor position and cleanup SL/TP when one hits
   */
  private monitorPositionCleanup(
    strategy: StrategyState,
    instrument: string,
    stopLossOrderId: string,
    takeProfitOrderId: string
  ): void {
    const monitorInterval = setInterval(async () => {
      if (!this.client) {
        clearInterval(monitorInterval);
        return;
      }

      try {
        // Check if both orders still exist
        let slExists = false;
        let tpExists = false;

        try {
          const slStatus = await this.client.getOrderStatus(stopLossOrderId);
          slExists = slStatus && slStatus.order_state === 'open';
        } catch (e) {
          // Order not found or cancelled
        }

        try {
          const tpStatus = await this.client.getOrderStatus(takeProfitOrderId);
          tpExists = tpStatus && tpStatus.order_state === 'open';
        } catch (e) {
          // Order not found or cancelled
        }

        // If one hit, cancel the other
        if (slExists && !tpExists) {
          console.log('[StrategyService] Take profit HIT, cancelling stop loss');
          await this.client.cancelOrder(stopLossOrderId);
          clearInterval(monitorInterval);
          await stateManager.updateStrategyStatus(strategy.id, 'stopped');
        } else if (!slExists && tpExists) {
          console.log('[StrategyService] Stop loss HIT, cancelling take profit');
          await this.client.cancelOrder(takeProfitOrderId);
          clearInterval(monitorInterval);
          await stateManager.updateStrategyStatus(strategy.id, 'stopped');
        } else if (!slExists && !tpExists) {
          console.log('[StrategyService] Both orders closed, position completed');
          clearInterval(monitorInterval);
          await stateManager.updateStrategyStatus(strategy.id, 'stopped');
        }
      } catch (error) {
        console.error('[StrategyService] Position monitoring error:', error);
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * Get current strategy status
   */
  getStrategyStatus(strategyId?: string): StrategyState[] {
    if (strategyId) {
      const strategy = stateManager.getAllStrategies().find(s => s.id === strategyId);
      return strategy ? [strategy] : [];
    }
    return stateManager.getAllStrategies();
  }

  /**
   * Get strategy analysis state
   */
  async getStrategyAnalysis(strategyId: string): Promise<AnalysisState | null> {
    const strategy = stateManager.getStrategy(strategyId);
    if (!strategy || !strategy.analysisState) {
      return null;
    }
    return strategy.analysisState;
  }

  /**
   * Get strategy position metrics
   */
  async getStrategyMetrics(strategyId: string): Promise<PositionMetrics | null> {
    const strategy = stateManager.getStrategy(strategyId);
    if (!strategy || !strategy.metrics) {
      return null;
    }
    return strategy.metrics;
  }

  /**
   * Get connection status including connectedAt timestamp
   */
  getConnectionStatus(): { connected: boolean; environment: string; connectedAt?: number; broker?: string; manuallyDisconnected?: boolean } {
    const connectionState = stateManager.getConnection();
    return {
      connected: this.client?.isConnected() || false,
      environment: this.environment,
      connectedAt: connectionState?.connectedAt,
      broker: connectionState?.broker,
      manuallyDisconnected: connectionState?.manuallyDisconnected,
    };
  }

  /**
   * Get account balance from broker
   */
  async getBalance(currency: string = 'BTC'): Promise<{ currency: string; available: number; total: number; locked: number } | null> {
    if (!this.client || !this.client.isConnected()) {
      return null;
    }

    try {
      const summary = await this.client.getAccountSummary(currency);
      return {
        currency,
        available: summary.available_funds,
        total: summary.equity,
        locked: summary.equity - summary.available_funds,
      };
    } catch (error) {
      console.error('[StrategyService] Failed to get balance:', error);
      return null;
    }
  }

  /**
   * Get open positions from broker
   */
  async getPositions(currency: string = 'USDC'): Promise<any[]> {
    if (!this.client || !this.client.isConnected()) {
      throw new Error('Not connected to broker');
    }

    try {
      const positions = await this.client.getPositions(currency);
      return positions;
    } catch (error) {
      console.error('[StrategyService] Failed to get positions:', error);
      throw error;
    }
  }

  /**
   * Close a position manually
   */
  async closePosition(instrument: string): Promise<void> {
    if (!this.client || !this.client.isConnected()) {
      throw new Error('Not connected to broker');
    }

    try {
      console.log(`[StrategyService] Manually closing position for ${instrument}`);
      
      // Cancel all open orders first
      await this.client.cancelAllByInstrument(instrument);
      console.log(`[StrategyService] Cancelled all open orders for ${instrument}`);
      
      // Close position at market
      await this.client.closePosition(instrument, 'market');
      console.log(`[StrategyService] Position closed for ${instrument}`);
    } catch (error) {
      console.error('[StrategyService] Failed to close position:', error);
      throw error;
    }
  }

  /**
   * Get health metrics
   */
  getHealthMetrics() {
    const allStrategies = stateManager.getAllStrategies();
    const activeStrategies = allStrategies.filter(s => s.status === 'active');
    return {
      strategiesActive: activeStrategies.length,
      strategiesTotal: allStrategies.length,
      errors24h: 0, // TODO: Add error tracking
    };
  }

  /**
   * Update health metrics
   */
  private updateHealthMetrics(): void {
    const allStrategies = stateManager.getAllStrategies();
    const activeStrategies = allStrategies.filter(s => s.status === 'active');
    updateStrategiesHealth(activeStrategies.length, allStrategies.length);
  }

  /**
   * Graceful shutdown - stop all strategies and close connections
   */
  async shutdown(): Promise<void> {
    console.log('[StrategyService] Shutting down...');
    
    try {
      // 1. Stop all active strategies
      const activeStrategies = stateManager.getActiveStrategies();
      console.log(`[StrategyService] Stopping ${activeStrategies.length} active strategies...`);
      
      for (const strategy of activeStrategies) {
        try {
          await this.stopStrategy({ strategyId: strategy.id });
          console.log(`[StrategyService] ✅ Stopped strategy ${strategy.id}`);
        } catch (error) {
          console.error(`[StrategyService] ❌ Failed to stop strategy ${strategy.id}:`, error);
        }
      }
      
      // 2. Close WebSocket connection
      if (this.client && this.client.isConnected()) {
        console.log('[StrategyService] Closing WebSocket connection...');
        await this.client.disconnect();
        console.log('[StrategyService] ✅ WebSocket closed');
      }
      
      // 3. Clear executors
      this.strategyExecutors.clear();
      this.runningStrategies.clear();
      
      console.log('[StrategyService] ✅ Shutdown complete');
    } catch (error) {
      console.error('[StrategyService] ❌ Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Kill switch - stop everything immediately
   */
  async killSwitch(): Promise<void> {
    console.log('[StrategyService] KILL SWITCH ACTIVATED');
    await this.disconnect();
    await stateManager.clearStrategies();
  }

  /**
   * Get open orders for instrument
   */
  async getOpenOrders(instrumentName: string): Promise<any[]> {
    if (!this.client || !this.client.isConnected()) {
      throw new Error('Not connected to broker');
    }

    return await this.client.getOpenOrders(instrumentName);
  }

  /**
   * Get ticker information for an instrument
   */
  async getTicker(instrument: string): Promise<any> {
    if (!this.client || !this.client.isConnected()) {
      throw new Error('Not connected to broker');
    }

    try {
      const ticker = await this.client.getTicker(instrument);
      return ticker;
    } catch (error) {
      console.error('[StrategyService] Failed to get ticker:', error);
      throw error;
    }
  }

  /**
   * Place a test micro order with stop loss and take profit
   * Exact copy of frontend logic for consistency
   */
  async placeTestOrder(params?: {
    instrument?: string;
    amount?: number;
    side?: 'buy' | 'sell';
    currentPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    label?: string;
  }): Promise<{
    success: boolean;
    orderId?: string;
    instrumentName?: string;
    entryPrice?: number;
    amount?: number;
    stopLoss?: number;
    takeProfit?: number;
    error?: string;
  }> {
    if (!this.client || !this.client.isConnected()) {
      return { success: false, error: 'Not connected to broker' };
    }

    try {
      const instrumentName = params?.instrument || 'BTC_USDC-PERPETUAL';
      
      console.log('[StrategyService] Starting test order process...');
      
      // Get instrument details for min trade amount and tick size
      const instrument = await this.client.getInstrument(instrumentName);
      if (!instrument) {
        console.error('[StrategyService] Instrument not found:', instrumentName);
        return { success: false, error: `Instrument ${instrumentName} not found` };
      }

      console.log('[StrategyService] Instrument details:', {
        name: instrumentName,
        tick_size: instrument.tick_size,
        min_trade_amount: instrument.min_trade_amount
      });

      // Get current market price
      const ticker = await this.client.getTicker(instrumentName);
      if (!ticker) {
        console.error('[StrategyService] Ticker not found for:', instrumentName);
        return { success: false, error: 'Failed to get market ticker' };
      }

      console.log('[StrategyService] Ticker data:', {
        mark_price: ticker.mark_price,
        last_price: ticker.last_price
      });

      const markPrice = ticker.mark_price;
      const tickSize = instrument.tick_size;
      const minTradeAmount = params?.amount || instrument.min_trade_amount;
      
      // Calculate stop loss and take profit prices (for quick testing)
      // SL very far away (10% down), TP super close (0.05% up) for instant triggering
      const stopLossPrice = params?.stopLoss || Math.round((markPrice * 0.90) / tickSize) * tickSize;
      const takeProfitPrice = params?.takeProfit || Math.round((markPrice * 1.0005) / tickSize) * tickSize;
      
      const label = params?.label || `tb_micro_test_sl_tp`;
      
      console.log('[StrategyService] Placing OTOCO test order (One Triggers One Cancels Other) - OFFICIAL DERIBIT METHOD:', {
        instrumentName,
        amountUSD: minTradeAmount,
        markPrice,
        stopLossPrice,
        takeProfitPrice,
        tickSize,
        label,
      });

      // OFFICIAL DERIBIT OTOCO: Place single entry order with SL/TP in otoco_config
      // This automatically creates linked SL/TP orders when entry fills, with automatic OCO cleanup
      const entryOrder = await this.client.placeBuyOrder(
        instrumentName,
        minTradeAmount,
        undefined, // market price
        'market',
        label,
        false, // reduce_only = false for entry
        {
          linked_order_type: 'one_triggers_one_cancels_other', // KEY: This triggers OTOCO
          trigger_fill_condition: 'first_hit', // Any execution triggers secondary orders
          otoco_config: [
            {
              // Stop Loss order - automatically created when entry fills
              direction: 'sell',
              amount: minTradeAmount,
              type: 'stop_market',
              trigger_price: stopLossPrice,
              trigger: 'mark_price',
              reduce_only: true,
              label: `${label}_sl`
            },
            {
              // Take Profit order - automatically created when entry fills  
              direction: 'sell',
              amount: minTradeAmount,
              type: 'limit',
              price: takeProfitPrice,
              reduce_only: true,
              label: `${label}_tp`
            }
          ]
        }
      );

      console.log('[StrategyService] OTOCO entry order placed - Deribit will auto-create SL/TP with OCO linking:', JSON.stringify(entryOrder, null, 2));

      // Extract order ID from the response structure
      let orderId = entryOrder?.order?.order_id || 
                    entryOrder?.order_id || 
                    entryOrder?.trades?.[0]?.order_id;
      
      console.log('[StrategyService] Extracted entry order ID:', orderId);
      
      if (!orderId) {
        console.error('[StrategyService] Entry order missing order_id in response structure');
        return { success: false, error: 'Entry order failed - no order ID returned' };
      }

      console.log('[StrategyService] ✅ OTOCO order placed successfully! Deribit will handle automatic SL/TP creation and OCO cleanup.');

      return {
        success: true,
        orderId: orderId,
        instrumentName,
        entryPrice: markPrice,
        amount: minTradeAmount,
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
      };
    } catch (error: any) {
      console.error('[StrategyService] Test order failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to place test order',
      };
    }
  }

  /**
   * Monitor position-based cleanup - cancels SL/TP when position is closed
   */
  private async monitorPositionBasedCleanup(
    instrumentName: string,
    stopLossOrderId: string,
    takeProfitOrderId: string,
    originalAmount: number
  ): Promise<void> {
    if (!this.client) return;

    console.log(`[StrategyService] 🔄 Starting POSITION-based monitoring for ${instrumentName}`);
    console.log(`[StrategyService] 📊 Monitoring SL: ${stopLossOrderId}, TP: ${takeProfitOrderId}`);
    console.log(`[StrategyService] 💰 Original position amount: ${originalAmount}`);

    let checkCount = 0;
    const maxChecks = 30; // 60 seconds max monitoring
    
    const monitoringInterval = setInterval(async () => {
      checkCount++;
      
      try {
        if (!this.client) {
          console.log('[StrategyService] ❌ Client disconnected, stopping monitoring');
          clearInterval(monitoringInterval);
          return;
        }

        // 1. Check current position
        const positions = await this.client.getPositions('USDC');
        const currentPosition = positions.find((p: any) => p.instrument_name === instrumentName);
        const positionSize = currentPosition ? Math.abs(currentPosition.size) : 0;
        
        // 2. Check if orders still exist
        const openOrders = await this.client.getOpenOrders(instrumentName);
        const slOrder = openOrders.find(o => o.order_id === stopLossOrderId);
        const tpOrder = openOrders.find(o => o.order_id === takeProfitOrderId);
        
        console.log(`[StrategyService] 📈 Check ${checkCount}: Position=${positionSize}, SL=${!!slOrder}, TP=${!!tpOrder}`);
        
        // 3. If position is closed or significantly reduced, clean up remaining orders
        if (positionSize === 0 || positionSize < originalAmount * 0.1) {
          console.log('[StrategyService] 🎯 Position closed/reduced - cleaning up remaining orders...');
          
          const cleanupPromises = [];
          
          if (slOrder) {
            console.log('[StrategyService] 🧹 Cancelling stop loss order...');
            cleanupPromises.push(
              this.client.cancelOrder(stopLossOrderId).catch(e => 
                console.log('[StrategyService] ⚠️ SL cancel failed (already closed):', e.message)
              )
            );
          }
          
          if (tpOrder) {
            console.log('[StrategyService] 🧹 Cancelling take profit order...');
            cleanupPromises.push(
              this.client.cancelOrder(takeProfitOrderId).catch(e => 
                console.log('[StrategyService] ⚠️ TP cancel failed (already closed):', e.message)
              )
            );
          }
          
          await Promise.all(cleanupPromises);
          console.log('[StrategyService] ✅ Cleanup completed successfully!');
          clearInterval(monitoringInterval);
          return;
        }
        
        // 4. Check if one order was hit and clean up the other
        if (!slOrder && tpOrder) {
          console.log('[StrategyService] 🎯 Stop loss was hit, cleaning up take profit...');
          await this.client.cancelOrder(takeProfitOrderId).catch(e => 
            console.log('[StrategyService] ⚠️ TP cleanup failed:', e.message)
          );
          console.log('[StrategyService] ✅ Take profit cleaned up!');
          clearInterval(monitoringInterval);
        } else if (slOrder && !tpOrder) {
          console.log('[StrategyService] 🎯 Take profit was hit, cleaning up stop loss...');
          await this.client.cancelOrder(stopLossOrderId).catch(e => 
            console.log('[StrategyService] ⚠️ SL cleanup failed:', e.message)
          );
          console.log('[StrategyService] ✅ Stop loss cleaned up!');
          clearInterval(monitoringInterval);
        }
        
        // 5. Timeout protection
        if (checkCount >= maxChecks) {
          console.log('[StrategyService] ⏱️ Max monitoring time reached, force cleanup...');
          await this.client.cancelAllByInstrument(instrumentName).catch(e => 
            console.log('[StrategyService] ⚠️ Force cleanup failed:', e.message)
          );
          clearInterval(monitoringInterval);
        }
        
      } catch (error) {
        console.error('[StrategyService] ❌ Error in position monitoring:', error);
        // Continue monitoring even on errors
      }
    }, 2000); // Check every 2 seconds
  }
}

// Singleton instance
export const strategyService = new StrategyService();

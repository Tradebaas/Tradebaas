/**
 * Backend Strategy Service
 * Manages strategy execution independently from frontend
 * Handles connection, strategy lifecycle, and auto-resume
 */

import { BackendDeribitClient, type DeribitEnvironment } from './deribit-client';
import { stateManager, type StrategyState } from './state-manager';
import { credentialsManager } from './credentials-manager';
import { RazorExecutor, type RazorConfig } from './strategies/razor-executor';
import { ThorExecutor, type ThorConfig } from './strategies/thor-executor';
import { updateStrategiesHealth } from './health';
import { getTradeHistoryService } from './services/trade-history';
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
  private strategyExecutors = new Map<string, RazorExecutor | ThorExecutor>();
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
      
      // CRITICAL: Initialize OrderLifecycleManager BEFORE resuming strategies
      const { initializeOrderLifecycleManager } = await import('./services/order-lifecycle-manager');
      initializeOrderLifecycleManager(this.client);
      console.log('[StrategyService] ✅ OrderLifecycleManager initialized');
      
      // CRITICAL: Reconcile ALL open trades BEFORE auto-resume
      await this.reconcileAllOpenTrades();
      
      // AUTO-RESUME STRATEGIES: If connection was restored, resume active strategies
      const strategiesToResume = stateManager.getStrategiesToResume();
      
      console.error('[StrategyService] AUTO-RESUME CHECK: Found', strategiesToResume.length, 'strategies to resume');
      
      if (strategiesToResume.length > 0) {
        console.error(`[StrategyService] 🔄 RESUMING ${strategiesToResume.length} ACTIVE STRATEGY(S)...`);
        
        for (const strategy of strategiesToResume) {
          console.log(`[StrategyService] ▶️  Resuming strategy: ${strategy.name} (${strategy.id})`);
          
          try {
            // CRITICAL: Call runStrategy() directly (strategy already exists in state)
            // Don't use startStrategy() - it will reject because strategy already exists!
            await this.runStrategy(strategy);
            console.log(`[StrategyService] ✅ Successfully resumed strategy: ${strategy.name}`);
          } catch (error) {
            console.error(`[StrategyService] ❌ Failed to resume strategy ${strategy.name}:`, error);
            // Mark as error in state
            await stateManager.updateStrategyStatus(strategy.id, 'error');
          }
        }
        
        // CRITICAL: Update health metrics after auto-resume
        this.updateHealthMetrics();
        console.log('[StrategyService] ✅ Health metrics updated after auto-resume');
      } else {
        console.log('[StrategyService] No active strategies to resume');
      }
    } else {
      console.log('[StrategyService] Initialization complete - awaiting manual connection');
      const fs = require('fs');
      fs.appendFileSync('/tmp/auto-resume-debug.log', `[${new Date().toISOString()}] Client not connected, skipping auto-resume\n`);
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

    // CRITICAL: Initialize OrderLifecycleManager BEFORE reconciliation
    const { initializeOrderLifecycleManager } = await import('./services/order-lifecycle-manager');
    initializeOrderLifecycleManager(this.client);
    console.log('[StrategyService] OrderLifecycleManager initialized (via connect)');

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
   * CRITICAL: Check for open positions before stopping
   */
  async stopStrategy(request: StopStrategyRequest): Promise<{ success: boolean; message: string }> {
    console.log('[StrategyService] Stop strategy request:', request.strategyId);

    // Get strategy to check for open positions
    const strategy = stateManager.getStrategy(request.strategyId);
    
    // CRITICAL: Don't stop if there's an open position
    if (strategy) {
      const hasOpenPosition = strategy.analysisState?.status === 'position_open' || 
                             strategy.position || 
                             strategy.metrics;
      
      if (hasOpenPosition) {
        console.warn(`[StrategyService] ⚠️  Cannot stop strategy ${request.strategyId} - has open position!`);
        console.warn(`[StrategyService] Strategy will be PAUSED but not removed from state`);
        
        // Pause executor but keep state
        const timer = this.runningStrategies.get(request.strategyId);
        if (timer) {
          clearInterval(timer);
          this.runningStrategies.delete(request.strategyId);
        }
        
        // Mark as stopped but DON'T cleanup
        await stateManager.updateStrategyStatus(request.strategyId, 'stopped');
        
        return {
          success: true,
          message: 'Strategy paused (position open - will auto-resume after close)',
        };
      }
    }

    // Safe to fully stop - no open position
    const timer = this.runningStrategies.get(request.strategyId);
    if (timer) {
      clearInterval(timer);
      this.runningStrategies.delete(request.strategyId);
    }

    // Remove executor
    this.strategyExecutors.delete(request.strategyId);

    await stateManager.updateStrategyStatus(request.strategyId, 'stopped');
    
    // Cleanup stopped strategies from state
    await stateManager.cleanupStoppedStrategies();
    
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

  // DEBUG
  const fs = require('fs');
  const nameLower = strategy.name.toLowerCase();
  fs.appendFileSync('/tmp/auto-resume-debug.log', `[${new Date().toISOString()}] runStrategy: name="${strategy.name}", lowercase="${nameLower}"\n`);

  // For Razor strategy: Use full executor with analysis tracking
  if (nameLower === 'razor') {
      fs.appendFileSync('/tmp/auto-resume-debug.log', `[${new Date().toISOString()}] MATCHED Razor strategy!\n`);
      
      const config: RazorConfig = {
        instrument,
        tradeSize: strategy.config.tradeSize || 100, // $100 USD
        stopLossPercent: strategy.config.stopLossPercent || 0.5, // 0.5%
        takeProfitPercent: strategy.config.takeProfitPercent || 0.65, // 0.65% (1:1.3 RR)
        maxConcurrentTrades: strategy.config.maxConcurrentTrades || 1,
        maxDailyTrades: strategy.config.maxDailyTrades || 150, // HIGH-FREQUENCY: 150 max
  cooldownMinutes: strategy.config.cooldownMinutes || 1, // SCALPING: 1 min cooldown
  // Dynamic stop management defaults
  breakEvenEnabled: strategy.config.breakEvenEnabled ?? true,
  breakEvenTriggerToTP: strategy.config.breakEvenTriggerToTP ?? 0.5,
  breakEvenOffsetTicks: strategy.config.breakEvenOffsetTicks ?? 1,
        minVolatility: strategy.config.minVolatility || 0.01, // SCALPING: 0.01% (was 0.1%)
        maxVolatility: strategy.config.maxVolatility || 5.0, // SCALPING: 5% (was 2.0%)
        rsiOversold: strategy.config.rsiOversold || 40, // SCALPING: 40 (was 30)
        rsiOverbought: strategy.config.rsiOverbought || 60, // SCALPING: 60 (was 70)
      };

      const executor = new RazorExecutor(this.client, strategy.id, strategy.name, config);
      fs.appendFileSync('/tmp/auto-resume-debug.log', `[${new Date().toISOString()}] Executor created\n`);
      
      // CRITICAL: Initialize executor (loads history + checks for orphan trades)
      console.log('[Razor] Initializing strategy executor...');
      await executor.initialize();
      console.log('[Razor] ✅ Initialization complete');

      // Persist initial analysis state immediately so frontend can show warm-up state
      try {
        await stateManager.updateStrategyAnalysis(strategy.id, executor.getAnalysisState());
      } catch (error) {
        console.error('[StrategyService] Failed to persist initial Razor analysis state:', error);
      }
      fs.appendFileSync('/tmp/auto-resume-debug.log', `[${new Date().toISOString()}] Executor initialized\n`);
      
      // EVENT-DRIVEN AUTO-RESUME: Listen for trade close events
      const { getOrderLifecycleManager } = await import('./services/order-lifecycle-manager');
      const orderManager = getOrderLifecycleManager();
      
      orderManager.on('tradeClosed', async (event: any) => {
        if (event.strategyName === strategy.name) {
          console.log(`\n${'='.repeat(80)}`);
          console.log(`[StrategyService] 🎯 TRADE CLOSED EVENT RECEIVED`);
          console.log(`[StrategyService] Strategy: ${event.strategyName}`);
          console.log(`[StrategyService] Trade ID: ${event.tradeId}`);
          console.log(`[StrategyService] Reason: ${event.exitReason}`);
          console.log(`${'='.repeat(80)}\n`);
          
          // Force the executor to resume (in case it's stuck)
          executor.forceResume();
          
          // Update state to reflect analyzing status
          await stateManager.updateStrategyAnalysis(strategy.id, {
            ...executor.getAnalysisState(),
            status: 'analyzing'
          });
          
          console.log(`[StrategyService] ✅ Strategy ${strategy.name} resumed and status updated`);
        }
      });
      
      this.strategyExecutors.set(strategy.id, executor);
      fs.appendFileSync('/tmp/auto-resume-debug.log', `[${new Date().toISOString()}] Executor added to map, size=${this.strategyExecutors.size}\n`);

      console.log(`[Razor] Subscribing to ${instrument} ticker...`);
      console.log(`[Razor] SCALPING CONFIG: Vol ${config.minVolatility}%-${config.maxVolatility}%, RSI ${config.rsiOversold}/${config.rsiOverbought}, Max ${config.maxDailyTrades} trades/day`);
      
      fs.appendFileSync('/tmp/auto-resume-debug.log', `[${new Date().toISOString()}] About to subscribe to ticker...\n`);
      
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
      
      fs.appendFileSync('/tmp/auto-resume-debug.log', `[${new Date().toISOString()}] Ticker subscription complete!\n`);

      console.log('[Razor] ✅ Executor monitoring live market data');
      return;
    }

  // Thor - risk vanuit UI config
    if (nameLower === 'thor') {
      const tradeHistory = getTradeHistoryService();
      let equityUsd = 1000;
      try {
        const stats = await (tradeHistory as any).getAccountStats?.();
        if (stats && typeof stats.equityUsd === 'number' && stats.equityUsd > 0) {
          equityUsd = stats.equityUsd;
        }
      } catch {
        // fallback default equity
      }

      const thorConfig: ThorConfig = {
        instrument,
        accountEquityUsd: equityUsd,
        maxRiskPercent: typeof strategy.config.riskValue === 'number' ? strategy.config.riskValue : 3,
        fixedRiskUsd: strategy.config.riskMode === 'fixed' ? strategy.config.riskValue : undefined,
        rsiPeriod: 4,
        rsiLongLevel: 30,
        rsiShortLevel: 70,
        bbPeriod: 20,
        bbStdDev: 2,
        atrPeriod: 14,
        spreadFilterBps: 5,
        minAtrBps: 5,
        maxAtrBps: 80,
        maxDailyTrades: 40,
        cooldownCandles: 5,
      };

      const executor = new ThorExecutor(this.client, strategy.id, strategy.name, thorConfig);
      await executor.initialize();

      // Persist initial analysis state immediately so frontend can show warm-up state
      try {
        await stateManager.updateStrategyAnalysis(strategy.id, executor.getAnalysisState());
      } catch (error) {
        console.error('[StrategyService] Failed to persist initial Thor analysis state:', error);
      }

      this.strategyExecutors.set(strategy.id, executor);

      const timer = setInterval(async () => {
        try {
          const ticker = await this.client!.getTicker(instrument);
          const price = ticker.last_price as number;
          await executor.onTicker(price);

          const analysisState = executor.getAnalysisState();
          await stateManager.updateStrategyAnalysis(strategy.id, analysisState);
        } catch (error) {
          console.error('[StrategyService] Thor loop error:', error);
        }
      }, 1000);

      this.runningStrategies.set(strategy.id, timer);
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
      
      // CRITICAL: Don't kill strategy if it's actively managing a position or in cooldown
      const executor = this.strategyExecutors.get(strategy.id);
      if (executor && executor instanceof RazorExecutor) {
        const analysisState = executor.getAnalysisState();
        
        // If position is open, DON'T delete (strategy is paused, waiting for position close)
        if (analysisState.status === 'position_open') {
          console.log(`[HealthCheck] Strategy ${strategy.name} has open position - SKIP cleanup`);
          return;
        }
        
        // If in cooldown after position close, DON'T delete (strategy will resume after cooldown)
        if (analysisState.cooldownUntil && Date.now() < analysisState.cooldownUntil) {
          console.log(`[HealthCheck] Strategy ${strategy.name} in cooldown - SKIP cleanup`);
          return;
        }
      }
      
      // Only cleanup if EXPLICITLY stopped by user (status === 'stopped')
      if (currentStrategy && currentStrategy.status === 'stopped') {
        console.log(`[StrategyService] Strategy ${strategy.name} was stopped by user - cleaning up executor`);
        clearInterval(checkInterval);
        this.runningStrategies.delete(strategy.id);
        this.strategyExecutors.delete(strategy.id);
        
        // CRITICAL: Cleanup stopped strategies from state
        await stateManager.cleanupStoppedStrategies();
      } else if (!currentStrategy) {
        // Strategy not found in state file (possible corruption or manual edit)
        console.warn(`[StrategyService] Strategy ${strategy.name} not found in state - keeping executor alive (possible state corruption)`);
        // DON'T auto-delete - let it continue running
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
  async getStrategyStatus(strategyId?: string): Promise<StrategyState[]> {
    const strategies = strategyId 
      ? stateManager.getAllStrategies().filter(s => s.id === strategyId)
      : stateManager.getAllStrategies();
    
    // CRITICAL FIX: Derive status from DATABASE, not from in-memory state
    // This prevents the "stuck on paused" bug when WebSocket disconnects
    const enrichedStrategies = await Promise.all(strategies.map(async (strategy) => {
      // Check database for open trades (SINGLE SOURCE OF TRUTH)
      const tradeHistory = getTradeHistoryService();
      let hasOpenTrade = false;
      
      try {
        const instrument = strategy.position?.instrument || strategy.config?.instrument || 'BTC_USDC-PERPETUAL';
        const openTrade = await tradeHistory.getOpenTrade(
          strategy.name, 
          instrument
        );
        hasOpenTrade = openTrade !== null;
      } catch (error) {
        console.error('[StrategyService] Failed to check open trades:', error);
        // Fallback to in-memory state on error
        hasOpenTrade = strategy.analysisState?.status === 'position_open';
      }
      
      // Clone strategy to avoid mutating state
      const enrichedStrategy = { ...strategy };
      
      // Override analysisState.status based on database reality
      if (enrichedStrategy.analysisState) {
        const currentStatus = enrichedStrategy.analysisState.status;
        
        enrichedStrategy.analysisState = {
          ...enrichedStrategy.analysisState,
          // DATABASE WINS: If DB has open trade, status MUST be 'position_open'
          // If DB has no open trade, status CANNOT be 'position_open'
          status: hasOpenTrade 
            ? 'position_open' as const
            : (currentStatus === 'position_open' 
                ? 'analyzing' as const  // Auto-correct stuck status
                : currentStatus)
        };
        
        // Log status corrections
        if (currentStatus === 'position_open' && !hasOpenTrade) {
          console.log(`[StrategyService] 🔧 Auto-corrected status for ${strategy.name}: position_open → analyzing (no open trade in DB)`);
        } else if (currentStatus !== 'position_open' && hasOpenTrade) {
          console.log(`[StrategyService] 🔧 Auto-corrected status for ${strategy.name}: ${currentStatus} → position_open (open trade found in DB)`);
        }
      }
      
      return enrichedStrategy;
    }));
    
    return enrichedStrategies;
  }

  /**
   * Get strategy analysis state
   */
  async getStrategyAnalysis(strategyId: string): Promise<AnalysisState | null> {
    const strategy = stateManager.getStrategy(strategyId);

    // Debug logging to diagnose missing analysis on remote
    if (!strategy) {
      console.warn('[StrategyService] getStrategyAnalysis: strategy not found for id:', strategyId);
      // Log what strategies DO exist
      const allStrategies = stateManager.getAllStrategies();
      console.warn('[StrategyService] Available strategies:', 
        allStrategies.map(s => `${s.name} (${s.id}, status: ${s.status})`).join(', ')
      );
      return null; // real 404 case
    }

    if (strategy.analysisState) {
      console.log('[StrategyService] getStrategyAnalysis: returning existing analysis for', strategy.name, strategy.id);
      return strategy.analysisState;
    }

    console.log('[StrategyService] getStrategyAnalysis: no analysisState yet, returning default warm-up state for id:', strategyId);

    // Robust default: existing strategy but no analysis yet -> return initializing state
    const now = Date.now();

    const defaultAnalysis: AnalysisState = {
      strategyId: strategy.id,
      strategyName: strategy.name,
      instrument: strategy.config?.instrument || 'BTC_USDC-PERPETUAL',
      status: 'analyzing',
      currentPrice: null,
      lastUpdated: now,
      indicators: {
        emaFast: NaN,
        emaSlow: NaN,
        rsi: NaN,
        volume: 0,
        volatility: 0,
      },
      signal: {
        type: 'none',
        strength: 0,
        confidence: 0,
        reasons: ['Strategie wordt opgestart, wacht op voldoende marktdata'],
      },
      checkpoints: [
        {
          id: 'initializing',
          label: 'Strategie wordt opgestart',
          description: 'Marktdata wordt verzameld en indicatoren worden berekend',
          status: 'pending',
          value: undefined,
          timestamp: now,
        },
      ],
  requiredDataPoints: 30,
  dataPoints: 0,
  cooldownUntil: null,
  nextCheckAt: null,
    };

    return defaultAnalysis;
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
      
      // CRITICAL: Trigger trade cleanup immediately
      const { getOrderLifecycleManager } = await import('./services/order-lifecycle-manager');
      const { getTradeHistoryService } = await import('./services/trade-history');
      
      try {
        const orderManager = getOrderLifecycleManager();
        const tradeHistory = getTradeHistoryService();
        
        // Find open trade for this instrument
        const allTrades = await tradeHistory.getAllTrades();
        const openTrade = allTrades.find(t => t.instrument === instrument && t.status === 'open');
        
        if (openTrade) {
          console.log(`[StrategyService] Found open trade ${openTrade.id} - triggering cleanup`);
          // Use direct cleanup with manual trigger reason (bypass position check since we just closed it)
          await orderManager.cleanupTradeOrders(openTrade.id, 'Manual close via UI');
          
          // CRITICAL: Manually emit 'tradeClosed' event for strategy auto-resume
          console.log(`[StrategyService] 📢 Emitting 'tradeClosed' event for ${openTrade.strategyName}`);
          orderManager.emit('tradeClosed', {
            tradeId: openTrade.id,
            strategyName: openTrade.strategyName,
            instrument: openTrade.instrument,
            exitReason: 'position_closed'
          });
          
          console.log(`[StrategyService] ✅ Trade cleanup completed`);
        }
      } catch (cleanupError) {
        console.error('[StrategyService] Trade cleanup failed (non-critical):', cleanupError);
        // Don't throw - the periodic check will handle it
      }
      
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
      // 1. Stop execution of active strategies BUT KEEP THEM IN STATE for auto-resume
      const activeStrategies = stateManager.getActiveStrategies();
      console.log(`[StrategyService] Pausing ${activeStrategies.length} active strategies (will auto-resume on restart)...`);
      
      for (const strategy of activeStrategies) {
        try {
          // Stop the execution timer but DON'T change status or remove from state
          const timer = this.runningStrategies.get(strategy.id);
          if (timer) {
            clearInterval(timer);
            this.runningStrategies.delete(strategy.id);
          }
          
          // Remove executor
          this.strategyExecutors.delete(strategy.id);
          
          console.log(`[StrategyService] ✅ Paused strategy ${strategy.name} (${strategy.id}) - will auto-resume`);
        } catch (error) {
          console.error(`[StrategyService] ❌ Failed to pause strategy ${strategy.id}:`, error);
        }
      }
      
      // IMPORTANT: DO NOT call stopStrategy() or cleanupStoppedStrategies()
      // We want to keep strategies in state with status='active' for auto-resume
      console.log(`[StrategyService] Kept ${activeStrategies.length} strategies in state for auto-resume`);
      
      // 2. Close WebSocket connection
      if (this.client && this.client.isConnected()) {
        console.log('[StrategyService] Closing WebSocket connection...');
        await this.client.disconnect();
        console.log('[StrategyService] ✅ WebSocket closed');
      }
      
      // 3. Clear executors (already done above, but ensure)
      this.strategyExecutors.clear();
      this.runningStrategies.clear();
      
      console.log('[StrategyService] ✅ Shutdown complete (strategies preserved for auto-resume)');
    } catch (error) {
      console.error('[StrategyService] ❌ Error during shutdown:', error);
      throw error;
    }
  }
  
  /**
   * Get Deribit client for external services (e.g., reconciliation)
   */
  getClient(): BackendDeribitClient | null {
    return this.client;
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

  /**
   * CRITICAL: Reconcile ALL open trades vs Deribit positions at startup
   * Cleans up ghost trades (DB says open but no Deribit position)
   */
  private async reconcileAllOpenTrades(): Promise<void> {
    try {
      console.log('\n' + '='.repeat(80));
      console.log('[StrategyService] 🔄 GLOBAL RECONCILIATION - Database vs Deribit');
      console.log('='.repeat(80));

      const { getTradeHistoryService } = await import('./services/trade-history');
      const { getOrderLifecycleManager } = await import('./services/order-lifecycle-manager');
      
      const tradeHistory = getTradeHistoryService();
      const orderManager = getOrderLifecycleManager();

      // Get ALL open trades across all strategies
      const allTrades = await tradeHistory.getAllTrades();
      const openTrades = allTrades.filter(t => t.status === 'open');

      console.log(`[StrategyService] 📊 Database: ${openTrades.length} open trade(s)`);

      if (openTrades.length === 0) {
        console.log('[StrategyService] ✅ No open trades - clean state');
        console.log('='.repeat(80) + '\n');
        return;
      }

      // Get ALL Deribit positions
      const positions = await this.client!.getPositions('USDC');
      console.log(`[StrategyService] 📊 Deribit: ${positions.filter((p: any) => p.size !== 0).length} position(s)`);

      // Check each open trade
      let ghostCount = 0;
      for (const trade of openTrades) {
        const hasPosition = positions.some((p: any) => 
          p.size !== 0 && 
          (p.instrument_name === trade.instrument || p.instrument === trade.instrument)
        );

        if (!hasPosition) {
          // GHOST TRADE: DB says open but no Deribit position
          console.log(`\n[StrategyService] ⚠️  GHOST TRADE: ${trade.id}`);
          console.log(`[StrategyService]    Strategy: ${trade.strategyName}`);
          console.log(`[StrategyService]    Instrument: ${trade.instrument}`);
          console.log(`[StrategyService]    Entry: $${trade.entryPrice}`);
          console.log(`[StrategyService] 🧹 Cleaning up ghost trade...`);

          // Use OrderLifecycleManager to properly cleanup
          await orderManager.cleanupTradeOrders(trade.id, 'Ghost trade detected at startup');
          
          // CRITICAL: Clear metrics for this strategy
          const allStrategies = stateManager.getAllStrategies();
          const strategy = allStrategies.find(s => s.name === trade.strategyName);
          if (strategy) {
            console.log(`[StrategyService] 🧹 Clearing stale metrics for ${trade.strategyName}`);
            await stateManager.updateStrategyMetrics(strategy.id, null as any);
          }
          
          ghostCount++;
        } else {
          console.log(`[StrategyService] ✅ Trade ${trade.id} - position EXISTS`);
        }
      }

      if (ghostCount > 0) {
        console.log(`\n[StrategyService] 🧹 Cleaned up ${ghostCount} ghost trade(s)`);
      } else {
        console.log(`\n[StrategyService] ✅ All open trades have valid positions`);
      }

      console.log('='.repeat(80) + '\n');

    } catch (error) {
      console.error('[StrategyService] ❌ Reconciliation failed:', error);
      // Don't throw - continue with startup
    }
  }
}

// Singleton instance
export const strategyService = new StrategyService();

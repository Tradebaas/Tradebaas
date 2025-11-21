import { IBroker, Candle as BrokerCandle } from '../brokers/IBroker';
import { CandleAggregator } from './CandleAggregator';
import { StrategyEngine } from './StrategyEngine';
import { RiskEngine } from './RiskEngine';
import { StateStore } from './StateStore';
import { ReconciliationService } from './ReconciliationService';
import { 
  StrategyConfig, 
  Position, 
  StrategyStatus,
  Candle,
  StrategySignal,
} from './types';
import { TechnicalIndicators } from './TechnicalIndicators';

export class StrategyRunner {
  private broker: IBroker | null = null;
  private strategyEngine: StrategyEngine | null = null;
  private candleAggregator: CandleAggregator;
  private stateStore: StateStore;
  private reconciliationService: ReconciliationService | null = null;
  
  private isRunning: boolean = false;
  private runInterval: NodeJS.Timeout | null = null;
  private currentConfig: StrategyConfig | null = null;
  private equity: number = 0;
  private lastSignal: StrategySignal | null = null;
  private userId: string;
  private workerId: string;
  
  constructor(userId: string, workerId: string) {
    this.userId = userId;
    this.workerId = workerId;
    this.candleAggregator = new CandleAggregator();
    this.stateStore = new StateStore(userId, workerId);
  }
  
  async init(): Promise<void> {
    await this.stateStore.init();
    console.log(`[StrategyRunner] Initialized for user ${this.userId}, worker ${this.workerId}`);
  }
  
  async loadStrategy(config: StrategyConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error('Cannot load strategy while runner is active');
    }
    
    this.currentConfig = config;
    this.strategyEngine = new StrategyEngine(config);
    console.log(`[StrategyRunner] Strategy loaded: ${config.name}`);
  }
  
  setBroker(broker: IBroker): void {
    this.broker = broker;
    this.reconciliationService = new ReconciliationService(broker);
  }
  
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Strategy runner already running');
    }
    
    if (!this.broker) {
      throw new Error('Broker not set');
    }
    
    if (!this.strategyEngine || !this.currentConfig) {
      throw new Error('No strategy loaded');
    }
    
    if (this.broker.getConnectionStatus() !== 'connected') {
      throw new Error('Broker not connected');
    }
    
    const balances = await this.broker.getBalance('USDC');
    if (balances.length === 0) {
      throw new Error('No USDC balance found');
    }
    
    this.equity = balances[0].available;
    
    if (this.equity <= 0) {
      throw new Error('Insufficient equity');
    }
    
    console.log(`[StrategyRunner] Starting reconciliation...`);
    await this.performReconciliation();
    
    this.isRunning = true;
    console.log(`[StrategyRunner] Started with equity: ${this.equity} USDC`);
    
    this.runLoop();
  }
  
  private async performReconciliation(): Promise<void> {
    if (!this.reconciliationService || !this.currentConfig) {
      return;
    }
    
    const state = this.stateStore.getState();
    const savedPosition = state.position;
    
    const labelPrefix = `strategy_${this.currentConfig.id}`;
    const result = await this.reconciliationService.reconcile(savedPosition, labelPrefix);
    
    if (result.matched) {
      console.log(`[StrategyRunner] ✓ Position reconciled: ${result.matched.position.instrument}`);
      await this.stateStore.setPosition(result.matched.position);
      
      if (result.matched.position) {
        this.monitorPosition(result.matched.position);
      }
    } else if (savedPosition) {
      console.log('[StrategyRunner] Position not found - clearing saved state');
      await this.stateStore.setPosition(null);
    }
    
    if (result.actions.length > 0) {
      console.log(`[StrategyRunner] Executing ${result.actions.length} reconciliation actions`);
      await this.reconciliationService.executeActions(
        result.actions,
        this.currentConfig.instrument
      );
    }
    
    if (result.orphanedOrders.length > 0) {
      console.log(`[StrategyRunner] Cleaned up ${result.orphanedOrders.length} orphaned orders`);
    }
  }
  
  private runLoop(): void {
    this.runInterval = setInterval(async () => {
      try {
        await this.tick();
      } catch (error) {
        console.error('[StrategyRunner] Error in tick:', error);
      }
    }, 60000);
    
    this.tick();
  }
  
  private async tick(): Promise<void> {
    if (!this.broker || !this.strategyEngine || !this.currentConfig) {
      return;
    }
    
    const state = this.stateStore.getState();
    
    if (state.position) {
      console.log('[StrategyRunner] Position open, skipping evaluation');
      return;
    }
    
    try {
      const candles = await this.broker.getCandles(
        this.currentConfig.instrument,
        '1m',
        100
      );
      
      for (const candle of candles) {
        this.candleAggregator.addCandle1m({
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        });
      }
      
      if (!this.candleAggregator.hasEnoughData(this.currentConfig.timeframe, 50)) {
        console.log('[StrategyRunner] Insufficient candle data');
        return;
      }
      
      const targetCandles = this.candleAggregator.getCandles(
        this.currentConfig.timeframe,
        100
      );
      
      const signal = this.strategyEngine.evaluate(targetCandles);
      this.lastSignal = signal;
      
      if (signal.action === 'buy' || signal.action === 'sell') {
        console.log(`[StrategyRunner] Signal: ${signal.action} (${signal.confidence.toFixed(2)})`);
        console.log(`[StrategyRunner] Reason: ${signal.reason}`);
        
        await this.executeSignal(signal, targetCandles);
      } else {
        console.log('[StrategyRunner] No actionable signal');
      }
      
    } catch (error) {
      console.error('[StrategyRunner] Error fetching candles or evaluating:', error);
    }
  }
  
  private async executeSignal(signal: StrategySignal, candles: Candle[]): Promise<void> {
    if (!this.broker || !this.currentConfig) return;
    
    // IMPORTANT: Type guard - ensure signal.action is executable ('buy' or 'sell', not 'none')
    // This should already be filtered by caller, but we check again for type safety
    if (signal.action === 'none') {
      console.log('[StrategyRunner] Signal action is "none", skipping execution');
      return;
    }
    
    try {
      const instrumentInfo = await this.broker.getInstrumentInfo(
        this.currentConfig.instrument
      );
      
      const currentPrice = candles[candles.length - 1].close;
      
      let atr: number | undefined;
      if (this.currentConfig.stopLoss.type === 'atr') {
        const atrValues = TechnicalIndicators.calculateATR(candles, 14);
        atr = atrValues.length > 0 ? atrValues[atrValues.length - 1] : undefined;
      }
      
      const stopLoss = RiskEngine.calculateStopLoss(
        currentPrice,
        signal.action,
        this.currentConfig.stopLoss.type,
        this.currentConfig.stopLoss.value,
        atr,
        instrumentInfo.tickSize
      );
      
      const riskResult = RiskEngine.calculatePosition({
        equity: this.equity,
        riskMode: this.currentConfig.risk.mode,
        riskValue: this.currentConfig.risk.value,
        entryPrice: currentPrice,
        stopPrice: stopLoss,
        maxLeverage: Math.min(
          this.currentConfig.risk.maxLeverage,
          instrumentInfo.maxLeverage
        ),
        minTradeAmount: instrumentInfo.minTradeAmount,
        tickSize: instrumentInfo.tickSize,
      });
      
      if (!riskResult.success) {
        console.log(`[StrategyRunner] Risk check failed: ${riskResult.reason}`);
        return;
      }
      
      const takeProfit = RiskEngine.calculateTakeProfit(
        currentPrice,
        stopLoss,
        signal.action,
        this.currentConfig.takeProfit.type,
        this.currentConfig.takeProfit.value,
        instrumentInfo.tickSize
      );
      
      console.log(`[StrategyRunner] Executing ${signal.action.toUpperCase()} order with OTOCO`);
      console.log(`  Quantity: ${riskResult.quantity}`);
      console.log(`  Entry: ${currentPrice}`);
      console.log(`  Stop Loss: ${stopLoss}`);
      console.log(`  Take Profit: ${takeProfit}`);
      console.log(`  Leverage: ${riskResult.leverage.toFixed(2)}x`);
      
      // OFFICIAL DERIBIT OTOCO: Single entry order with automatic SL/TP creation and OCO linking
      const entryOrder = await this.broker.placeOrder({
        instrument: this.currentConfig.instrument,
        side: signal.action as 'buy' | 'sell',
        type: 'market',
        amount: riskResult.quantity,
        label: `strategy_${this.currentConfig.id}_entry`,
        // OTOCO configuration for automatic SL/TP with OCO cleanup
        otocoConfig: {
          stopLoss: {
            type: 'stop_market',
            triggerPrice: stopLoss,
            trigger: 'mark_price'
          },
          takeProfit: {
            type: 'take_limit',
            price: takeProfit,
            trigger: 'mark_price'
          }
        }
      });
      
      console.log(`[StrategyRunner] ✅ OTOCO order placed - Deribit will auto-create SL/TP with OCO linking: ${entryOrder.orderId}`);
      
      const position: Position = {
        orderId: entryOrder.orderId,
        instrument: this.currentConfig.instrument,
        side: signal.action as 'buy' | 'sell',
        entryPrice: currentPrice,
        amount: riskResult.quantity,
        stopLoss,
        takeProfit,
        entryTime: Date.now(),
        // OTOCO: SL/TP orders will be auto-created by Deribit, no separate order IDs needed
        slOrderId: undefined,
        tpOrderId: undefined,
      };
      
      const state = this.stateStore.getState();
      await this.stateStore.setState({
        position,
        lastExecutionTime: Date.now(),
        totalTrades: state.totalTrades + 1,
      });
      
      this.monitorPosition(position);
      
    } catch (error) {
      console.error('[StrategyRunner] Failed to execute signal:', error);
    }
  }
  
  private async monitorPosition(position: Position): Promise<void> {
    console.log(`[StrategyRunner] 🔍 Started monitoring position: ${position.instrument} ${position.side} ${position.amount}`);
    
    const checkInterval = setInterval(async () => {
      if (!this.broker) {
        console.log('[StrategyRunner] ⚠️ Broker disconnected, stopping position monitor');
        clearInterval(checkInterval);
        return;
      }
      
      // Check if strategy is still running
      if (!this.isRunning) {
        console.log('[StrategyRunner] ⚠️ Strategy stopped, clearing position monitor');
        clearInterval(checkInterval);
        return;
      }
      
      try {
        // Get all open orders for this instrument
        const openOrders = await this.broker.getOpenOrders(position.instrument);
        
        // Check if SL/TP orders are still active
        // If both SL and TP orders are gone/filled, position is closed
        const slOrder = openOrders.find(o => 
          o.type === 'stop_market' || o.type === 'stop_limit'
        );
        const tpOrder = openOrders.find(o => 
          o.type === 'take_limit' || o.type === 'take_market'
        );
        
        // Position is considered closed if both SL and TP orders are gone
        if (!slOrder && !tpOrder) {
          clearInterval(checkInterval);
          
          console.log('[StrategyRunner] ✅ Position closed detected (SL/TP orders filled or cancelled)');
          
          // Try to get final exit info from recent trades if possible
          // For now, we'll use entry price as approximation
          // TODO: Fetch actual fill price from trade history
          const exitPrice = position.entryPrice; // Simplified for now
          
          // Calculate PnL (simplified - actual PnL calculated by broker)
          const pnl = position.side === 'buy'
            ? (exitPrice - position.entryPrice) * position.amount
            : (position.entryPrice - exitPrice) * position.amount;
          
          const state = this.stateStore.getState();
          
          await this.stateStore.setState({
            position: null,
            totalPnL: state.totalPnL + pnl,
            winningTrades: pnl > 0 ? state.winningTrades + 1 : state.winningTrades,
            losingTrades: pnl < 0 ? state.losingTrades + 1 : state.losingTrades,
          });
          
          console.log(`[StrategyRunner] 💰 Position closed. PnL: ${pnl.toFixed(2)} USDC (Total: ${(state.totalPnL + pnl).toFixed(2)} USDC)`);
          console.log(`[StrategyRunner] 📊 Stats: ${state.winningTrades + (pnl > 0 ? 1 : 0)}W / ${state.losingTrades + (pnl < 0 ? 1 : 0)}L`);
          console.log(`[StrategyRunner] ▶️  Resuming strategy evaluation for new signals...`);
        } else {
          // Position still open
          const remainingOrders = [slOrder, tpOrder].filter(Boolean).map(o => o?.type).join(' + ');
          console.log(`[StrategyRunner] 📈 Position still open (${remainingOrders} orders active)`);
        }
      } catch (error) {
        console.error('[StrategyRunner] ❌ Error monitoring position:', error);
      }
    }, 5000); // Check every 5 seconds
  }
  
  stop(): void {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.runInterval) {
      clearInterval(this.runInterval);
      this.runInterval = null;
    }
    
    console.log('[StrategyRunner] Stopped');
  }
  
  getStatus(): StrategyStatus {
    const state = this.stateStore.getState();
    
    return {
      isRunning: this.isRunning,
      strategyId: this.currentConfig?.id || null,
      position: state.position,
      lastSignal: this.lastSignal,
      lastExecutionTime: state.lastExecutionTime,
      stats: {
        totalTrades: state.totalTrades,
        winningTrades: state.winningTrades,
        losingTrades: state.losingTrades,
        totalPnL: state.totalPnL,
        winRate: state.totalTrades > 0 
          ? (state.winningTrades / state.totalTrades) * 100 
          : 0,
      },
    };
  }
  
  isActive(): boolean {
    return this.isRunning;
  }
}

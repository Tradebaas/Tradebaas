import type { DeribitClient, Ticker } from '@/lib/deribitClient';
import type { RiskSettings } from '@/state/store';
import { calculatePosition } from '@/lib/riskEngine';
import { validateAndNormalizeAmount } from '@/lib/utils';
import type { ErrorLog } from '@/components/dialogs/ErrorDetailsDialog';
import { DeribitError } from '@/lib/deribitClient';

interface DeribitOrderState {
  order_state: string;
}

export interface FastTestConfig {
  instrument: string;
  takeProfitPercent: number;
  stopLossPercent: number;
  orderIntervalMs: number;
}

export interface ActivePosition {
  orderId: string;
  instrumentName: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
  slOrderId?: string;
  tpOrderId?: string;
  strategyName: string;
}

export class FastTestStrategy {
  private config: FastTestConfig;
  private position: ActivePosition | null = null;
  private client: DeribitClient;
  private riskSettings: RiskSettings;
  private equity: number;
  private isRunning: boolean = false;
  private monitorInterval: number | null = null;
  private tradeInterval: number | null = null;
  private lastTradeTime: number = 0;
  private onPositionOpen?: (position: ActivePosition) => void;
  private onPositionClose?: (position: ActivePosition, pnl: number) => void;
  private onError?: (error: ErrorLog) => void;

  constructor(
    client: DeribitClient,
    config: FastTestConfig,
    riskSettings: RiskSettings,
    equity: number,
    callbacks?: {
      onPositionOpen?: (position: ActivePosition) => void;
      onPositionClose?: (position: ActivePosition, pnl: number) => void;
      onError?: (error: ErrorLog) => void;
    }
  ) {
    this.client = client;
    this.config = config;
    this.riskSettings = riskSettings;
    this.equity = equity;
    this.onPositionOpen = callbacks?.onPositionOpen;
    this.onPositionClose = callbacks?.onPositionClose;
    this.onError = callbacks?.onError;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastTradeTime = Date.now();
    console.log('[Fast Test Strategy] Started - will place trade every 20 seconds (if no position open)');
    
    try {
      await this.client.subscribe(
        [`user.portfolio.${this.config.instrument.toLowerCase()}`],
        async (channel, data) => {
          await this.handlePortfolioUpdate(data);
        }
      );
      console.log('[Fast Test Strategy] Subscribed to portfolio updates');
    } catch (error) {
      console.warn('[Fast Test Strategy] Failed to subscribe to portfolio updates:', error);
    }
    
    this.monitorInterval = window.setInterval(async () => {
      await this.monitorPosition();
      await this.cleanupOrphanedOrders();
    }, 5000);
    
    this.tradeInterval = window.setInterval(async () => {
      await this.checkAndExecuteTrade();
    }, this.config.orderIntervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.monitorInterval) {
      window.clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    if (this.tradeInterval) {
      window.clearInterval(this.tradeInterval);
      this.tradeInterval = null;
    }
    
    console.log('[Fast Test Strategy] Stopped');
  }

  private async handlePortfolioUpdate(data: unknown): Promise<void> {
    try {
      const portfolioData = data as { 
        size?: number;
        instrument_name?: string;
      };
      
      if (portfolioData.instrument_name === this.config.instrument && portfolioData.size === 0 && this.position) {
        console.log('[Fast Test Strategy] Position was closed externally, cleaning up related orders...');
        await this.cleanupOrphanedOrders();
      }
    } catch (error) {
      console.warn('[Fast Test Strategy] Failed to handle portfolio update:', error);
    }
  }

  private async cleanupOrphanedOrders(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const openOrders = await this.client.getOpenOrders(this.config.instrument);
      
      if (openOrders.length === 0) {
        if (this.position) {
          console.log('[Fast Test Strategy] Position has no orders - was closed externally');
          this.position = null;
        }
        return;
      }

      if (!this.position) {
        console.log('[Fast Test Strategy] Found orphaned orders without position, cancelling...');
        for (const order of openOrders) {
          try {
            await this.client.cancelOrder(order.order_id);
            console.log(`[Fast Test Strategy] Cancelled orphaned order: ${order.order_id}`);
          } catch (cancelError) {
            console.warn(`[Fast Test Strategy] Failed to cancel order ${order.order_id}:`, cancelError);
          }
        }
        return;
      }

      const hasEntryOrder = openOrders.some(o => o.label === `fast_test_${this.position?.entryTime}`);
      const hasStopLoss = openOrders.some(o => o.order_id === this.position?.slOrderId);
      const hasTakeProfit = openOrders.some(o => o.order_id === this.position?.tpOrderId);

      if (!hasEntryOrder && !hasStopLoss && !hasTakeProfit) {
        console.log('[Fast Test Strategy] All position orders were filled/cancelled - position closed');
        const closedPosition = this.position;
        this.position = null;
        this.onPositionClose?.(closedPosition, 0);
      } else if (hasStopLoss && !hasTakeProfit && this.position.tpOrderId) {
        console.log('[Fast Test Strategy] Take profit was hit, cleaning up stop loss...');
        try {
          await this.client.cancelOrder(this.position.slOrderId!);
          console.log('[Fast Test Strategy] Stop loss order cancelled after TP hit');
        } catch (error) {
          console.warn('[Fast Test Strategy] Failed to cancel stop loss:', error);
        }
        const closedPosition = this.position;
        this.position = null;
        this.onPositionClose?.(closedPosition, 0);
      } else if (!hasStopLoss && hasTakeProfit && this.position.slOrderId) {
        console.log('[Fast Test Strategy] Stop loss was hit, cleaning up take profit...');
        try {
          await this.client.cancelOrder(this.position.tpOrderId!);
          console.log('[Fast Test Strategy] Take profit order cancelled after SL hit');
        } catch (error) {
          console.warn('[Fast Test Strategy] Failed to cancel take profit:', error);
        }
        const closedPosition = this.position;
        this.position = null;
        this.onPositionClose?.(closedPosition, 0);
      }
    } catch (error) {
      console.warn('[Fast Test Strategy] Failed to cleanup orphaned orders:', error);
    }
  }

  private async monitorPosition(): Promise<void> {
    if (!this.isRunning || !this.position) return;

    try {
      const ticker = await this.client.getTicker(this.config.instrument);
      await this.managePosition(ticker);
    } catch (error) {
      const isDeribitError = error instanceof DeribitError;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      const errorLog: ErrorLog = {
        id: `strategy-error-${Date.now()}`,
        timestamp: Date.now(),
        errorType: isDeribitError ? error.type : 'POSITION_MONITOR_ERROR',
        message: errorMessage,
        stack: errorStack,
        context: {
          action: 'monitorPosition',
          strategyName: 'Fast Test Strategy',
          instrument: this.config.instrument,
          hasPosition: !!this.position,
          positionSide: this.position?.side,
          entryPrice: this.position?.entryPrice,
        },
        apiResponse: isDeribitError && error.data ? {
          errorCode: String(error.code),
          data: error.data,
        } : undefined,
      };
      
      console.error('[Fast Test Strategy] Position monitoring error:', errorMessage);
      this.onError?.(errorLog);
    }
  }

  private async checkAndExecuteTrade(): Promise<void> {
    if (!this.isRunning) return;

    if (this.position) {
      console.log('[Fast Test Strategy] Skipping trade - position already open');
      return;
    }

    try {
      const openPosition = await this.client.getPosition(this.config.instrument);
      
      if (openPosition && openPosition.size !== 0) {
        console.log('[Fast Test Strategy] ⏸️  Position already open, pausing strategy', {
          instrument: openPosition.instrument_name,
          size: openPosition.size,
          direction: openPosition.direction,
          avgPrice: openPosition.average_price.toFixed(2),
          unrealizedPnL: openPosition.floating_profit_loss.toFixed(2),
        });
        return;
      }

      console.log('[Fast Test Strategy] Placing scheduled trade');
      await this.executeTrade();
      this.lastTradeTime = Date.now();
    } catch (error) {
      const isDeribitError = error instanceof DeribitError;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      const errorLog: ErrorLog = {
        id: `strategy-error-${Date.now()}`,
        timestamp: Date.now(),
        errorType: isDeribitError ? error.type : 'TRADE_EXECUTION_ERROR',
        message: errorMessage,
        stack: errorStack,
        context: {
          action: 'checkAndExecuteTrade',
          strategyName: 'Fast Test Strategy',
          instrument: this.config.instrument,
          hasPosition: !!this.position,
          timeSinceLastTrade: Date.now() - this.lastTradeTime,
        },
        apiResponse: isDeribitError && error.data ? {
          errorCode: String(error.code),
          data: error.data,
        } : undefined,
      };
      
      console.error('[Fast Test Strategy] Trade execution error:', errorMessage);
      this.onError?.(errorLog);
    }
  }

  private async executeTrade(): Promise<void> {
    try {
      console.log('[Fast Test Strategy] Fetching ticker data...');
      const ticker = await this.client.getTicker(this.config.instrument);
      
      console.log('[Fast Test Strategy] Fetching instrument data...');
      const instrument = await this.client.getInstrument(this.config.instrument);
      
      if (!instrument) {
        const errorLog: ErrorLog = {
          id: `strategy-error-${Date.now()}`,
          timestamp: Date.now(),
          errorType: 'INSTRUMENT_NOT_FOUND',
          message: `Instrument ${this.config.instrument} not found`,
          context: {
            action: 'executeTrade',
            strategyName: 'Fast Test Strategy',
            instrument: this.config.instrument,
          },
        };
        console.error('[Fast Test Strategy] Instrument not found:', this.config.instrument);
        this.onError?.(errorLog);
        return;
      }
      
      const entryPrice = ticker.mark_price;
      const side: 'buy' | 'sell' = 'buy';
      
      const stopLoss = entryPrice * (1 - this.config.stopLossPercent / 100);
      const takeProfit = entryPrice * (1 + this.config.takeProfitPercent / 100);
      
      console.log('[Fast Test Strategy] Calculating position size with risk engine...');
      const riskCalc = calculatePosition({
        equity: this.equity,
        riskMode: this.riskSettings.mode,
        riskValue: this.riskSettings.value,
        entryPrice,
        stopPrice: stopLoss,
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
            action: 'executeTrade',
            strategyName: 'Fast Test Strategy',
            instrument: this.config.instrument,
            equity: this.equity,
            riskMode: this.riskSettings.mode,
            riskValue: this.riskSettings.value,
            entryPrice,
            stopPrice: stopLoss,
          },
        };
        console.log('[Fast Test Strategy] Risk calculation failed:', riskCalc.reason);
        this.onError?.(errorLog);
        return;
      }

      console.log('[Fast Test Strategy] Risk engine calculated quantity:', riskCalc.quantity);
      
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
            action: 'executeTrade',
            strategyName: 'Fast Test Strategy',
            instrument: this.config.instrument,
            calculatedAmount: riskCalc.quantity,
            normalizedAmount: validation.amount,
            minTradeAmount: instrument.min_trade_amount,
            contractSize: instrument.contract_size,
            validationDetails: validation.details,
          },
        };
        console.error('[Fast Test Strategy] Amount validation failed:', validation.error, validation.details);
        this.onError?.(errorLog);
        return;
      }
      
      const amount = validation.amount;
      
      console.log('[Fast Test Strategy] Amount validation passed:', {
        calculatedAmount: riskCalc.quantity,
        normalizedAmount: amount,
        contractSize: instrument.contract_size,
        minTradeAmount: instrument.min_trade_amount,
      });
      
      const roundedSL = Math.round(stopLoss / instrument.tick_size) * instrument.tick_size;
      const roundedTP = Math.round(takeProfit / instrument.tick_size) * instrument.tick_size;

      const label = `fast_test_${Date.now()}`;

      console.log('[Fast Test Strategy] Placing entry order:', {
        instrument: this.config.instrument,
        amount,
        contractSize: instrument.contract_size,
        entryPrice,
        stopLoss: roundedSL,
        takeProfit: roundedTP,
      });

      const orderResponse = await this.client.placeBuyOrder(
        this.config.instrument,
        amount,
        undefined,
        'market',
        label
      );

      console.log('[Fast Test Strategy] Entry order placed:', orderResponse);

      // ============================================================================
      // CRITICAL SAFETY CHECK: Verify entry order before placing SL/TP
      // This prevents orphaned protective orders if entry failed
      // ============================================================================
      if (!orderResponse || !orderResponse.order_id) {
        throw new Error('Entry order missing order_id - ABORTING to prevent orphaned SL/TP');
      }

      console.log('[Fast Test Strategy] 🔒 Verifying entry order before SL/TP placement...');
      let entryVerified = false;
      let verificationAttempts = 0;
      const maxVerificationAttempts = 3;

      while (verificationAttempts < maxVerificationAttempts && !entryVerified) {
        try {
          await new Promise(resolve => setTimeout(resolve, 300)); // Brief delay for order to register
          
          const orderStatus = await this.client.request('private/get_order_state', {
            order_id: orderResponse.order_id,
          }) as DeribitOrderState;

          if (orderStatus && ['filled', 'open'].includes(orderStatus.order_state)) {
            entryVerified = true;
            console.log('[Fast Test Strategy] ✅ Entry verified - proceeding with SL/TP', {
              orderId: orderResponse.order_id,
              state: orderStatus.order_state,
            });
          }
        } catch (error) {
          verificationAttempts++;
          console.warn(`[Fast Test Strategy] Entry verification attempt ${verificationAttempts}/${maxVerificationAttempts} failed`, error);
        }
      }

      if (!entryVerified) {
        const error = new Error('Could not verify entry order - ABORTING SL/TP placement to prevent orphaned orders');
        console.error('[Fast Test Strategy] ❌ ENTRY VERIFICATION FAILED - NO SL/TP WILL BE PLACED');
        throw error;
      }

      let stopLossResponse;
      let takeProfitResponse;

      try {
        console.log('[Fast Test Strategy] Placing stop loss order...');
        
        stopLossResponse = await this.client.placeSellOrder(
          this.config.instrument,
          amount,
          roundedSL,
          'stop_market',
          `${label}_sl`,
          true
        );

        console.log('[Fast Test Strategy] ✅ Stop loss placed:', stopLossResponse);

        console.log('[Fast Test Strategy] Placing take profit order...');
        
        takeProfitResponse = await this.client.placeSellOrder(
          this.config.instrument,
          amount,
          roundedTP,
          'limit',
          `${label}_tp`,
          true
        );

        console.log('[Fast Test Strategy] ✅ Take profit placed:', takeProfitResponse);
      } catch (bracketError) {
        console.error('[Fast Test Strategy] ❌ CRITICAL: Failed to place SL/TP - CLOSING POSITION IMMEDIATELY');
        
        // If SL was placed but TP failed, cancel the SL
        if (stopLossResponse && stopLossResponse.order_id) {
          console.log('[Fast Test Strategy] Attempting to cancel orphaned SL order...');
          let slCancelled = false;
          for (let attempt = 0; attempt < 3 && !slCancelled; attempt++) {
            try {
              await this.client.cancelOrder(stopLossResponse.order_id);
              console.log('[Fast Test Strategy] ✅ Orphaned SL cancelled');
              slCancelled = true;
            } catch (cancelError) {
              console.error(`[Fast Test Strategy] SL cancel attempt ${attempt + 1}/3 failed:`, cancelError);
              if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          if (!slCancelled) {
            console.error('[Fast Test Strategy] ❌❌❌ CRITICAL: Could not cancel orphaned SL - MANUAL INTERVENTION REQUIRED');
          }
        }
        
        const errorLog: ErrorLog = {
          id: `strategy-error-${Date.now()}`,
          timestamp: Date.now(),
          errorType: 'BRACKET_ORDER_FAILED',
          message: bracketError instanceof Error ? bracketError.message : 'Failed to place bracket orders',
          context: {
            action: 'executeTrade:placeBrackets',
            strategyName: 'Fast Test Strategy',
            instrument: this.config.instrument,
            entryOrderId: orderResponse.order_id,
          },
        };
        this.onError?.(errorLog);

        // Try emergency close
        try {
          await this.client.placeSellOrder(
            this.config.instrument,
            amount,
            undefined,
            'market',
            `${label}_emergency_close`,
            true
          );
          console.log('[Fast Test Strategy] Emergency close executed - position closed without SL/TP');
        } catch (closeError) {
          console.error('[Fast Test Strategy] ❌ EMERGENCY CLOSE FAILED - MANUAL INTERVENTION REQUIRED', closeError);
          
          const closeErrorLog: ErrorLog = {
            id: `strategy-error-${Date.now()}`,
            timestamp: Date.now(),
            errorType: 'EMERGENCY_CLOSE_FAILED',
            message: closeError instanceof Error ? closeError.message : 'Emergency close failed',
            context: {
              action: 'executeTrade:emergencyClose',
              strategyName: 'Fast Test Strategy',
              instrument: this.config.instrument,
              entryOrderId: orderResponse.order_id,
            },
          };
          this.onError?.(closeErrorLog);
        }
        
        // ============================================================================
        // CRITICAL: STOP THE ENTIRE STRATEGY AFTER BRACKET FAILURE
        // We cannot continue trading if we can't place SL/TP protection
        // ============================================================================
        console.error('[Fast Test Strategy] ⛔ STOPPING STRATEGY - Cannot place protective brackets');
        await this.stop();
        
        throw bracketError;
      }

      this.position = {
        orderId: orderResponse.order_id,
        instrumentName: this.config.instrument,
        side,
        entryPrice,
        amount,
        stopLoss: roundedSL,
        takeProfit: roundedTP,
        entryTime: Date.now(),
        slOrderId: stopLossResponse.order_id,
        tpOrderId: takeProfitResponse.order_id,
        strategyName: 'Fast Test',
      };

      this.onPositionOpen?.(this.position);
      
      console.log('[Fast Test Strategy] ✅ Position opened with SL/TP:', this.position);
    } catch (error) {
      const isDeribitError = error instanceof DeribitError;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      const errorLog: ErrorLog = {
        id: `strategy-error-${Date.now()}`,
        timestamp: Date.now(),
        errorType: isDeribitError ? error.type : 'ORDER_PLACEMENT_ERROR',
        message: errorMessage,
        stack: errorStack,
        context: {
          action: 'executeTrade',
          strategyName: 'Fast Test Strategy',
          instrument: this.config.instrument,
          riskMode: this.riskSettings.mode,
          riskValue: this.riskSettings.value,
          equity: this.equity,
        },
        apiResponse: isDeribitError && error.data ? {
          errorCode: String(error.code),
          data: error.data,
        } : undefined,
        requestDetails: isDeribitError ? {
          method: 'placeBuyOrder / placeSellOrder',
          params: {
            instrument: this.config.instrument,
            takeProfitPercent: this.config.takeProfitPercent,
            stopLossPercent: this.config.stopLossPercent,
          },
        } : undefined,
      };
      
      console.error('[Fast Test Strategy] Failed to execute trade:', errorMessage);
      this.onError?.(errorLog);
    }
  }

  private async managePosition(ticker: Ticker): Promise<void> {
    if (!this.position) return;

    const currentPrice = ticker.last_price;
    let shouldClose = false;
    
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

  private async closePosition(exitPrice: number): Promise<void> {
    if (!this.position) return;

    try {
      console.log('[Fast Test Strategy] Closing position and cancelling related orders...');
      
      await this.client.cancelAllByInstrument(this.config.instrument);
      console.log('[Fast Test Strategy] All orders cancelled for instrument');
      
      await this.client.closePosition(this.config.instrument);
      console.log('[Fast Test Strategy] Position closed');
      
      let pnl: number;
      if (this.position.side === 'buy') {
        pnl = (exitPrice - this.position.entryPrice) * this.position.amount;
      } else {
        pnl = (this.position.entryPrice - exitPrice) * this.position.amount;
      }

      const closedPosition = this.position;
      console.log('[Fast Test Strategy] Position closed. PnL:', pnl);
      this.onPositionClose?.(closedPosition, pnl);
      
      this.position = null;
    } catch (error) {
      const isDeribitError = error instanceof DeribitError;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      const errorLog: ErrorLog = {
        id: `strategy-error-${Date.now()}`,
        timestamp: Date.now(),
        errorType: isDeribitError ? error.type : 'POSITION_CLOSE_ERROR',
        message: errorMessage,
        stack: errorStack,
        context: {
          action: 'closePosition',
          strategyName: 'Fast Test Strategy',
          instrument: this.config.instrument,
          exitPrice,
          positionSide: this.position?.side,
          entryPrice: this.position?.entryPrice,
        },
        apiResponse: isDeribitError && error.data ? {
          errorCode: String(error.code),
          data: error.data,
        } : undefined,
      };
      
      console.error('[Fast Test Strategy] Failed to close position:', errorMessage);
      this.onError?.(errorLog);
    }
  }

  getPosition(): ActivePosition | null {
    return this.position;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getAnalysisState() {
    const now = Date.now();
    const timeSinceLastTrade = now - this.lastTradeTime;
    const timeUntilNextTrade = Math.max(0, this.config.orderIntervalMs - timeSinceLastTrade);
    const remainingSec = Math.ceil(timeUntilNextTrade / 1000);
    
    let status: 'waiting_for_data' | 'analyzing' | 'cooldown' | 'position_open' | 'signal_found' = 'analyzing';
    let waitingFor = '';
    
    const mechanicalCheckpoints: Array<{
      id: string;
      label: string;
      description: string;
      status: 'met' | 'not-met' | 'pending';
      value?: string;
      details?: string;
    }> = [];
    
    if (this.position) {
      status = 'position_open';
      waitingFor = 'Positie wordt gemonitord voor exit condities';
      
      mechanicalCheckpoints.push({
        id: 'position-active',
        label: 'Actieve positie',
        description: 'Test trade is geopend',
        status: 'met',
        value: this.position.side === 'buy' ? 'Long' : 'Short',
        details: `Entry: $${this.position.entryPrice.toFixed(2)} | SL: $${this.position.stopLoss.toFixed(2)} | TP: $${this.position.takeProfit.toFixed(2)}`,
      });
      
      mechanicalCheckpoints.push({
        id: 'exit-monitoring',
        label: 'Exit monitoring',
        description: 'SL/TP worden gemonitord',
        status: 'met',
        value: 'Actief',
        details: `SL: ${this.config.stopLossPercent}% | TP: ${this.config.takeProfitPercent}%`,
      });
    } else {
      mechanicalCheckpoints.push({
        id: 'timer',
        label: 'Order interval timer',
        description: `Plaatst elke ${this.config.orderIntervalMs / 1000}s een test trade`,
        status: 'met',
        value: `${this.config.orderIntervalMs / 1000}s interval`,
        details: `Instrument: ${this.config.instrument}`,
      });
      
      mechanicalCheckpoints.push({
        id: 'no-position',
        label: 'Geen open positie',
        description: 'Controleert of er geen actieve positie is',
        status: 'met',
        value: 'Vrij',
        details: 'Klaar voor nieuwe trade',
      });
      
      if (timeUntilNextTrade > 0) {
        status = 'analyzing';
        waitingFor = `Volgende trade over ${remainingSec}s`;
        
        mechanicalCheckpoints.push({
          id: 'countdown',
          label: 'Countdown',
          description: 'Wacht op einde van interval',
          status: 'not-met',
          value: `${remainingSec}s resterend`,
          details: `Timer loopt sinds ${Math.floor(timeSinceLastTrade / 1000)}s`,
        });
      } else {
        status = 'signal_found';
        waitingFor = 'Trade wordt nu uitgevoerd...';
        
        mechanicalCheckpoints.push({
          id: 'countdown',
          label: 'Countdown',
          description: 'Interval voltooid',
          status: 'met',
          value: 'Klaar',
          details: 'Trade wordt nu geplaatst',
        });
      }
      
      mechanicalCheckpoints.push({
        id: 'trade-direction',
        label: 'Willekeurige richting',
        description: '50/50 kans op Long of Short',
        status: 'met',
        value: 'Random',
        details: 'Richting wordt bepaald bij executie',
      });
      
      mechanicalCheckpoints.push({
        id: 'risk-params',
        label: 'Risico parameters',
        description: 'TP en SL percentages',
        status: 'met',
        value: `TP: ${this.config.takeProfitPercent}% / SL: ${this.config.stopLossPercent}%`,
        details: `Risk mode: ${this.riskSettings.mode} | Value: ${this.riskSettings.value}`,
      });
    }
    
    const marketConditions: { label: string; value: string; status: 'good' | 'neutral' | 'bad' }[] = [];
    
    if (!this.position) {
      marketConditions.push({
        label: 'Countdown',
        value: `${remainingSec}s`,
        status: 'neutral',
      });
      marketConditions.push({
        label: 'Stop Loss',
        value: `${this.config.stopLossPercent}%`,
        status: 'neutral',
      });
      marketConditions.push({
        label: 'Take Profit',
        value: `${this.config.takeProfitPercent}%`,
        status: 'neutral',
      });
    }
    
    return {
      status,
      waitingFor,
      dataPoints: 50,
      lastPrice: null,
      lastPriceTimestamp: null,
      emaFast: null,
      emaSlow: null,
      rsi: null,
      marketConditions,
      mechanicalCheckpoints,
      config: this.config,
      position: this.position,
      cooldownRemaining: 0,
      countdown: remainingSec,
    };
  }
}

export const DEFAULT_FAST_TEST_CONFIG: FastTestConfig = {
  instrument: 'BTC_USDC-PERPETUAL',
  takeProfitPercent: 0.3,
  stopLossPercent: 0.3,
  orderIntervalMs: 60 * 1000,
};

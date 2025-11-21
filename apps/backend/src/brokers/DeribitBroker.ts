import { IBroker, Credentials, Balance, Order, Trade, Candle, PlaceOrderParams } from './IBroker';
import { BackendDeribitClient, DeribitEnvironment } from '../deribit-client';
import { PositionSizer, PositionSizeInput, PositionSizeOutput } from '../risk/PositionSizer';
import { StrategyManager, StrategyLifecycleState } from '../lifecycle/StrategyManager';

// Custom error classes for better error handling
export class OrderValidationError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

export class InsufficientMarginError extends OrderValidationError {
  constructor(required: number, available: number) {
    super(
      `Insufficient margin: required ${required.toFixed(2)}, available ${available.toFixed(2)}`,
      'INSUFFICIENT_MARGIN',
      { required, available }
    );
  }
}

export class LeverageExceededError extends OrderValidationError {
  constructor(calculated: number, max: number) {
    super(
      `Leverage exceeded: calculated ${calculated.toFixed(2)}x, maximum ${max}x`,
      'LEVERAGE_EXCEEDED',
      { calculated, max }
    );
  }
}

const MAX_LEVERAGE = 50; // Safety limit: never exceed 50x leverage
const LEVERAGE_WARNING_THRESHOLD = 10; // Warn if leverage >10x

export class DeribitBroker implements IBroker {
  private client: BackendDeribitClient;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private instrumentCache: Map<string, {
    minTradeAmount: number;
    tickSize: number;
    maxLeverage: number;
    contractSize: number;
    cachedAt: number;
  }> = new Map();
  
  private readonly CACHE_TTL = 3600000; // 1 hour cache for instrument info
  private orphanCleanupInterval: NodeJS.Timeout | null = null;
  private readonly ORPHAN_SCAN_INTERVAL = 60000; // 1 minute

  constructor() {
    this.client = new BackendDeribitClient('live');
  }

  /**
   * Start periodic orphan order cleanup
   * Scans every minute for orders without position or parent
   */
  startOrphanCleanup(): void {
    if (this.orphanCleanupInterval) {
      console.log('[DeribitBroker] Orphan cleanup already running');
      return;
    }

    console.log('[DeribitBroker] Starting orphan cleanup (scan every 60s)');
    
    // Run immediately on start
    this.scanAndCleanOrphans().catch(err => {
      console.error('[DeribitBroker] Initial orphan scan failed:', err);
    });

    // Then run every minute
    this.orphanCleanupInterval = setInterval(() => {
      this.scanAndCleanOrphans().catch(err => {
        console.error('[DeribitBroker] Orphan scan failed:', err);
      });
    }, this.ORPHAN_SCAN_INTERVAL);
  }

  /**
   * Stop periodic orphan order cleanup
   */
  stopOrphanCleanup(): void {
    if (this.orphanCleanupInterval) {
      clearInterval(this.orphanCleanupInterval);
      this.orphanCleanupInterval = null;
      console.log('[DeribitBroker] Orphan cleanup stopped');
    }
  }

  /**
   * Scan for orphan orders and clean them up
   * Orphans are orders that:
   * 1. Have no open position
   * 2. Have no parent order (for SL/TP orders)
   * 3. Are not part of an active OCO transaction
   */
  async scanAndCleanOrphans(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Get all open orders for BTC (assuming BTC trading)
      // TODO: Make currency configurable or scan multiple currencies
      const openOrders = await this.client.getOpenOrdersByCurrency('BTC');
      
      if (openOrders.length === 0) {
        // No orders to check
        return;
      }

      console.log(`[DeribitBroker] Scanning ${openOrders.length} open orders for orphans...`);

      // Get all open positions for BTC
      const positions = await this.client.getPositions('BTC');
      const openPositions = positions.filter(p => p.size !== 0);
      
      const orphanOrders: any[] = [];
      const ocoOrders: Set<string> = new Set();

      // First pass: identify all OCO orders by label
      for (const order of openOrders) {
        if (order.label && (
          order.label.startsWith('entry-oco-') ||
          order.label.startsWith('sl-oco-') ||
          order.label.startsWith('tp-oco-')
        )) {
          ocoOrders.add(order.order_id);
        }
      }

      // Second pass: find orphans
      for (const order of openOrders) {
        const isOcoOrder = ocoOrders.has(order.order_id);
        
        // Skip if part of active OCO transaction
        if (isOcoOrder) {
          continue;
        }

        // Check if order has a position
        const hasPosition = openPositions.some(pos => 
          pos.instrument_name === order.instrument_name
        );

        // If it's a reduce_only order but no position exists, it's an orphan
        if (order.reduce_only && !hasPosition) {
          orphanOrders.push(order);
          console.warn(`[DeribitBroker] ⚠️ Orphan detected: ${order.order_id} (${order.instrument_name}) - reduce_only but no position`);
          continue;
        }

        // Check if it's a SL/TP order without parent (old label format)
        if (order.label && (order.label.includes('SL') || order.label.includes('TP'))) {
          // If it's reduce_only but no position, it's an orphan
          if (!hasPosition) {
            orphanOrders.push(order);
            console.warn(`[DeribitBroker] ⚠️ Orphan detected: ${order.order_id} (${order.instrument_name}) - SL/TP without position`);
          }
        }
      }

      // Cancel orphan orders
      if (orphanOrders.length > 0) {
        console.warn(`[DeribitBroker] 🧹 Cleaning ${orphanOrders.length} orphan orders...`);
        
        for (const orphan of orphanOrders) {
          try {
            await this.client.cancelOrder(orphan.order_id);
            console.log(`[DeribitBroker] ✅ Canceled orphan: ${orphan.order_id} (${orphan.instrument_name})`);
            
            // TODO: Send Telegram alert
            // await this.sendTelegramAlert(`🧹 Orphan order canceled: ${orphan.order_id} (${orphan.instrument_name})`);
          } catch (cancelError) {
            console.error(`[DeribitBroker] ❌ Failed to cancel orphan ${orphan.order_id}:`, cancelError);
            
            // TODO: Send Telegram alert about failed cancellation
            // await this.sendTelegramAlert(`❌ Failed to cancel orphan: ${orphan.order_id} - ${cancelError.message}`);
          }
        }

        const duration = Date.now() - startTime;
        console.log(`[DeribitBroker] Orphan cleanup complete (${orphanOrders.length} canceled, ${duration}ms)`);
      } else {
        const duration = Date.now() - startTime;
        console.log(`[DeribitBroker] No orphans found (${duration}ms)`);
      }
    } catch (error) {
      console.error('[DeribitBroker] Orphan scan error:', error);
      throw error;
    }
  }

  async connect(credentials: Credentials): Promise<void> {
    try {
      this.connectionStatus = 'connecting';
      const env: DeribitEnvironment = credentials.testnet ? 'testnet' : 'live';
      this.client = new BackendDeribitClient(env);
      
      await this.client.connect({
        apiKey: credentials.apiKey,
        apiSecret: credentials.apiSecret,
      });
      
      this.connectionStatus = 'connected';
      console.log(`[DeribitBroker] Connected to ${env}`);
    } catch (error) {
      this.connectionStatus = 'error';
      console.error('[DeribitBroker] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    this.connectionStatus = 'disconnected';
    console.log('[DeribitBroker] Disconnected');
  }

  /**
   * BROKER-004: Start periodic orphan order cleanup
   * Runs every 60 seconds to detect and cancel orphan orders
   */

  async getBalance(currency?: string): Promise<Balance[]> {
    const curr = currency || 'BTC';
    const summary = await this.client.getAccountSummary(curr);
    
    return [{
      currency: curr,
      available: summary.available_funds,
      total: summary.equity,
      locked: summary.equity - summary.available_funds,
    }];
  }

  /**
   * Pre-flight validation: Check all order parameters before submission
   * This is BROKER-001: Order Validation
   */
  private async validateOrder(params: PlaceOrderParams): Promise<void> {
    const { instrument, amount, price, type } = params;

    // 1. Get instrument info (cached)
    const info = await this.getInstrumentInfoCached(instrument);

    // 2. Validate quantity (min/max, lot size)
    if (amount < info.minTradeAmount) {
      throw new OrderValidationError(
        `Amount ${amount} below minimum ${info.minTradeAmount} for ${instrument}`,
        'AMOUNT_TOO_SMALL',
        { amount, minTradeAmount: info.minTradeAmount }
      );
    }

    // Round to lot size (amountStep)
    const roundedAmount = Math.round(amount / info.minTradeAmount) * info.minTradeAmount;
    if (Math.abs(roundedAmount - amount) > 0.0001) {
      console.warn(`[DeribitBroker] Amount ${amount} rounded to ${roundedAmount} (lot size: ${info.minTradeAmount})`);
    }

    // 3. Validate price (tick size) - only for limit orders
    if (type === 'limit' && price) {
      const roundedPrice = Math.round(price / info.tickSize) * info.tickSize;
      if (Math.abs(roundedPrice - price) > 0.0001) {
        console.warn(`[DeribitBroker] Price ${price} rounded to ${roundedPrice} (tick size: ${info.tickSize})`);
      }
    }

    // 4. Validate leverage (calculate required leverage)
    const balance = await this.getBalance();
    const availableBTC = balance[0].available;

    if (price) {
      // Convert BTC balance to USD value using current price
      // For Deribit perpetuals: amount is in USD, balance is in BTC
      const availableFundsUSD = availableBTC * price;
      
      // Notional value in USD
      const notionalValue = amount;
      
      // Calculate required margin at max leverage
      const requiredMargin = notionalValue / info.maxLeverage;
      
      // Calculate actual leverage for this order
      const actualLeverage = notionalValue / availableFundsUSD;

      console.log(`[DeribitBroker] 💰 Balance check: ${availableBTC.toFixed(4)} BTC = $${availableFundsUSD.toFixed(2)} USD @ $${price.toFixed(2)}`);
      console.log(`[DeribitBroker] 📊 Order: notional=$${notionalValue.toFixed(2)}, leverage=${actualLeverage.toFixed(2)}x, margin=$${requiredMargin.toFixed(2)}`);

      // Safety check: never exceed MAX_LEVERAGE (50x)
      if (actualLeverage > MAX_LEVERAGE) {
        throw new LeverageExceededError(actualLeverage, MAX_LEVERAGE);
      }

      // Warning: leverage >10x
      if (actualLeverage > LEVERAGE_WARNING_THRESHOLD) {
        console.warn(`[DeribitBroker] ⚠️  High leverage: ${actualLeverage.toFixed(2)}x (notional: $${notionalValue.toFixed(2)}, available: $${availableFundsUSD.toFixed(2)})`);
      }

      // 5. Validate margin requirements
      if (availableFundsUSD < requiredMargin) {
        throw new InsufficientMarginError(requiredMargin, availableFundsUSD);
      }

      console.log(`[DeribitBroker] ✅ Validation passed: amount=${amount} USD, leverage=${actualLeverage.toFixed(4)}x`);
    }
  }

  /**
   * Get instrument info with caching (1 hour TTL)
   */
  private async getInstrumentInfoCached(instrument: string): Promise<{
    minTradeAmount: number;
    tickSize: number;
    maxLeverage: number;
    contractSize: number;
    cachedAt: number;
  }> {
    const cached = this.instrumentCache.get(instrument);
    const now = Date.now();

    if (cached && now - cached.cachedAt < this.CACHE_TTL) {
      return cached;
    }

    // Fetch from Deribit API
    const info = await this.client.getInstrument(instrument);

    const data = {
      minTradeAmount: info.min_trade_amount,
      tickSize: info.tick_size,
      maxLeverage: info.max_leverage || 50,
      contractSize: info.contract_size,
      cachedAt: now,
    };

    this.instrumentCache.set(instrument, data);
    console.log(`[DeribitBroker] Cached instrument info for ${instrument}:`, data);

    return data;
  }

  async placeOrder(params: PlaceOrderParams): Promise<Order> {
    const { instrument, side, type, amount, price, otocoConfig, reduceOnly, label } = params;

    // BROKER-001: Pre-flight validation
    await this.validateOrder(params);

    let response;

    try {
      // BROKER-002: Atomic OCO placement (if OTOCO config provided)
      if (otocoConfig) {
        response = await this.placeOCOOrder(params);
      } else {
        // Simple order (no OTOCO)
        response = await this.placeSingleOrder(params);
      }

      console.log(`[DeribitBroker] ✅ Order placed: ${response.order_id}`);

      return {
        orderId: response.order_id,
        instrument,
        side,
        type,
        amount,
        price,
        filled: 0,
        status: response.order_state === 'filled' ? 'filled' : 'open',
        timestamp: Date.now(),
        label,
      };
    } catch (error) {
      console.error(`[DeribitBroker] ❌ Order placement failed:`, error);
      throw error;
    }
  }

  /**
   * Place a single order without OCO
   */
  private async placeSingleOrder(params: PlaceOrderParams): Promise<any> {
    const { instrument, side, type, amount, price, reduceOnly, label } = params;

    const order = {
      instrument_name: instrument,
      amount,
      type: type as 'limit' | 'market' | 'stop_market',
      direction: side,
      price,
      reduce_only: reduceOnly,
      label,
    };

    return await this.client.placeOrder(order);
  }

  /**
   * BROKER-002: Place OTOCO order (Official Deribit One Triggers One Cancels Other)
   * 
   * Strategy:
   * 1. Place single entry order with otoco_config containing SL/TP definitions
   * 2. Deribit automatically creates SL/TP orders when entry fills
   * 3. Deribit automatically handles OCO linking (one cancels other)
   * 4. No manual cleanup needed - fully automated by Deribit
   */
  private async placeOCOOrder(params: PlaceOrderParams): Promise<any> {
    const { instrument, side, type, amount, price, otocoConfig, label } = params;
    
    if (!otocoConfig) {
      throw new Error('otocoConfig required for OCO orders');
    }

    const transactionId = `otoco-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const entryLabel = label || `entry-${transactionId}`;

    console.log(`[DeribitBroker] 🔄 Starting OTOCO placement (Official Deribit): ${transactionId}`);
    console.log(`[DeribitBroker]   Entry: ${side} ${amount} @ ${price || 'market'}`);
    console.log(`[DeribitBroker]   SL: ${otocoConfig.stopLoss?.triggerPrice}`);
    console.log(`[DeribitBroker]   TP: ${otocoConfig.takeProfit?.price}`);

    try {
      // Build OTOCO configuration array for Deribit
      const otocoConfigArray: any[] = [];

      // Add Stop Loss to OTOCO config if provided
      if (otocoConfig.stopLoss) {
        otocoConfigArray.push({
          direction: side === 'buy' ? 'sell' : 'buy',
          amount,
          type: 'stop_market',
          trigger_price: otocoConfig.stopLoss.triggerPrice,
          trigger: otocoConfig.stopLoss.trigger || 'mark_price',
          reduce_only: true,
          label: `${entryLabel}_sl`
        });
      }

      // Add Take Profit to OTOCO config if provided
      if (otocoConfig.takeProfit) {
        otocoConfigArray.push({
          direction: side === 'buy' ? 'sell' : 'buy',
          amount,
          type: 'limit',
          price: otocoConfig.takeProfit.price,
          reduce_only: true,
          label: `${entryLabel}_tp`
        });
      }

      console.log(`[DeribitBroker] 📥 Placing OTOCO entry order with auto SL/TP creation...`);
      
      // OFFICIAL DERIBIT OTOCO: Single entry order with automatic SL/TP creation and OCO linking
      let entryResponse;
      if (side === 'buy') {
        entryResponse = await this.client.placeBuyOrder(
          instrument,
          amount,
          price,
          type as 'market' | 'limit' | 'stop_market',
          entryLabel,
          false, // reduce_only = false for entry
          {
            linked_order_type: 'one_triggers_one_cancels_other',
            trigger_fill_condition: 'first_hit',
            otoco_config: otocoConfigArray
          }
        );
      } else {
        entryResponse = await this.client.placeSellOrder(
          instrument,
          amount,
          price,
          type as 'market' | 'limit' | 'stop_market',
          entryLabel,
          false, // reduce_only = false for entry
          {
            linked_order_type: 'one_triggers_one_cancels_other',
            trigger_fill_condition: 'first_hit',
            otoco_config: otocoConfigArray
          }
        );
      }
      
      console.log(`[DeribitBroker] ✅ OTOCO order placed - Deribit will auto-create SL/TP with OCO linking: ${entryResponse.order_id}`);
      
      return entryResponse;

    } catch (error) {
      console.error(`[DeribitBroker] ❌ OTOCO placement failed:`, error);
      console.error(`[DeribitBroker]   Transaction ID: ${transactionId}`);

      throw error;
    }
  }

  /**
   * BROKER-003: Rollback - cancel all orders in case of partial failure
   */
  private async rollbackOrders(orderIds: string[], transactionId: string): Promise<void> {
    console.log(`[DeribitBroker] 🔙 Rollback started for transaction: ${transactionId}`);
    
    let successCount = 0;
    let failCount = 0;

    // Cancel in reverse order (TP -> SL -> Entry) to reduce risk of leaving protectors
    for (const orderId of [...orderIds].reverse()) {
      try {
        await this.client.cancelOrder(orderId);
        successCount++;
        console.log(`[DeribitBroker] ✅ Rollback: Canceled order ${orderId}`);
      } catch (error) {
        failCount++;
        console.error(`[DeribitBroker] ❌ Rollback: Failed to cancel order ${orderId}:`, error);
      }
    }

    console.log(`[DeribitBroker] 🔙 Rollback complete: ${successCount} canceled, ${failCount} failed`);
    
    if (failCount > 0) {
  // Use warn so tests that spy on console.warn detect orphan alerts
  console.warn(`[DeribitBroker] ⚠️ ORPHAN ORDERS DETECTED: ${failCount} orders could not be canceled`);
  console.warn(`[DeribitBroker] Transaction ID: ${transactionId}`);
  console.warn(`[DeribitBroker] Manual intervention may be required`);
      // Also keep an error-level log for operators
      console.error(`[DeribitBroker] ❗ Orphan detection: ${failCount} failed to cancel. Transaction: ${transactionId}`);
      // TODO: Send Telegram alert
    }
  }

  async cancelOrder(orderId: string, instrument: string): Promise<void> {
    await this.client.cancelOrder(orderId);
    console.log(`[DeribitBroker] ✅ Order canceled: ${orderId}`);
  }

  async cancelAllOrders(instrument?: string): Promise<void> {
    // BackendDeribitClient doesn't have cancelAllOrders yet
    // Get all open orders and cancel them individually
    const orders = await this.getOpenOrders(instrument);
    
    for (const order of orders) {
      await this.cancelOrder(order.orderId, order.instrument);
    }
    
    console.log(`[DeribitBroker] ✅ All orders canceled (${orders.length} orders)`);
  }

  async getOrder(orderId: string, instrument: string): Promise<Order> {
    // Not implemented in BackendDeribitClient yet
    throw new Error('getOrder not implemented yet');
  }

  async getOpenOrders(instrument?: string): Promise<Order[]> {
    if (!instrument) {
      throw new Error('Instrument required for getOpenOrders');
    }

    const response = await this.client.getOpenOrders(instrument);
    
    return response.map(order => ({
      orderId: order.order_id,
      instrument: order.instrument_name,
      side: order.direction as 'buy' | 'sell',
      type: 'limit',
      amount: order.amount,
      price: order.price,
      filled: order.filled_amount || 0,
      status: this.mapOrderState(order.order_state),
      timestamp: order.creation_timestamp || Date.now(),
      label: order.label,
      ocoRef: order.oco_ref,
    }));
  }

  async getCandles(instrument: string, timeframe: string, limit: number = 50): Promise<Candle[]> {
    // Not implemented in BackendDeribitClient yet
    throw new Error('getCandles not implemented yet - use TradingView data');
  }

  async subscribeTrades(instrument: string, callback: (trade: Trade) => void): Promise<void> {
    // Not implemented in BackendDeribitClient yet
    throw new Error('subscribeTrades not implemented yet');
  }

  async subscribeOrders(instrument: string, callback: (order: Order) => void): Promise<void> {
    // Not implemented in BackendDeribitClient yet
    throw new Error('subscribeOrders not implemented yet');
  }

  async unsubscribe(channel: string): Promise<void> {
    // Not implemented in BackendDeribitClient yet
    throw new Error('unsubscribe not implemented yet');
  }

  async getInstrumentInfo(instrument: string): Promise<{
    minTradeAmount: number;
    tickSize: number;
    maxLeverage: number;
    amountStep: number;
  }> {
    const info = await this.getInstrumentInfoCached(instrument);
    
    return {
      minTradeAmount: info.minTradeAmount,
      tickSize: info.tickSize,
      maxLeverage: Math.min(info.maxLeverage, MAX_LEVERAGE), // Never report >50x
      amountStep: info.minTradeAmount,
    };
  }

  private mapOrderState(state: string): 'open' | 'filled' | 'cancelled' | 'rejected' {
    switch (state) {
      case 'open':
      case 'untriggered':
        return 'open';
      case 'filled':
        return 'filled';
      case 'cancelled':
        return 'cancelled';
      case 'rejected':
        return 'rejected';
      default:
        return 'open';
    }
  }

  // ============================================================================
  // Single Position Guard (GUARD-001)
  // ============================================================================

  /**
   * Check if there are any open positions
   * 
   * @param instrument - Optional: check specific instrument, otherwise check all
   * @returns true if no open positions, false if position(s) exist
   */
  async canOpenPosition(instrument?: string): Promise<boolean> {
    try {
      const hasPosition = await this.hasOpenPosition(instrument);
      
      if (hasPosition) {
        const msg = instrument 
          ? `Cannot open position: ${instrument} already has an open position`
          : 'Cannot open position: account already has an open position';
        console.warn(`[DeribitBroker] ⚠️ ${msg}`);
      }
      
      return !hasPosition;
    } catch (error) {
      console.error('[DeribitBroker] Error checking open positions:', error);
      throw error;
    }
  }

  /**
   * Check if there is an open position
   * 
   * @param instrument - Optional: check specific instrument, otherwise check all
   * @returns true if position exists, false otherwise
   */
  async hasOpenPosition(instrument?: string): Promise<boolean> {
    try {
      // Get all positions for BTC (most common on Deribit)
      const positions = await this.client.getPositions('BTC');
      
      // Filter for open positions (size !== 0)
      const openPositions = positions.filter(p => p.size !== 0);

      if (instrument) {
        // Check specific instrument
        const hasInstrumentPosition = openPositions.some(
          pos => pos.instrument_name === instrument
        );
        
        if (hasInstrumentPosition) {
          const pos = openPositions.find(p => p.instrument_name === instrument);
          console.log(`[DeribitBroker] Open position found on ${instrument}: size=${pos?.size}, entry=${pos?.average_price}`);
        }
        
        return hasInstrumentPosition;
      } else {
        // Check any position
        const hasAnyPosition = openPositions.length > 0;
        
        if (hasAnyPosition) {
          console.log(`[DeribitBroker] ${openPositions.length} open position(s) found:`, 
            openPositions.map(p => `${p.instrument_name} (size: ${p.size})`).join(', ')
          );
        }
        
        return hasAnyPosition;
      }
    } catch (error) {
      console.error('[DeribitBroker] Error in hasOpenPosition:', error);
      throw error;
    }
  }

  /**
   * Get all open positions
   * 
   * @returns Array of open positions with details
   */
  async getOpenPositions(): Promise<Array<{
    instrument: string;
    size: number;
    side: 'long' | 'short';
    entryPrice: number;
    markPrice: number;
    unrealizedPnl: number;
    leverage: number;
  }>> {
    try {
      const positions = await this.client.getPositions('BTC');
      const openPositions = positions.filter(p => p.size !== 0);

      return openPositions.map(pos => ({
        instrument: pos.instrument_name,
        size: Math.abs(pos.size),
        side: pos.size > 0 ? 'long' : 'short',
        entryPrice: pos.average_price,
        markPrice: pos.mark_price,
        unrealizedPnl: pos.total_profit_loss,
        leverage: pos.leverage || 0,
      }));
    } catch (error) {
      console.error('[DeribitBroker] Error getting open positions:', error);
      throw error;
    }
  }

  // ============================================================================
  // Risk-Managed OCO Order Placement (RISK-003)
  // ============================================================================

  /**
   * Place OCO order with automatic position sizing based on risk parameters
   * 
   * @param params - Trade parameters
   * @param params.instrument - Trading instrument (e.g., "BTC-PERPETUAL")
   * @param params.side - Trade side ("buy" or "sell")
   * @param params.entryPrice - Entry price (optional, uses market price if not provided)
   * @param params.stopLossPrice - Stop-loss price
   * @param params.takeProfitPrice - Take-profit price
   * @param params.riskPercent - Risk percentage (default: 5%)
   * @param params.maxLeverage - Maximum allowed leverage (default: 50x)
   * @returns Position size calculation and order IDs
   */
  async placeOCOWithRiskManagement(params: {
    instrument: string;
    side: 'buy' | 'sell';
    entryPrice?: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    riskPercent?: number;
    maxLeverage?: number;
  }): Promise<{
    positionSize: PositionSizeOutput;
    entryOrderId: string;
    stopLossOrderId: string;
    takeProfitOrderId: string;
    transactionId: string;
  }> {
    console.log(`[DeribitBroker] Placing risk-managed OCO order:`, params);

    // Step 0: Check if position can be opened (Single Position Guard)
    const canOpen = await this.canOpenPosition(params.instrument);
    if (!canOpen) {
      throw new OrderValidationError(
        `Cannot open position on ${params.instrument}: position already exists`,
        'POSITION_ALREADY_EXISTS',
        { instrument: params.instrument }
      );
    }

    // Step 1: Get current market price if entry price not provided
    const currentPrice = params.entryPrice || (await this.getCurrentPrice(params.instrument));

    // Step 2: Get account balance
    const balance = await this.getBalance();
    if (balance.length === 0) {
      throw new Error('No balance found');
    }

    // Use BTC balance (Deribit default)
    const btcBalance = balance.find(b => b.currency === 'BTC');
    if (!btcBalance) {
      throw new Error('BTC balance not found');
    }

    // Step 3: Calculate position size using PositionSizer
    const positionSizeInput: PositionSizeInput = {
      balance: btcBalance.available,
      balanceCurrency: 'BTC',
      entryPrice: currentPrice,
      stopLossPrice: params.stopLossPrice,
      riskPercent: params.riskPercent || 5,
      currentPrice: currentPrice,
      instrument: params.instrument,
      maxLeverage: params.maxLeverage || 50,
    };

    const positionSize = PositionSizer.calculatePositionSize(positionSizeInput);

    console.log(`[DeribitBroker] Calculated position size:`, {
      quantity: positionSize.quantity,
      leverage: positionSize.leverage,
      riskAmount: positionSize.riskAmountUSD,
      warnings: positionSize.warnings,
    });

    // Step 4: Validate calculated position size
    if (positionSize.warnings.length > 0) {
      console.warn(`[DeribitBroker] Position size warnings:`, positionSize.warnings);
    }

    // Step 5: Place OCO order with calculated size
    const ocoResult = await this.placeOCOOrder({
      instrument: params.instrument,
      side: params.side,
      amount: positionSize.quantity,
      price: currentPrice,
      type: 'limit',
      otocoConfig: {
        stopLoss: {
          type: 'stop_market',
          triggerPrice: params.stopLossPrice,
        },
        takeProfit: {
          type: 'take_limit',
          price: params.takeProfitPrice,
        },
      },
    });

    console.log(`[DeribitBroker] Risk-managed OCO order placed successfully`);

    return {
      positionSize,
      ...ocoResult,
    };
  }

  /**
   * Get current market price for an instrument
   */
  private async getCurrentPrice(instrument: string): Promise<number> {
    const ticker = await this.client.getTicker(instrument);
    return ticker.last_price;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' | 'error' {
    // BackendDeribitClient doesn't track connection status yet
    // For now, return always connected
    return 'connected';
  }

  /**
   * LIFECYCLE-002: Reconcile local state with broker state on startup
   * 
   * Queries broker for open positions and compares with local StrategyManager state.
   * Logs warnings if state mismatch detected.
   * 
   * @param autoCloseUnknown - If true, automatically close unknown positions
   * @returns Reconciliation result
   */
  async reconcileState(autoCloseUnknown: boolean = false): Promise<{
    hasOpenPosition: boolean;
    positionInstrument: string | null;
    localState: StrategyLifecycleState;
    stateMatch: boolean;
    warnings: string[];
  }> {
    console.log('[DeribitBroker] 🔄 Starting broker reconciliation...');

    const warnings: string[] = [];
    const strategyManager = StrategyManager.getInstance();
    const localState = strategyManager.getState();

    try {
      // Query Deribit for open positions
      const positions = await this.client.getPositions('BTC'); // TODO: support multi-asset
      const openPositions = positions.filter((p: any) => p.size !== 0);

      const hasOpenPosition = openPositions.length > 0;
      const positionInstrument = hasOpenPosition ? openPositions[0].instrument_name : null;

      console.log('[DeribitBroker] Broker state:', {
        hasOpenPosition,
        positionInstrument,
        positionCount: openPositions.length,
      });

      console.log('[DeribitBroker] Local state:', {
        state: localState.state,
        strategyName: localState.strategyName,
        instrument: localState.instrument,
      });

      // Check for state mismatch
      let stateMatch = true;

      // Case 1: Broker has position, but local state says IDLE or ANALYZING
      if (hasOpenPosition && (
        localState.state === StrategyLifecycleState.IDLE ||
        localState.state === StrategyLifecycleState.ANALYZING
      )) {
        const warning = `⚠️  MISMATCH: Broker has open position on ${positionInstrument}, but local state is ${localState.state}`;
        warnings.push(warning);
        console.warn(`[DeribitBroker] ${warning}`);
        stateMatch = false;

        if (autoCloseUnknown) {
          console.log(`[DeribitBroker] Auto-closing unknown position on ${positionInstrument}...`);
          try {
            // Close position by placing opposite market order
            const position = openPositions[0];
            const closeSide = position.direction === 'buy' ? 'sell' : 'buy';
            await this.client.placeOrder({
              instrument_name: positionInstrument!,
              amount: Math.abs(position.size),
              direction: closeSide,
              type: 'market',
              label: 'AUTO_CLOSE_UNKNOWN',
              reduce_only: true,
            });
            console.log(`[DeribitBroker] ✅ Unknown position closed`);
            warnings.push(`Auto-closed unknown position on ${positionInstrument}`);
          } catch (error) {
            const err = error as Error;
            console.error(`[DeribitBroker] ❌ Failed to auto-close position:`, err.message);
            warnings.push(`Failed to auto-close position: ${err.message}`);
          }
        }
      }

      // Case 2: Local state says POSITION_OPEN, but broker has no position
      if (!hasOpenPosition && localState.state === StrategyLifecycleState.POSITION_OPEN) {
        const warning = `⚠️  MISMATCH: Local state is POSITION_OPEN, but broker has no open position`;
        warnings.push(warning);
        console.warn(`[DeribitBroker] ${warning}`);
        stateMatch = false;

        // Suggest manual intervention
        console.warn(`[DeribitBroker] Manual action required: Run strategyManager.onPositionClosed() to sync state`);
        warnings.push(`Recommend calling strategyManager.onPositionClosed() to resume analyzing`);
      }

      // Case 3: Position instrument mismatch
      if (hasOpenPosition && localState.state === StrategyLifecycleState.POSITION_OPEN) {
        if (positionInstrument !== localState.instrument) {
          const warning = `⚠️  MISMATCH: Position instrument ${positionInstrument} != local instrument ${localState.instrument}`;
          warnings.push(warning);
          console.warn(`[DeribitBroker] ${warning}`);
          stateMatch = false;
        }
      }

      // Case 4: Multiple positions detected (should never happen with single position guard)
      if (openPositions.length > 1) {
        const warning = `⚠️  CRITICAL: Multiple open positions detected (${openPositions.length})! Single position guard violated!`;
        warnings.push(warning);
        console.error(`[DeribitBroker] ${warning}`);
        stateMatch = false;

        if (autoCloseUnknown) {
          console.log(`[DeribitBroker] Closing all positions except first...`);
          for (let i = 1; i < openPositions.length; i++) {
            try {
              const pos = openPositions[i];
              const closeSide = pos.direction === 'buy' ? 'sell' : 'buy';
              await this.client.placeOrder({
                instrument_name: pos.instrument_name,
                amount: Math.abs(pos.size),
                direction: closeSide,
                type: 'market',
                label: 'AUTO_CLOSE_DUPLICATE',
                reduce_only: true,
              });
              console.log(`[DeribitBroker] ✅ Closed duplicate position on ${pos.instrument_name}`);
            } catch (error) {
              const err = error as Error;
              console.error(`[DeribitBroker] ❌ Failed to close duplicate:`, err.message);
            }
          }
        }
      }

      // Summary
      if (stateMatch) {
        console.log('[DeribitBroker] ✅ Reconciliation complete: state is consistent');
      } else {
        console.warn('[DeribitBroker] ⚠️  Reconciliation complete: inconsistencies detected');
        console.warn('[DeribitBroker] Warnings:', warnings);
      }

      return {
        hasOpenPosition,
        positionInstrument,
        localState: localState.state,
        stateMatch,
        warnings,
      };
    } catch (error) {
      const err = error as Error;
      console.error('[DeribitBroker] ❌ Reconciliation failed:', err.message);
      warnings.push(`Reconciliation error: ${err.message}`);

      return {
        hasOpenPosition: false,
        positionInstrument: null,
        localState: localState.state,
        stateMatch: false,
        warnings,
      };
    }
  }
}

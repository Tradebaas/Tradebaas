/**
 * SimpleBracketManager - Streamlined bracket order management
 * 
 * DESIGN PHILOSOPHY:
 * - Simple is better than complex
 * - Fail fast with clear errors
 * - Always verify before acting
 * - Emergency close over orphaned orders
 * 
 * KEY SAFETY FEATURES:
 * 1. Entry verification BEFORE placing brackets
 * 2. Position verification (not just order state)
 * 3. Cleanup orphaned orders on startup
 * 4. Retry logic with exponential backoff
 * 5. Emergency close if brackets fail
 */

import type { DeribitClient } from '@/lib/deribitClient';

export interface BracketConfig {
  client: DeribitClient;
  instrument: string;
  tickSize: number;
  logger?: {
    info: (msg: string, meta?: any) => void;
    warn: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
  };
}

export interface BracketParams {
  side: 'buy' | 'sell';
  entryOrderId: string;
  quantity: number;
  entryPrice: number;
  stopPrice: number;
  takeProfitPrice: number;
}

export interface BracketResult {
  success: boolean;
  slOrderId?: string;
  tpOrderId?: string;
  error?: string;
}

const defaultLogger = {
  info: (msg: string, meta?: any) => console.log(`[BracketMgr] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[BracketMgr] ${msg}`, meta || ''),
  error: (msg: string, meta?: any) => console.error(`[BracketMgr] ${msg}`, meta || ''),
};

export class SimpleBracketManager {
  private client: DeribitClient;
  private instrument: string;
  private tickSize: number;
  private logger: typeof defaultLogger;

  constructor(config: BracketConfig) {
    this.client = config.client;
    this.instrument = config.instrument;
    this.tickSize = config.tickSize;
    this.logger = config.logger || defaultLogger;
  }

  /**
   * Attach SL and TP orders to an existing filled entry order
   * 
   * CRITICAL: This method assumes entry order is ALREADY FILLED
   * Caller MUST verify entry fill + position existence first!
   */
  async attachBrackets(params: BracketParams, maxRetries: number = 2): Promise<BracketResult> {
    const { side, entryOrderId, quantity, entryPrice, stopPrice, takeProfitPrice } = params;

    this.logger.info('🎯 Starting bracket attachment', {
      entryOrderId,
      side,
      quantity,
      entry: entryPrice.toFixed(2),
      sl: stopPrice.toFixed(2),
      tp: takeProfitPrice.toFixed(2),
    });

    // ============================================================================
    // STEP 1: VERIFY ENTRY ORDER IS FILLED
    // ============================================================================
    try {
      const orderState = await this.client.request('private/get_order_state', {
        order_id: entryOrderId,
      });

      if (orderState.order_state !== 'filled') {
        const error = `Entry order ${entryOrderId} not filled (state: ${orderState.order_state})`;
        this.logger.error('❌ Entry not filled - aborting bracket placement', { orderState });
        return { success: false, error };
      }

      this.logger.info('✅ Entry order verified as filled', { entryOrderId });
    } catch (verifyError) {
      const error = `Cannot verify entry order: ${verifyError}`;
      this.logger.error('❌ Entry verification failed', { verifyError });
      return { success: false, error };
    }

    // ============================================================================
    // STEP 2: VERIFY POSITION EXISTS
    // ============================================================================
    try {
      const positions = await this.client.request('private/get_positions', {
        currency: 'USDC',
      });

      const hasPosition = positions?.some((pos: any) => 
        pos.instrument_name === this.instrument && 
        Math.abs(pos.size || 0) > 0
      );

      if (!hasPosition) {
        const error = `No position found for ${this.instrument} despite filled entry order`;
        this.logger.error('❌ Position does not exist - aborting', { instrument: this.instrument });
        return { success: false, error };
      }

      this.logger.info('✅ Position verified', { instrument: this.instrument });
    } catch (posError) {
      const error = `Cannot verify position: ${posError}`;
      this.logger.error('❌ Position verification failed', { posError });
      return { success: false, error };
    }

    // ============================================================================
    // STEP 3: CLEANUP ORPHANED TRIGGER ORDERS (if any)
    // ============================================================================
    try {
      await this.cleanupOrphanedTriggers();
      await new Promise(resolve => setTimeout(resolve, 200)); // Let cleanup settle
    } catch (cleanupError) {
      this.logger.warn('⚠️ Cleanup warning (continuing)', { cleanupError });
    }

    // ============================================================================
    // STEP 4: CHECK TRIGGER ORDER LIMIT
    // ============================================================================
    try {
      const openOrders = await this.client.request('private/get_open_orders_by_instrument', {
        instrument_name: this.instrument,
      });

      const triggerCount = openOrders?.filter((o: any) => 
        o.trigger && ['stop_market', 'stop_limit', 'take_limit', 'take_market'].includes(o.order_type)
      ).length || 0;

      if (triggerCount >= 8) {
        const error = `Too many trigger orders (${triggerCount}/10) - cannot place SL+TP safely`;
        this.logger.error('❌ Trigger limit reached', { triggerCount });
        return { success: false, error };
      }

      this.logger.info('✅ Trigger slot check passed', { current: triggerCount, limit: 10 });
    } catch (limitError) {
      this.logger.warn('⚠️ Could not check trigger limit (continuing)', { limitError });
    }

    // ============================================================================
    // STEP 5: PLACE SL AND TP WITH RETRY LOGIC
    // ============================================================================
    let slOrderId: string | undefined;
    let tpOrderId: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info(`📍 Attempt ${attempt}/${maxRetries} - Placing brackets`);

        // Place SL first (most critical for protection)
        slOrderId = await this.placeSL(side, quantity, stopPrice);
        this.logger.info('✅ SL placed', { orderId: slOrderId, price: stopPrice.toFixed(2) });

        // Small delay between orders
        await new Promise(resolve => setTimeout(resolve, 300));

        // Place TP
        tpOrderId = await this.placeTP(side, quantity, takeProfitPrice);
        this.logger.info('✅ TP placed', { orderId: tpOrderId, price: takeProfitPrice.toFixed(2) });

        // Success!
        this.logger.info('✅✅✅ BRACKETS SUCCESSFULLY PLACED', { slOrderId, tpOrderId });
        return { success: true, slOrderId, tpOrderId };

      } catch (bracketError) {
        this.logger.error(`❌ Bracket placement failed (attempt ${attempt}/${maxRetries})`, {
          error: bracketError,
          slOrderId,
          tpOrderId,
        });

        // Cleanup partial brackets
        if (slOrderId) {
          await this.cancelOrder(slOrderId, 'Partial SL cleanup');
          slOrderId = undefined;
        }
        if (tpOrderId) {
          await this.cancelOrder(tpOrderId, 'Partial TP cleanup');
          tpOrderId = undefined;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const backoffMs = 500 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // All retries failed
    const error = `Failed to place brackets after ${maxRetries} attempts`;
    this.logger.error('❌❌❌ BRACKET PLACEMENT FAILED AFTER ALL RETRIES', {
      attempts: maxRetries,
      lastError: error,
    });

    return { success: false, error };
  }

  /**
   * Cancel specific order with retry logic
   */
  async cancelOrder(orderId: string, reason?: string): Promise<boolean> {
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.client.request('private/cancel', { order_id: orderId });
        this.logger.info(`✅ Cancelled order`, { orderId, reason, attempt });
        return true;
      } catch (error) {
        this.logger.warn(`⚠️ Cancel attempt ${attempt}/${maxAttempts} failed`, {
          orderId,
          error,
        });

        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }

    this.logger.error('❌ Failed to cancel order after all attempts', { orderId });
    return false;
  }

  /**
   * Cancel all open orders for instrument
   */
  async cancelAllOrders(): Promise<void> {
    try {
      const openOrders = await this.client.request('private/get_open_orders_by_instrument', {
        instrument_name: this.instrument,
      });

      if (!openOrders || openOrders.length === 0) {
        this.logger.info('No orders to cancel');
        return;
      }

      this.logger.info(`Cancelling ${openOrders.length} open orders`);

      for (const order of openOrders) {
        await this.cancelOrder(order.order_id, 'Cleanup');
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit friendly
      }
    } catch (error) {
      this.logger.error('Failed to cancel all orders', { error });
    }
  }

  /**
   * Emergency: Close position immediately with market order
   */
  async emergencyClosePosition(
    side: 'buy' | 'sell',
    quantity: number,
    reason: string
  ): Promise<boolean> {
    this.logger.error('⚠️⚠️⚠️ EMERGENCY POSITION CLOSE', {
      side,
      quantity,
      reason,
    });

    const closeDirection = side === 'buy' ? 'sell' : 'buy';

    try {
      await this.client.request(`private/${closeDirection}`, {
        instrument_name: this.instrument,
        amount: quantity,
        type: 'market',
        reduce_only: true,
      });

      this.logger.info('✅ Emergency close executed');
      return true;
    } catch (error) {
      this.logger.error('❌❌❌ EMERGENCY CLOSE FAILED - MANUAL INTERVENTION REQUIRED', {
        error,
        instrument: this.instrument,
        side,
        quantity,
      });
      return false;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async placeSL(side: 'buy' | 'sell', quantity: number, stopPrice: number): Promise<string> {
    const direction = side === 'buy' ? 'sell' : 'buy';
    const roundedPrice = this.roundToTick(stopPrice);

    const response = await this.client.request<{ order: any }>(`private/${direction}`, {
      instrument_name: this.instrument,
      amount: quantity,
      type: 'stop_market',
      trigger: 'mark_price',
      trigger_price: roundedPrice,
      reduce_only: true,
    });

    if (!response?.order?.order_id) {
      throw new Error('SL order response missing order_id');
    }

    // Verify order was actually placed
    await new Promise(resolve => setTimeout(resolve, 100));
    const verification = await this.client.request('private/get_order_state', {
      order_id: response.order.order_id,
    });

    if (!verification || ['cancelled', 'rejected'].includes(verification.order_state)) {
      throw new Error(`SL order ${response.order.order_id} was rejected (state: ${verification?.order_state})`);
    }

    return response.order.order_id;
  }

  private async placeTP(side: 'buy' | 'sell', quantity: number, tpPrice: number): Promise<string> {
    const direction = side === 'buy' ? 'sell' : 'buy';
    const roundedPrice = this.roundToTick(tpPrice);

    const response = await this.client.request<{ order: any }>(`private/${direction}`, {
      instrument_name: this.instrument,
      amount: quantity,
      type: 'limit',
      price: roundedPrice,
      reduce_only: true,
      post_only: false,
    });

    if (!response?.order?.order_id) {
      throw new Error('TP order response missing order_id');
    }

    // Verify order was actually placed
    await new Promise(resolve => setTimeout(resolve, 100));
    const verification = await this.client.request('private/get_order_state', {
      order_id: response.order.order_id,
    });

    if (!verification || ['cancelled', 'rejected'].includes(verification.order_state)) {
      throw new Error(`TP order ${response.order.order_id} was rejected (state: ${verification?.order_state})`);
    }

    return response.order.order_id;
  }

  private async cleanupOrphanedTriggers(): Promise<void> {
    try {
      const openOrders = await this.client.request('private/get_open_orders_by_instrument', {
        instrument_name: this.instrument,
      });

      if (!openOrders || openOrders.length === 0) {
        return;
      }

      const positions = await this.client.request('private/get_positions', {
        currency: 'USDC',
      });

      const hasPosition = positions?.some((pos: any) => 
        pos.instrument_name === this.instrument && Math.abs(pos.size || 0) > 0
      );

      // If no position exists, cancel all trigger orders
      if (!hasPosition) {
        const triggerOrders = openOrders.filter((order: any) => 
          order.trigger && ['stop_market', 'stop_limit', 'take_limit', 'take_market'].includes(order.order_type)
        );

        if (triggerOrders.length > 0) {
          this.logger.info(`🧹 Cleaning ${triggerOrders.length} orphaned trigger orders`);

          for (const order of triggerOrders) {
            await this.cancelOrder(order.order_id, 'Orphaned trigger');
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }
    } catch (error) {
      this.logger.warn('Cleanup error', { error });
    }
  }

  private roundToTick(price: number): number {
    return Math.round(price / this.tickSize) * this.tickSize;
  }
}

/**
 * Factory function for easy instantiation
 */
export function createBracketManager(config: BracketConfig): SimpleBracketManager {
  return new SimpleBracketManager(config);
}

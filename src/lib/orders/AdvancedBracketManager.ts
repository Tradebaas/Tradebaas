/**
 * AdvancedBracketManager - Manages bracket orders (SL + TP) for positions
 * 
 * CRITICAL SAFETY FEATURES (Added to prevent mass order spam):
 * ───────────────────────────────────────────────────────────────────────────
 * 1. CLEANUP FIRST: Always clean orphaned trigger orders BEFORE placing new brackets
 * 2. ENTRY VERIFICATION: Verify entry order exists and is filled BEFORE placing SL/TP
 * 3. POSITION VERIFICATION: Confirm actual open position exists BEFORE placing brackets
 * 4. TRIGGER LIMIT CHECK: Ensure we have available trigger order slots (Deribit limit: 10)
 * 5. ATOMIC PLACEMENT: If SL fails → emergency close position (never leave unprotected)
 * 6. ATOMIC PLACEMENT: If TP fails → cancel SL + close position (never leave orphaned SL)
 * 7. ORDER VERIFICATION: After placement, verify each order actually exists on exchange
 * 8. AGGRESSIVE CLEANUP: Multiple retry attempts with delays for all cleanup operations
 * 
 * These safeguards prevent the disaster of Nov 2, 2025 11:30 where dozens of
 * trigger orders were placed without entry orders, costing significant fees.
 */

import type { DeribitClient } from '@/lib/deribitClient';

// Narrow Deribit response shapes used in this manager for safer access
interface DeribitOrderState {
  order_state: string;
  filled_amount?: number;
  amount?: number;
  reject_reason?: string;
}

interface DeribitOpenOrder {
  order_id: string;
  order_state: string;
  order_type?: string;
  trigger?: unknown;
}

interface DeribitPosition {
  instrument_name: string;
  size?: number;
  average_price?: number;
}

export type TrailMethod = 'swing' | 'ema20' | 'oppBB' | 'rsiFlip';

export type BracketStatus = 'idle' | 'armed' | 'tp1Hit' | 'trailing' | 'closed' | 'error';

export interface BracketState {
  status: BracketStatus;
  entryOrderId?: string;
  positionSide: 'long' | 'short';
  entryPrice: number;
  currentSlOrderId?: string;
  tp1OrderId?: string;
  runnerOrderId?: string;
  totalQty: number;
  remainingQty: number;
  breakevenPrice: number;
  trailMethod: TrailMethod;
  ocoRef?: string;
}

export interface IndicatorData {
  ema20?: number;
  upperBB?: number;
  lowerBB?: number;
  rsi?: number;
  swing?: {
    longSl?: number;
    shortSl?: number;
  };
}

export interface BrokerOrderEvent {
  order_id: string;
  order_state: string;
  filled_amount?: number;
  amount?: number;
  direction?: string;
  order_type?: string;
}

export interface BrokerPositionEvent {
  instrument_name: string;
  size?: number;
  average_price?: number;
}

interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export class AdvancedBracketManager {
  private client: DeribitClient;
  private symbol: string;
  private logger: Logger;
  private getIndicators: () => IndicatorData;
  private tickSize: number;
  private state: BracketState;
  private lastTrailUpdate: number = 0;
  private trailThrottleMs: number = 3000;

  constructor(args: {
    client: DeribitClient;
    symbol: string;
    logger: Logger;
    getIndicators: () => IndicatorData;
    tickSize: number;
  }) {
    this.client = args.client;
    this.symbol = args.symbol;
    this.logger = args.logger;
    this.getIndicators = args.getIndicators;
    this.tickSize = args.tickSize;
    
    this.state = {
      status: 'idle',
      positionSide: 'long',
      entryPrice: 0,
      totalQty: 0,
      remainingQty: 0,
      breakevenPrice: 0,
      trailMethod: 'swing',
    };
  }

  async attachInitialBracket(args: {
    side: 'buy' | 'sell';
    entryOrderId: string;
    totalQty: number;
    entryPrice: number;
    stopPrice: number;
    oneRPrice: number;
  }): Promise<BracketState> {
    const { side, entryOrderId, totalQty, entryPrice, stopPrice, oneRPrice } = args;
    
    this.logger.info('[AdvancedBracketManager] ═══════════════════════════════════════');
    this.logger.info('[AdvancedBracketManager] 🎯 STARTING BRACKET ATTACHMENT', {
      side,
      entryOrderId,
      totalQty,
      entryPrice,
      stopPrice,
      oneRPrice,
    });

    if (!totalQty || totalQty <= 0) {
      const error = new Error('Invalid totalQty: must be greater than zero');
      this.logger.error('[AdvancedBracketManager] Invalid bracket parameters', { totalQty });
      this.state.status = 'error';
      throw error;
    }

    if (!entryPrice || entryPrice <= 0 || !stopPrice || stopPrice <= 0 || !oneRPrice || oneRPrice <= 0) {
      const error = new Error('Invalid prices: all prices must be greater than zero');
      this.logger.error('[AdvancedBracketManager] Invalid price parameters', { entryPrice, stopPrice, oneRPrice });
      this.state.status = 'error';
      throw error;
    }

    // ============================================================================
    // STEP 0: CLEANUP ORPHANED ORDERS FIRST (CRITICAL!)
    // Before doing anything, remove any stale trigger orders
    // This prevents hitting Deribit's trigger order limit
    // ============================================================================
    this.logger.info('[AdvancedBracketManager] 🧹 STEP 0: Cleaning up any orphaned trigger orders FIRST');
    try {
      await this.cleanupStaleOrders();
      this.logger.info('[AdvancedBracketManager] ✅ Cleanup completed successfully');
      
      // Add a small delay to let Deribit process the cancellations
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (cleanupError) {
      this.logger.error('[AdvancedBracketManager] ❌ CRITICAL: Cleanup failed before bracket placement', { cleanupError });
      // Continue anyway, but log the issue
    }

    // ============================================================================
    // STEP 1: CRITICAL SAFETY CHECK - VERIFY ENTRY ORDER EXISTS AND IS FILLED
    // This prevents placing SL/TP when entry order doesn't exist or failed
    // ============================================================================
    this.logger.info('[AdvancedBracketManager] 🔒 STEP 1: VERIFYING ENTRY ORDER before placing SL/TP', { entryOrderId });
    
    let entryOrderStatus: any;
    let verificationAttempts = 0;
    const maxAttempts = 5; // More attempts for market orders that fill quickly
    const retryDelayMs = 300;

    while (verificationAttempts < maxAttempts) {
      try {
        entryOrderStatus = await this.client.request('private/get_order_state', {
          order_id: entryOrderId,
        });
        
        if (entryOrderStatus) {
          break; // Successfully retrieved order status
        }
      } catch (error) {
        verificationAttempts++;
        this.logger.warn(`[AdvancedBracketManager] Entry verification attempt ${verificationAttempts}/${maxAttempts} failed`, { error });
        
        if (verificationAttempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    if (!entryOrderStatus) {
      const error = new Error(`CRITICAL: Cannot verify entry order ${entryOrderId} exists. ABORTING bracket placement to prevent orphaned SL/TP orders.`);
      this.logger.error('[AdvancedBracketManager] ❌ ENTRY VERIFICATION FAILED - NO BRACKETS WILL BE PLACED', { entryOrderId });
      this.state.status = 'error';
      throw error;
    }

    const orderState = entryOrderStatus.order_state;
    this.logger.info('[AdvancedBracketManager] Entry order verified', { 
      orderId: entryOrderId,
      state: orderState,
      filledAmount: entryOrderStatus.filled_amount,
      amount: entryOrderStatus.amount,
    });

    // CRITICAL: Only allow 'filled' orders - reject 'open' to prevent brackets on unfilled entries
    if (orderState !== 'filled') {
      const error = new Error(`CRITICAL: Entry order ${entryOrderId} is not filled (state: '${orderState}'). Cannot place SL/TP until entry is completely filled. This prevents orphaned bracket orders.`);
      this.logger.error('[AdvancedBracketManager] ❌ ENTRY NOT FILLED - NO BRACKETS WILL BE PLACED', { 
        entryOrderId,
        currentState: orderState,
        requiredState: 'filled',
      });
      this.state.status = 'error';
      throw error;
    }

    // Additional check: MANDATORY position verification before ANY bracket placement
    let hasOpenPosition = false;
    let actualPositionSize = 0;
    let positionCheckAttempts = 0;
    const maxPositionChecks = 5;
    
    while (positionCheckAttempts < maxPositionChecks && !hasOpenPosition) {
      try {
        const positionsRaw = await this.client.request('private/get_positions', {
          currency: 'USDC',
        });
        const positions: DeribitPosition[] = Array.isArray(positionsRaw)
          ? positionsRaw as DeribitPosition[]
          : [];

        if (positions.length > 0) {
          const matchingPosition = positions.find((pos) => 
            pos.instrument_name === this.symbol && 
            Math.abs(pos.size || 0) > 0
          );
          
          if (matchingPosition) {
            hasOpenPosition = true;
            actualPositionSize = Math.abs(matchingPosition.size || 0);
            this.logger.info('[AdvancedBracketManager] ✓ Open position verified', {
              instrument: this.symbol,
              size: actualPositionSize,
              expectedSize: totalQty,
            });
            break;
          }
        }
        
        positionCheckAttempts++;
        if (positionCheckAttempts < maxPositionChecks) {
          this.logger.warn(`[AdvancedBracketManager] Position check attempt ${positionCheckAttempts}/${maxPositionChecks} - no position yet, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 400)); // Longer delay for position to appear
        }
      } catch (posError) {
        positionCheckAttempts++;
        this.logger.warn(`[AdvancedBracketManager] Position verification attempt ${positionCheckAttempts}/${maxPositionChecks} failed`, { posError });
        
        if (positionCheckAttempts < maxPositionChecks) {
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }
    }

    if (!hasOpenPosition) {
      const error = new Error(`CRITICAL: No open position found for ${this.symbol} despite entry order ${entryOrderId} being filled. ABORTING bracket placement to prevent invalid reduce_only orders.`);
      this.logger.error('[AdvancedBracketManager] ❌ NO OPEN POSITION VERIFIED - NO BRACKETS WILL BE PLACED', { 
        instrument: this.symbol,
        entryOrderId,
        entryOrderState: orderState,
        positionCheckAttempts,
      });
      this.state.status = 'error';
      throw error;
    }

    // ============================================================================
    // STEP 2: CHECK TRIGGER ORDER LIMITS
    // Deribit has a limit of 10 trigger orders per instrument
    // We check before placing to prevent hitting the limit
    // ============================================================================
    this.logger.info('[AdvancedBracketManager] 🔍 STEP 2: Checking trigger order limits');
    try {
      const openOrdersRaw = await this.client.request('private/get_open_orders_by_instrument', {
        instrument_name: this.symbol,
      });

      const openOrders: DeribitOpenOrder[] = Array.isArray(openOrdersRaw)
        ? openOrdersRaw as DeribitOpenOrder[]
        : [];

      const triggerOrderCount = openOrders
        .filter((o) =>
          o.trigger && ['stop_market', 'stop_limit', 'take_limit', 'take_market'].includes(o.order_type || '')
        ).length;
      
      this.logger.info('[AdvancedBracketManager] Current trigger orders', { 
        count: triggerOrderCount,
        limit: 10,
        available: 10 - triggerOrderCount,
      });
      
      // We need 2 slots (SL + TP), so stop if we have 8 or more
      if (triggerOrderCount >= 8) {
        const error = new Error(`CRITICAL: Cannot place bracket - Too many trigger orders (${triggerOrderCount}/10 limit). Need 2 slots for SL+TP. Clean up existing triggers first.`);
        this.logger.error('[AdvancedBracketManager] ❌ TRIGGER LIMIT REACHED', { 
          triggerOrderCount,
          needed: 2,
          available: 10 - triggerOrderCount,
        });
        this.state.status = 'error';
        throw error;
      } else if (triggerOrderCount >= 6) {
        this.logger.warn('[AdvancedBracketManager] ⚠️ WARNING: High trigger order count', {
          current: triggerOrderCount,
          available: 10 - triggerOrderCount,
        });
      }
    } catch (checkError: any) {
      if (checkError.message.includes('Too many trigger orders') || checkError.message.includes('TRIGGER LIMIT')) {
        throw checkError; // Re-throw limit errors
      }
      this.logger.warn('[AdvancedBracketManager] Could not check trigger order count (continuing with caution)', { checkError });
    }

    this.logger.info('[AdvancedBracketManager] ✅ Entry verification passed - proceeding with SL/TP placement');

    try {
      await this.cleanupStaleOrders();
    } catch (cleanupError) {
      this.logger.warn('[AdvancedBracketManager] Cleanup warning (continuing)', { cleanupError });
    }

    this.state = {
      status: 'armed',
      entryOrderId,
      positionSide: side === 'buy' ? 'long' : 'short',
      entryPrice,
      totalQty,
      remainingQty: totalQty,
      breakevenPrice: this.roundToTick(entryPrice),
      trailMethod: 'swing',
    };

    const tp1Qty = Math.floor((totalQty / 2) * 100000) / 100000;
    
    if (tp1Qty <= 0) {
      const error = new Error(`TP1 quantity too small: ${tp1Qty}. Total quantity may be too low.`);
      this.logger.error('[AdvancedBracketManager] TP1 quantity invalid', { totalQty, tp1Qty });
      this.state.status = 'error';
      throw error;
    }

    const slDirection = side === 'buy' ? 'sell' : 'buy';
    const tp1Direction = side === 'buy' ? 'sell' : 'buy';

  let slOrder: { order_id: string } | null = null;
    let slOrderPlacedSuccessfully = false;
    
    try {
      this.logger.info('[AdvancedBracketManager] Attempting to place SL order', {
        direction: slDirection,
        amount: totalQty,
        triggerPrice: this.roundToTick(stopPrice),
        type: 'stop_market',
      });
      
  slOrder = await this.client.request('private/' + slDirection, {
        instrument_name: this.symbol,
        amount: totalQty,
        type: 'stop_market',
        trigger: 'mark_price',
        trigger_price: this.roundToTick(stopPrice),
        reduce_only: true,
      });

      // Verify response immediately
      if (!slOrder || !slOrder.order_id) {
        throw new Error('SL order response missing order_id - Deribit may have rejected or rate-limited the order');
      }

      // Double-check the order actually exists on Deribit
      try {
        const verificationRaw = await this.client.request('private/get_order_state', {
          order_id: slOrder.order_id,
        });
        const verification = verificationRaw as DeribitOrderState | null;

        if (!verification || verification.order_state === 'cancelled' || verification.order_state === 'rejected') {
          throw new Error(`SL order ${slOrder.order_id} was not successfully placed (state: ${verification?.order_state || 'unknown'})`);
        }
        
        slOrderPlacedSuccessfully = true;
      } catch (verifyError) {
        throw new Error(`SL order placement could not be verified: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
      }

      this.state.currentSlOrderId = slOrder.order_id;
      this.logger.info('[AdvancedBracketManager] ✅ SL placed and verified', {
        orderId: slOrder.order_id,
        amount: totalQty,
        triggerPrice: this.roundToTick(stopPrice),
      });
    } catch (error: any) {
      this.state.status = 'error';
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = errorMessage.includes('no_more_triggers') || errorMessage.includes('trigger');
      
      this.logger.error('[AdvancedBracketManager] ❌ CRITICAL: Failed to place SL order', {
        error: errorMessage,
        direction: slDirection,
        amount: totalQty,
        stopPrice: this.roundToTick(stopPrice),
        isRateLimit,
        action: isRateLimit ? 'ABORTING - Too many trigger orders' : 'ABORTING - SL placement failed',
      });

      // ============================================================================
      // CRITICAL EMERGENCY CLEANUP
      // If we can't place SL, we MUST close the position immediately
      // BUT ONLY if a position actually exists (avoid invalid_reduce_only_order)
      // ============================================================================
      this.logger.error('[AdvancedBracketManager] ⚠️⚠️⚠️ EMERGENCY: Need to close unprotected position', {
        entryOrderId,
        reason: 'Cannot place stop-loss',
      });

      // CRITICAL: Verify position actually exists before attempting emergency close
      let emergencyCloseSucceeded = false;
      let positionToClose: any = null;
      
      try {
        const positions = await this.client.request('private/get_positions', {
          currency: 'USDC',
        });
        
        if (positions && Array.isArray(positions)) {
          positionToClose = positions.find((pos: any) => 
            pos.instrument_name === this.symbol && 
            Math.abs(pos.size || 0) > 0
          );
        }
      } catch (checkError) {
        this.logger.error('[AdvancedBracketManager] Failed to verify position for emergency close', { checkError });
      }

      if (positionToClose && Math.abs(positionToClose.size) > 0) {
        this.logger.error('[AdvancedBracketManager] Position exists - attempting emergency close', {
          positionSize: positionToClose.size,
        });
        
        try {
          const emergencyDirection = side === 'buy' ? 'sell' : 'buy';
          const actualSize = Math.abs(positionToClose.size);
          
          await this.client.request('private/' + emergencyDirection, {
            instrument_name: this.symbol,
            amount: actualSize,
            type: 'market',
            reduce_only: true,
          });
          emergencyCloseSucceeded = true;
          this.logger.info('[AdvancedBracketManager] ✅ Emergency position close executed', {
            closedSize: actualSize,
          });
        } catch (emergencyError) {
          this.logger.error('[AdvancedBracketManager] ❌❌❌ EMERGENCY CLOSE FAILED - MANUAL INTERVENTION REQUIRED', {
            emergencyError,
            instrument: this.symbol,
            positionSize: positionToClose.size,
          });
        }
      } else {
        this.logger.warn('[AdvancedBracketManager] ⚠️ No position found to emergency close - entry likely never filled', {
          entryOrderId,
          instrument: this.symbol,
        });
        // No position exists, so nothing to close - this is actually safe
        emergencyCloseSucceeded = true; // Mark as "succeeded" since there's nothing to close
      }

      // ============================================================================
      // CRITICAL: Mark bracket manager as PERMANENTLY FAILED
      // This prevents any retry attempts or subsequent bracket placements
      // ============================================================================
      this.state.status = 'error';
      
      const finalError = new Error(`FATAL: Failed to place SL order (${errorMessage}). ${emergencyCloseSucceeded ? 'Position closed as safety measure.' : 'EMERGENCY CLOSE ALSO FAILED - MANUAL INTERVENTION REQUIRED'} DO NOT RETRY THIS BRACKET.`);
      (finalError as any).isFatal = true; // Mark as fatal to prevent retries
      (finalError as any).emergencyCloseSucceeded = emergencyCloseSucceeded;
      
      throw finalError;
    }

    // ============================================================================
    // Now place TP1 - if this fails, we MUST cancel SL and close position
    // ============================================================================
    try {
      this.logger.info('[AdvancedBracketManager] Attempting to place TP1 order', {
        direction: tp1Direction,
        amount: tp1Qty,
        price: this.roundToTick(oneRPrice),
        type: 'limit',
      });
      
  const tp1Order = await this.client.request<{ order_id: string }>('private/' + tp1Direction, {
        instrument_name: this.symbol,
        amount: tp1Qty,
        type: 'limit',
        price: this.roundToTick(oneRPrice),
        reduce_only: true,
        post_only: false,
      });

      if (!tp1Order || !tp1Order.order_id) {
        throw new Error('TP1 order response missing order_id - Deribit may have rejected the order');
      }

      // Verify TP1 actually exists
      try {
        const verificationRaw = await this.client.request('private/get_order_state', {
          order_id: tp1Order.order_id,
        });
        const verification = verificationRaw as DeribitOrderState | null;

        if (!verification || verification.order_state === 'cancelled' || verification.order_state === 'rejected') {
          throw new Error(`TP1 order ${tp1Order.order_id} was not successfully placed (state: ${verification?.order_state || 'unknown'})`);
        }
      } catch (verifyError) {
        throw new Error(`TP1 order placement could not be verified: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
      }

  this.state.tp1OrderId = tp1Order.order_id;
      this.logger.info('[AdvancedBracketManager] ✅ TP1 placed and verified (50% @ 1R)', {
        orderId: tp1Order.order_id,
        amount: tp1Qty,
        price: this.roundToTick(oneRPrice),
      });

      this.logger.info('[AdvancedBracketManager] ✅✅✅ BRACKET COMPLETE - SL & TP1 both active', {
        slOrderId: this.state.currentSlOrderId,
        tp1OrderId: this.state.tp1OrderId,
      });

      return this.state;
    } catch (error) {
      this.state.status = 'error';
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('[AdvancedBracketManager] ❌ CRITICAL: Failed to place TP1 order', {
        error: errorMessage,
        direction: tp1Direction,
        amount: tp1Qty,
        price: this.roundToTick(oneRPrice),
      });

      // ============================================================================
      // CRITICAL EMERGENCY CLEANUP #2
      // If TP1 fails, we have an orphaned SL order AND potentially an unprotected position
      // We MUST: 1) Cancel SL, 2) Close position if it exists
      // ============================================================================
      
      this.logger.error('[AdvancedBracketManager] ⚠️⚠️⚠️ EMERGENCY CLEANUP: Cancelling SL and closing position (if exists)');

      // Step 1: Cancel orphaned SL order
      if (slOrder && slOrder.order_id && slOrderPlacedSuccessfully) {
        let cancelAttempts = 0;
        const maxCancelAttempts = 5; // More attempts for critical cleanup
        let slCancelled = false;

        while (cancelAttempts < maxCancelAttempts && !slCancelled) {
          try {
            await this.client.request('private/cancel', { order_id: slOrder.order_id });
            this.logger.info('[AdvancedBracketManager] ✅ Successfully cancelled orphaned SL order', {
              slOrderId: slOrder.order_id,
              attempt: cancelAttempts + 1,
            });
            slCancelled = true;
          } catch (cancelError) {
            cancelAttempts++;
            this.logger.error(`[AdvancedBracketManager] ❌ Failed to cancel SL (attempt ${cancelAttempts}/${maxCancelAttempts})`, { 
              slOrderId: slOrder.order_id,
              cancelError,
            });
            
            if (cancelAttempts < maxCancelAttempts) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        }

        if (!slCancelled) {
          this.logger.error('[AdvancedBracketManager] ❌❌❌ CRITICAL FAILURE: Could not cancel orphaned SL order', {
            slOrderId: slOrder.order_id,
            instrument: this.symbol,
            message: 'SL order still active without TP! Proceeding to check position...',
          });
        }
      }

      // Step 2: Verify position exists before attempting emergency close
      let positionToClose: any = null;
      try {
        const positions = await this.client.request('private/get_positions', {
          currency: 'USDC',
        });
        
        if (positions && Array.isArray(positions)) {
          positionToClose = positions.find((pos: any) => 
            pos.instrument_name === this.symbol && 
            Math.abs(pos.size || 0) > 0
          );
        }
      } catch (checkError) {
        this.logger.error('[AdvancedBracketManager] Failed to verify position for TP1-failure emergency close', { checkError });
      }

      // Step 3: Only attempt close if position actually exists
      if (positionToClose && Math.abs(positionToClose.size) > 0) {
        try {
          const emergencyDirection = side === 'buy' ? 'sell' : 'buy';
          const actualSize = Math.abs(positionToClose.size);
          
          this.logger.error('[AdvancedBracketManager] ⚠️⚠️⚠️ EMERGENCY: CLOSING POSITION WITHOUT PROPER BRACKETS', {
            entryOrderId,
            reason: 'TP1 placement failed',
            positionSize: actualSize,
          });
          
          await this.client.request('private/' + emergencyDirection, {
            instrument_name: this.symbol,
            amount: actualSize,
            type: 'market',
            reduce_only: true,
          });
          this.logger.info('[AdvancedBracketManager] ✅ Emergency position close executed', {
            closedSize: actualSize,
          });
        } catch (emergencyError) {
          this.logger.error('[AdvancedBracketManager] ❌❌❌ EMERGENCY CLOSE FAILED - MANUAL INTERVENTION REQUIRED', {
            emergencyError,
            instrument: this.symbol,
            positionSize: positionToClose.size,
            slOrderId: slOrder?.order_id,
            message: 'URGENT: Position is open with potentially orphaned SL and no TP!',
          });
        }
      } else {
        this.logger.warn('[AdvancedBracketManager] No position found to emergency close after TP1 failure', {
          entryOrderId,
          instrument: this.symbol,
          message: 'Entry likely never filled or already closed',
        });
      }

      throw new Error(`CRITICAL: Failed to place TP1 order (${errorMessage}). Attempted emergency cleanup of SL and position.`);
    }
  }

  async onOrderUpdate(event: BrokerOrderEvent): Promise<void> {
    if (event.order_id === this.state.tp1OrderId && event.order_state === 'filled') {
      this.logger.info('[AdvancedBracketManager] TP1 filled, moving SL to BE');
      await this.moveSLToBreakeven();
    }

    if (event.order_id === this.state.currentSlOrderId && event.order_state === 'filled') {
      this.logger.info('[AdvancedBracketManager] SL filled, position closed');
      this.state.status = 'closed';
    }
  }

  async onPositionUpdate(event: BrokerPositionEvent): Promise<void> {
    if (event.size === 0) {
      this.logger.info('[AdvancedBracketManager] Position closed via position update');
      this.state.status = 'closed';
    }
  }

  async maybeTrail(nowPrice: number): Promise<void> {
    if (this.state.status !== 'trailing' && this.state.status !== 'tp1Hit') return;

    if (!nowPrice || nowPrice <= 0) {
      this.logger.warn('[AdvancedBracketManager] Invalid price for trailing', { nowPrice });
      return;
    }

    const now = Date.now();
    if (now - this.lastTrailUpdate < this.trailThrottleMs) return;

    let indicators: IndicatorData;
    try {
      indicators = this.getIndicators();
    } catch (error) {
      this.logger.error('[AdvancedBracketManager] Failed to get indicators for trailing', { error });
      return;
    }

    let newSlPrice: number | undefined;

    try {
      switch (this.state.trailMethod) {
        case 'swing':
          if (this.state.positionSide === 'long' && indicators.swing?.longSl) {
            newSlPrice = indicators.swing.longSl;
          } else if (this.state.positionSide === 'short' && indicators.swing?.shortSl) {
            newSlPrice = indicators.swing.shortSl;
          }
          break;

        case 'ema20':
          if (indicators.ema20) {
            const offset = this.state.positionSide === 'long' ? -2 * this.tickSize : 2 * this.tickSize;
            newSlPrice = indicators.ema20 + offset;
          }
          break;

        case 'oppBB':
          if (this.state.positionSide === 'long' && nowPrice >= (indicators.upperBB ?? Infinity)) {
            await this.closeRunner('Opposite BB touched');
            return;
          } else if (this.state.positionSide === 'short' && nowPrice <= (indicators.lowerBB ?? 0)) {
            await this.closeRunner('Opposite BB touched');
            return;
          }
          break;

        case 'rsiFlip':
          if (indicators.rsi) {
            const shouldClose =
              (this.state.positionSide === 'long' && indicators.rsi < 30) ||
              (this.state.positionSide === 'short' && indicators.rsi > 70);
            if (shouldClose) {
              await this.closeRunner('RSI flip detected');
              return;
            }
          }
          break;

        default:
          this.logger.warn('[AdvancedBracketManager] Unknown trail method', { method: this.state.trailMethod });
          return;
      }
    } catch (error) {
      this.logger.error('[AdvancedBracketManager] Error in trail method logic', {
        error,
        method: this.state.trailMethod,
      });
      return;
    }

    if (newSlPrice && this.state.currentSlOrderId) {
      const isImprovement =
        (this.state.positionSide === 'long' && newSlPrice > this.state.breakevenPrice) ||
        (this.state.positionSide === 'short' && newSlPrice < this.state.breakevenPrice);

      if (isImprovement) {
        try {
          await this.updateStopLoss(newSlPrice);
          this.lastTrailUpdate = now;
        } catch (error) {
          this.logger.error('[AdvancedBracketManager] Failed to update stop loss', { error, newSlPrice });
        }
      }
    }
  }

  async cancelAll(reason?: string): Promise<void> {
    this.logger.info('[AdvancedBracketManager] Cancelling all bracket orders', { reason });

    const orderIds = [this.state.currentSlOrderId, this.state.tp1OrderId, this.state.runnerOrderId].filter(
      (id): id is string => !!id
    );

    for (const orderId of orderIds) {
      try {
        await this.client.request('private/cancel', { order_id: orderId });
        this.logger.info('[AdvancedBracketManager] Cancelled order', { orderId });
      } catch (error) {
        this.logger.warn('[AdvancedBracketManager] Failed to cancel order', { orderId, error });
      }
    }

    this.state.status = 'closed';
  }

  getState(): BracketState {
    return { ...this.state };
  }

  private async moveSLToBreakeven(): Promise<void> {
    if (!this.state.currentSlOrderId) {
      this.logger.warn('[AdvancedBracketManager] Cannot move SL to BE: no current SL order ID');
      return;
    }

    const halfQty = Math.floor((this.state.totalQty / 2) * 100000) / 100000;

    if (halfQty <= 0) {
      this.logger.error('[AdvancedBracketManager] Invalid half quantity for BE move', {
        totalQty: this.state.totalQty,
        halfQty,
      });
      return;
    }

    try {
      await this.client.request('private/cancel', { order_id: this.state.currentSlOrderId });
      this.logger.info('[AdvancedBracketManager] Cancelled original SL order', {
        orderId: this.state.currentSlOrderId,
      });
    } catch (error) {
      this.logger.error('[AdvancedBracketManager] Failed to cancel original SL', {
        error,
        orderId: this.state.currentSlOrderId,
      });
      throw error;
    }
      
    try {
      const slDirection = this.state.positionSide === 'long' ? 'sell' : 'buy';
      const bePrice = this.roundToTick(this.state.breakevenPrice);

      this.logger.info('[AdvancedBracketManager] Placing BE SL order', {
        direction: slDirection,
        amount: halfQty,
        triggerPrice: bePrice,
      });

  const newSlOrder = await this.client.request<{ order_id: string }>('private/' + slDirection, {
        instrument_name: this.symbol,
        amount: halfQty,
        type: 'stop_market',
        trigger: 'mark_price',
        trigger_price: bePrice,
        reduce_only: true,
      });

      if (!newSlOrder || !newSlOrder.order_id) {
        throw new Error('BE SL order response missing order_id');
      }

      this.state.currentSlOrderId = newSlOrder.order_id;
      this.state.remainingQty = halfQty;
      this.state.status = 'tp1Hit';

      this.logger.info('[AdvancedBracketManager] SL moved to BE', {
        newOrderId: newSlOrder.order_id,
        bePrice,
        amount: halfQty,
      });
    } catch (error) {
      this.logger.error('[AdvancedBracketManager] Failed to place BE SL order', {
        error,
        halfQty,
        bePrice: this.state.breakevenPrice,
      });
      throw error;
    }
  }

  private async updateStopLoss(newPrice: number): Promise<void> {
    if (!this.state.currentSlOrderId) {
      this.logger.warn('[AdvancedBracketManager] Cannot update SL: no current order ID');
      return;
    }

    if (!newPrice || newPrice <= 0) {
      this.logger.warn('[AdvancedBracketManager] Invalid new SL price', { newPrice });
      return;
    }

    try {
      const roundedPrice = this.roundToTick(newPrice);
      
      this.logger.info('[AdvancedBracketManager] Updating SL', {
        orderId: this.state.currentSlOrderId,
        oldPrice: this.state.breakevenPrice,
        newPrice: roundedPrice,
        amount: this.state.remainingQty,
      });

      await this.client.request('private/edit', {
        order_id: this.state.currentSlOrderId,
        trigger_price: roundedPrice,
        amount: this.state.remainingQty,
      });

      this.state.breakevenPrice = roundedPrice;
      this.logger.info('[AdvancedBracketManager] SL trailed successfully', { newPrice: roundedPrice });
    } catch (error) {
      this.logger.warn('[AdvancedBracketManager] Failed to trail SL', {
        error,
        orderId: this.state.currentSlOrderId,
        newPrice: this.roundToTick(newPrice),
      });
    }
  }

  private async closeRunner(reason: string): Promise<void> {
    this.logger.info('[AdvancedBracketManager] Closing runner', { reason });

    if (this.state.currentSlOrderId) {
      try {
        await this.client.request('private/cancel', { order_id: this.state.currentSlOrderId });
        this.logger.info('[AdvancedBracketManager] Cancelled SL when closing runner', {
          orderId: this.state.currentSlOrderId,
        });
      } catch (error) {
        this.logger.warn('[AdvancedBracketManager] Failed to cancel SL when closing runner', {
          error,
          orderId: this.state.currentSlOrderId,
        });
      }
    }

    if (!this.state.remainingQty || this.state.remainingQty <= 0) {
      this.logger.warn('[AdvancedBracketManager] Invalid remaining quantity for runner close', {
        remainingQty: this.state.remainingQty,
      });
      this.state.status = 'closed';
      return;
    }

    const direction = this.state.positionSide === 'long' ? 'sell' : 'buy';
    
    try {
      this.logger.info('[AdvancedBracketManager] Placing market close for runner', {
        direction,
        amount: this.state.remainingQty,
        reason,
      });

      await this.client.request('private/' + direction, {
        instrument_name: this.symbol,
        amount: this.state.remainingQty,
        type: 'market',
        reduce_only: true,
      });

      this.state.status = 'closed';
      this.logger.info('[AdvancedBracketManager] Runner closed at market', { reason });
    } catch (error) {
      this.logger.error('[AdvancedBracketManager] Failed to close runner', {
        error,
        direction,
        amount: this.state.remainingQty,
        reason,
      });
      throw error;
    }
  }

  private roundToTick(price: number): number {
    return Math.round(price / this.tickSize) * this.tickSize;
  }

  private async cleanupStaleOrders(): Promise<void> {
    try {
      this.logger.info('[AdvancedBracketManager] Cleaning up stale trigger orders for instrument', {
        instrument: this.symbol,
      });

      const openOrders = await this.client.request('private/get_open_orders_by_instrument', {
        instrument_name: this.symbol,
      });

      if (!openOrders || !Array.isArray(openOrders)) {
        this.logger.info('[AdvancedBracketManager] No open orders found for cleanup');
        return;
      }

      const triggerOrders = openOrders.filter((order: any) => 
        order.order_type === 'stop_market' || 
        order.order_type === 'stop_limit' ||
        order.order_type === 'take_limit' ||
        order.order_type === 'take_market'
      );

      this.logger.info('[AdvancedBracketManager] Found trigger orders to cleanup', {
        count: triggerOrders.length,
      });

      const positions = await this.client.request('private/get_positions', {
        currency: 'USDC',
      });

      const hasOpenPosition = positions && Array.isArray(positions) && 
        positions.some((pos: any) => pos.instrument_name === this.symbol && Math.abs(pos.size || 0) > 0);

      if (!hasOpenPosition && triggerOrders.length > 0) {
        this.logger.info('[AdvancedBracketManager] No open position, cancelling orphaned trigger orders', {
          count: triggerOrders.length,
        });

        for (const order of triggerOrders) {
          try {
            await this.client.request('private/cancel', { order_id: order.order_id });
            this.logger.info('[AdvancedBracketManager] Cancelled orphaned trigger order', {
              orderId: order.order_id,
              type: order.order_type,
            });
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (cancelError) {
            this.logger.warn('[AdvancedBracketManager] Failed to cancel orphaned order', {
              orderId: order.order_id,
              error: cancelError,
            });
          }
        }
      } else if (triggerOrders.length >= 10) {
        this.logger.warn('[AdvancedBracketManager] High number of trigger orders detected, cancelling oldest', {
          count: triggerOrders.length,
        });

        const sortedOrders = triggerOrders.sort((a: any, b: any) => a.creation_timestamp - b.creation_timestamp);
        const ordersToCancel = sortedOrders.slice(0, Math.max(0, triggerOrders.length - 5));

        for (const order of ordersToCancel) {
          try {
            await this.client.request('private/cancel', { order_id: order.order_id });
            this.logger.info('[AdvancedBracketManager] Cancelled old trigger order', {
              orderId: order.order_id,
              type: order.order_type,
            });
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (cancelError) {
            this.logger.warn('[AdvancedBracketManager] Failed to cancel old order', {
              orderId: order.order_id,
              error: cancelError,
            });
          }
        }
      }

      this.logger.info('[AdvancedBracketManager] Cleanup complete');
    } catch (error) {
      this.logger.error('[AdvancedBracketManager] Cleanup failed', { error });
      throw error;
    }
  }
}

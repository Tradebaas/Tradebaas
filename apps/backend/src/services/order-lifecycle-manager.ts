/**
 * Order Lifecycle Manager
 * 
 * CRITICAL SAFETY SERVICE:
 * Ensures that when ANY order in a trade group (entry/SL/TP) is filled or cancelled,
 * all related orders are properly cleaned up.
 * 
 * PRINCIPLE:
 * - One order closes → ALL related orders must be cancelled
 * - Database is the single source of truth for order relationships
 * - Agnostic to strategy or trade type
 * - Handles edge cases: manual closes, partial fills, Deribit failures
 * - EMITS EVENTS when trades close for strategy auto-resume
 * 
 * LIFECYCLE:
 * 1. Trade opens → Entry + SL + TP order IDs stored in database
 * 2. ANY order fills/cancels → Trigger cleanup
 * 3. Cleanup cancels all OTHER orders in the group
 * 4. Close trade in database
 * 5. EMIT 'tradeClosed' event for strategy to resume
 */

import { EventEmitter } from 'events';
import { BackendDeribitClient } from '../deribit-client';
import { getTradeHistoryService } from './trade-history';
import { deriveExitDetails } from './trade-finalizer';

export interface OrderGroup {
  tradeId: string;
  entryOrderId: string;
  slOrderId?: string;
  tpOrderId?: string;
}

export interface TradeClosedEvent {
  tradeId: string;
  strategyName: string;
  instrument: string;
  exitReason: 'position_closed' | 'strategy_stopped' | 'manual';
}

export class OrderLifecycleManager extends EventEmitter {
  private client: BackendDeribitClient;
  
  constructor(client: BackendDeribitClient) {
    super();
    this.client = client;
  }
  
  /**
   * CORE METHOD: Cleanup all orders related to a trade
   * 
   * Called when:
   * - Position closes (SL hit, TP hit, manual close)
   * - Strategy stops with open position
   * - Orphan detection at startup
   * 
   * @param tradeId - Database trade ID
   * @param triggerReason - Why cleanup was triggered (for logging)
   */
  async cleanupTradeOrders(tradeId: string, triggerReason: string): Promise<void> {
    try {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[OrderLifecycle] 🧹 CLEANUP TRIGGERED - ${triggerReason}`);
      console.log(`[OrderLifecycle] Trade ID: ${tradeId}`);
      console.log(`${'='.repeat(80)}\n`);
      
      // Step 1: Get trade from database
      const tradeHistory = getTradeHistoryService();
      const trade = await tradeHistory.getTrade(tradeId);
      
      if (!trade) {
        console.error(`[OrderLifecycle] ❌ Trade not found in database: ${tradeId}`);
        return;
      }
      
      console.log(`[OrderLifecycle] 📊 Trade Details:`);
      console.log(`[OrderLifecycle]    Strategy: ${trade.strategyName}`);
      console.log(`[OrderLifecycle]    Instrument: ${trade.instrument}`);
      console.log(`[OrderLifecycle]    Entry Order: ${trade.entryOrderId}`);
      console.log(`[OrderLifecycle]    SL Order: ${trade.slOrderId || 'N/A'}`);
      console.log(`[OrderLifecycle]    TP Order: ${trade.tpOrderId || 'N/A'}`);
      
      // Step 2: Get all open orders for this instrument
      const openOrders = await this.client.getOpenOrders(trade.instrument);
      console.log(`[OrderLifecycle] 📋 Found ${openOrders.length} open orders on ${trade.instrument}`);
      
      // Step 3: Cancel SL order if exists
      if (trade.slOrderId) {
        await this.cancelOrderSafely(trade.slOrderId, 'Stop Loss', openOrders);
      }
      
      // Step 4: Cancel TP order if exists
      if (trade.tpOrderId) {
        await this.cancelOrderSafely(trade.tpOrderId, 'Take Profit', openOrders);
      }
      
      // Step 5: Additional safety - cancel ANY reduce_only orders for this instrument
      // (In case order IDs weren't tracked properly or orders were manually placed)
      await this.cleanupOrphanReduceOnlyOrders(trade.instrument, openOrders);
      
      // Step 6: CLOSE TRADE IN DATABASE using unified finalizer
      const exitDetails = await deriveExitDetails(this.client, trade);
      console.log(`[OrderLifecycle] 📊 Finalized exit via ${exitDetails.source}`);
      console.log(`[OrderLifecycle]    Exit Price: $${exitDetails.exitPrice}`);
      console.log(`[OrderLifecycle]    PnL (net): $${exitDetails.pnl.toFixed(2)} (${exitDetails.pnlPercentage.toFixed(2)}%) Fees: $${exitDetails.fees.toFixed(4)}`);
      console.log(`[OrderLifecycle]    Exit Reason: ${exitDetails.exitReason}`);

      await tradeHistory.closeTrade({
        tradeId: trade.id,
        exitPrice: exitDetails.exitPrice,
        exitReason: exitDetails.exitReason,
        pnl: exitDetails.pnl,
        pnlPercentage: exitDetails.pnlPercentage
      });
      
      // Step 7: CLEAR STRATEGY METRICS & RESET STATUS
      // Import StateManager to clear metrics
      const { stateManager } = await import('../state-manager');
      const allStrategies = stateManager.getAllStrategies();
      const strategy = allStrategies.find((s: any) => s.name === trade.strategyName);
      
      if (strategy) {
        console.log(`[OrderLifecycle] 🧹 Clearing strategy metrics for ${trade.strategyName}`);
        await stateManager.updateStrategyMetrics(strategy.id, null as any);
        
        console.log(`[OrderLifecycle] 🔄 Resetting strategy status to analyzing`);
        await stateManager.updateStrategyStatus(strategy.id, 'active');
      }
      
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`[OrderLifecycle] ✅ CLEANUP COMPLETE - All related orders cancelled`);
      console.log(`[OrderLifecycle] ✅ Trade ${tradeId} closed in database`);
      console.log(`[OrderLifecycle] ✅ Strategy ${trade.strategyName} ready to resume`);
      console.log(`${'─'.repeat(80)}\n`);
      
    } catch (error) {
      console.error(`[OrderLifecycle] ❌ Cleanup failed for trade ${tradeId}:`, error);
      // Don't throw - cleanup failure shouldn't break strategy
      // Log error but continue (manual intervention may be needed)
    }
  }
  
  /**
   * Cancel a specific order with safety checks
   */
  private async cancelOrderSafely(
    orderId: string,
    orderType: string,
    openOrders: any[]
  ): Promise<void> {
    try {
      // Check if order still exists
      const orderExists = openOrders.some((o: any) => o.order_id === orderId);
      
      if (!orderExists) {
        console.log(`[OrderLifecycle] ℹ️  ${orderType} order ${orderId} already closed/filled - OK`);
        return;
      }
      
      // Cancel the order
      console.log(`[OrderLifecycle] 🗑️  Cancelling ${orderType} order: ${orderId}`);
      await this.client.cancelOrder(orderId);
      console.log(`[OrderLifecycle] ✅ ${orderType} order cancelled successfully`);
      
    } catch (error: any) {
      // Handle "order_not_found" gracefully (already filled/cancelled)
      if (error.message && error.message.includes('not_found')) {
        console.log(`[OrderLifecycle] ℹ️  ${orderType} order ${orderId} not found (already filled) - OK`);
      } else {
        console.error(`[OrderLifecycle] ⚠️  Failed to cancel ${orderType} order ${orderId}:`, error);
        // Continue anyway - don't block cleanup of other orders
      }
    }
  }
  
  /**
   * Safety net: Cancel ALL reduce_only orders for instrument
   * (Catches orders that weren't properly tracked in database)
   */
  private async cleanupOrphanReduceOnlyOrders(
    instrument: string,
    openOrders: any[]
  ): Promise<void> {
    try {
      const orphanOrders = openOrders.filter((order: any) => 
        order.reduce_only === true && order.instrument_name === instrument
      );
      
      if (orphanOrders.length === 0) {
        console.log(`[OrderLifecycle] ✅ No orphan reduce_only orders found`);
        return;
      }
      
      console.log(`[OrderLifecycle] ⚠️  Found ${orphanOrders.length} orphan reduce_only orders - cleaning up...`);
      
      for (const order of orphanOrders) {
        try {
          console.log(`[OrderLifecycle] 🗑️  Cancelling orphan order ${order.order_id} (${order.order_type})`);
          await this.client.cancelOrder(order.order_id);
          console.log(`[OrderLifecycle] ✅ Orphan order cancelled`);
        } catch (err) {
          console.error(`[OrderLifecycle] ⚠️  Failed to cancel orphan order ${order.order_id}:`, err);
        }
      }
    } catch (error) {
      console.error(`[OrderLifecycle] ❌ Orphan cleanup failed:`, error);
    }
  }
  
  /**
   * BULK CLEANUP: Process all open trades for a strategy
   * Used when strategy stops with open positions
   */
  async cleanupAllTradesForStrategy(strategyName: string): Promise<void> {
    try {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[OrderLifecycle] 🔄 BULK CLEANUP - Strategy: ${strategyName}`);
      console.log(`${'='.repeat(80)}\n`);
      
      const tradeHistory = getTradeHistoryService();
      const allTrades = await tradeHistory.getAllTrades();
      const openTrades = allTrades.filter(t => t.strategyName === strategyName && t.status === 'open');
      
      console.log(`[OrderLifecycle] Found ${openTrades.length} open trades`);
      
      for (const trade of openTrades) {
        await this.cleanupTradeOrders(trade.id, `Strategy ${strategyName} stopped`);
      }
      
      console.log(`[OrderLifecycle] ✅ Bulk cleanup complete for ${strategyName}`);
      
    } catch (error) {
      console.error(`[OrderLifecycle] ❌ Bulk cleanup failed:`, error);
    }
  }
  
  /**
   * POSITION MONITORING: Check if position closed and cleanup accordingly
   * 
   * This is called periodically (e.g., every tick) when position is open
   * When position no longer exists → cleanup orders and close trade
   */
  async checkPositionAndCleanup(
    tradeId: string,
    instrument: string
  ): Promise<boolean> {
    try {
      // Get current positions (with error handling for WebSocket disconnects)
      let positions: any[] = [];
      
      try {
        positions = await this.client.getPositions('USDC');
      } catch (wsError: any) {
        // WebSocket connection issues - fall back to REST API
        if (wsError.message?.includes('Connection closed') || 
            wsError.message?.includes('Not authenticated') ||
            wsError.message?.includes('WebSocket')) {
          console.log(`[OrderLifecycle] ⚠️  WebSocket error, using REST API fallback`);
          
          // Use REST API to get positions directly
          const response = await this.client.sendRequest('private/get_positions', {
            currency: 'USDC',
            kind: 'future'
          });
          positions = response || [];
        } else {
          throw wsError; // Re-throw other errors
        }
      }
      
      const hasPosition = positions.some((p: any) => 
        p.size !== 0 && (p.instrument_name === instrument || p.instrument === instrument)
      );
      
      if (!hasPosition) {
        // Position closed! Determine exit reason by checking which orders still exist
        console.log(`[OrderLifecycle] 🔍 Position closed detected for trade ${tradeId}`);
        
        const tradeHistory = getTradeHistoryService();
        const trade = await tradeHistory.getTrade(tradeId);
        
        let exitReason = 'Position closed (manual)'; // Default to manual
        
        if (trade) {
          // Get all open orders to see if SL or TP still exists
          const openOrders = await this.client.getOpenOrders(instrument);
          const slExists = trade.slOrderId && openOrders.some((o: any) => o.order_id === trade.slOrderId);
          const tpExists = trade.tpOrderId && openOrders.some((o: any) => o.order_id === trade.tpOrderId);
          
          console.log(`[OrderLifecycle] 🔍 Exit reason detection:`);
          console.log(`[OrderLifecycle]    SL Order (${trade.slOrderId}): ${slExists ? 'STILL EXISTS' : 'GONE'}`);
          console.log(`[OrderLifecycle]    TP Order (${trade.tpOrderId}): ${tpExists ? 'STILL EXISTS' : 'GONE'}`);
          
          if (!slExists && tpExists) {
            // SL is gone but TP still exists → SL was hit
            exitReason = 'Stop loss hit';
            console.log(`[OrderLifecycle] ✅ Exit reason: STOP LOSS HIT (SL gone, TP exists)`);
          } else if (slExists && !tpExists) {
            // TP is gone but SL still exists → TP was hit
            exitReason = 'Take profit hit';
            console.log(`[OrderLifecycle] ✅ Exit reason: TAKE PROFIT HIT (TP gone, SL exists)`);
          } else {
            console.log(`[OrderLifecycle] ⚠️  Exit reason: MANUAL or UNKNOWN (SL: ${slExists ? 'exists' : 'gone'}, TP: ${tpExists ? 'exists' : 'gone'})`);
          }
          // else: both gone or both exist → manual close or unknown → keep default
        }
        
        await this.cleanupTradeOrders(tradeId, exitReason);
        
        // EMIT EVENT: Notify strategy service to resume
        if (trade) {
          const event: TradeClosedEvent = {
            tradeId,
            strategyName: trade.strategyName,
            instrument: trade.instrument,
            exitReason: 'position_closed'
          };
          
          console.log(`[OrderLifecycle] 📢 Emitting 'tradeClosed' event for ${trade.strategyName}`);
          this.emit('tradeClosed', event);
        }
        
        return true; // Position is closed
      }
      
      return false; // Position still open
      
    } catch (error) {
      console.error(`[OrderLifecycle] ❌ Position check failed:`, error);
      return false; // Assume still open on error
    }
  }
}

/**
 * Singleton instance
 * (Initialized when first Deribit client is available)
 */
let orderLifecycleManagerInstance: OrderLifecycleManager | null = null;

export function initializeOrderLifecycleManager(client: BackendDeribitClient): void {
  if (!orderLifecycleManagerInstance) {
    orderLifecycleManagerInstance = new OrderLifecycleManager(client);
    console.log('[OrderLifecycle] ✅ Order Lifecycle Manager initialized');
  }
}

export function getOrderLifecycleManager(): OrderLifecycleManager {
  if (!orderLifecycleManagerInstance) {
    throw new Error('OrderLifecycleManager not initialized! Call initializeOrderLifecycleManager first.');
  }
  return orderLifecycleManagerInstance;
}

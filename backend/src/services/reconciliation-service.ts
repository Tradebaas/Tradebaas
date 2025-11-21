/**
 * Reconciliation Service
 * Ensures database trades stay in sync with Deribit positions
 * Runs periodic checks to detect and cleanup orphan trades
 */

import type { BackendDeribitClient } from '../deribit-client';
import { getTradeHistoryService, ensureTradeHistoryInitialized } from './trade-history';
import { deriveExitDetails } from './trade-finalizer';

export class ReconciliationService {
  private client: BackendDeribitClient;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private checkIntervalMs: number;
  // Feature flags
  private repairProtectiveOrders: boolean;
  
  constructor(client: BackendDeribitClient, checkIntervalMinutes: number = 1, options?: { repairProtectiveOrders?: boolean }) {
    this.client = client;
    this.checkIntervalMs = checkIntervalMinutes * 60 * 1000;
    this.repairProtectiveOrders = options?.repairProtectiveOrders !== false; // default true
  }
  
  /**
   * Start periodic reconciliation checks
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Reconciliation] Already running');
      return;
    }
    
    console.log(`[Reconciliation] 🔄 Starting periodic checks every ${this.checkIntervalMs / 60000} minutes`);
    this.isRunning = true;
    
    // Run immediately on start
    this.runCheck();
    
    // Then run periodically
    this.intervalId = setInterval(() => {
      this.runCheck();
    }, this.checkIntervalMs);
  }
  
  /**
   * Stop periodic reconciliation checks
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[Reconciliation] ⏹️  Stopped');
  }
  
  /**
   * Run a single reconciliation check
   */
  private async runCheck(): Promise<void> {
    try {
      console.log('[Reconciliation] 🔍 Running database-Deribit sync check...');
      
      // CRITICAL: Ensure database is initialized before querying
      await ensureTradeHistoryInitialized();
      
      const tradeHistory = getTradeHistoryService();
      
      // Get all open trades from database
      const openTrades = await tradeHistory.queryTrades({
        status: 'open',
        limit: 100, // Check up to 100 open trades
      });
      
      if (openTrades.length === 0) {
        console.log('[Reconciliation] ✅ No open trades in database');
        return;
      }
      
      console.log(`[Reconciliation] Found ${openTrades.length} open trades in database`);
      
      // Get all positions from Deribit
      let positions;
      let activePositions: any[] = [];
      
      try {
        positions = await this.client.getPositions('USDC');
        activePositions = positions.filter((p: any) => Math.abs(p.size) > 0);
        console.log(`[Reconciliation] Found ${activePositions.length} active positions on Deribit`);
      } catch (error: any) {
        // WebSocket might be disconnected - skip this check
        if (error.message?.includes('Connection closed') || 
            error.message?.includes('Not authenticated')) {
          console.log('[Reconciliation] ⚠️  WebSocket temporarily unavailable - skipping check');
          return;
        }
        // Unknown error - rethrow
        throw error;
      }
      
      // Check each database trade
      let orphansFound = 0;
      for (const trade of openTrades) {
        // Find matching position on Deribit
        const hasPosition = activePositions.some((p: any) => {
          const instrument = p.instrument_name || p.instrument;
          return instrument === trade.instrument && Math.abs(p.size) > 0;
        });
        
        if (!hasPosition) {
          // ORPHAN DETECTED: Database says open, but no Deribit position
          console.log(`\n${'='.repeat(80)}`);
          console.log(`[Reconciliation] ⚠️  ORPHAN TRADE DETECTED`);
          console.log(`[Reconciliation] Trade ID: ${trade.id}`);
          console.log(`[Reconciliation] Strategy: ${trade.strategyName}`);
          console.log(`[Reconciliation] Instrument: ${trade.instrument}`);
          console.log(`[Reconciliation] Entry: $${trade.entryPrice} | Amount: ${trade.amount}`);
          console.log(`[Reconciliation] Database Status: OPEN`);
          console.log(`[Reconciliation] Deribit Position: NOT FOUND`);
          console.log(`[Reconciliation] Action: Auto-closing orphan trade`);
          console.log(`${'='.repeat(80)}\n`);
          
          // Close the orphan trade
          // Use current market price as exit (best approximation)
          const currentPrice = await this.getCurrentPrice(trade.instrument);
          
          const exitDetails = await deriveExitDetails(this.client, trade);
          await tradeHistory.closeTrade({
            tradeId: trade.id,
            exitPrice: exitDetails.exitPrice,
            exitReason: exitDetails.exitReason,
            pnl: exitDetails.pnl,
            pnlPercentage: exitDetails.pnlPercentage,
          });
          console.log(`[Reconciliation] ✅ Closed orphan trade ${trade.id}`);
          console.log(`[Reconciliation]    Exit Price: $${exitDetails.exitPrice}`);
          console.log(`[Reconciliation]    PnL (net): $${exitDetails.pnl.toFixed(2)} (${exitDetails.pnlPercentage.toFixed(2)}%)`);
          
          orphansFound++;
        } else {
          // Trade has active position – optionally verify SL/TP integrity
          if (this.repairProtectiveOrders) {
            await this.verifyProtectiveOrders(trade, activePositions);
          }
        }
      }
      
      if (orphansFound > 0) {
        console.log(`\n[Reconciliation] 🧹 Cleaned up ${orphansFound} orphan trade(s)`);
      } else {
        console.log('[Reconciliation] ✅ All database trades match Deribit positions');
      }
      
      // REVERSE ORPHAN CHECK: Detect positions on Deribit that are NOT in database
      await this.checkReverseOrphans(activePositions);
      
    } catch (error) {
      console.error('[Reconciliation] ❌ Error during reconciliation check:', error);
    }
  }

  /**
   * Verify protective orders (SL/TP) exist for an active trade, re-place if missing
   * Handles disconnect scenarios where stop orders vanished but position persists
   */
  private async verifyProtectiveOrders(trade: any, activePositions: any[]): Promise<void> {
    try {
      // Preconditions
      const position = activePositions.find((p: any) => (p.instrument_name || p.instrument) === trade.instrument && Math.abs(p.size) > 0);
      if (!position) return; // No position -> handled elsewhere
      const instrumentName = trade.instrument;

      // Fetch current open orders for instrument
      let openOrders: any[] = [];
      try {
        openOrders = await this.client.getOpenOrders(instrumentName);
      } catch (e: any) {
        if (e.message?.includes('WebSocket') || e.message?.includes('Not authenticated')) {
          console.log('[Reconciliation] ⚠️  Cannot verify protective orders (connection issue)');
          return;
        }
        throw e;
      }

      const slExists = trade.slOrderId && openOrders.some(o => o.order_id === trade.slOrderId);
      const tpExists = trade.tpOrderId && openOrders.some(o => o.order_id === trade.tpOrderId);

      if (slExists && tpExists) {
        // All good
        return;
      }

      // Get latest price and instrument details for tick size
      const [ticker, instrument] = await Promise.all([
        this.client.getTicker(instrumentName),
        this.client.getInstrument(instrumentName)
      ]);
      const currentPrice = ticker.last_price;
      const tickSize = instrument.tick_size || 0.1;

      // Determine position direction
      const isLong = position.direction === 'buy';
      const amount = Math.abs(position.size);

      // Safety: if SL missing and price already beyond SL threshold (meaning SL would have triggered), close trade
      if (!slExists) {
        const slPrice = trade.stopLoss;
        if (typeof slPrice === 'number' && slPrice > 0) {
          const slTriggered = isLong ? currentPrice <= slPrice : currentPrice >= slPrice;
          if (slTriggered) {
            console.log(`[Reconciliation] 🚨 Missing SL order but price passed SL level -> closing trade ${trade.id}`);
            const tradeHistory = getTradeHistoryService();
            const pnl = this.calculatePnL(trade.side, trade.entryPrice, currentPrice, trade.amount);
            const pnlPct = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.side === 'buy' ? 1 : -1);
            await tradeHistory.closeTrade({
              tradeId: trade.id,
              exitPrice: currentPrice,
              exitReason: 'sl_hit',
              pnl,
              pnlPercentage: pnlPct,
            });
            return; // Trade closed, skip TP repair
          }
        }
      }

      const tradeHistory = getTradeHistoryService();

      // Repair SL if missing
      if (!slExists && trade.stopLoss) {
        const desiredSL = trade.stopLoss;
        // Round to tick size
        const roundedSL = Math.round(desiredSL / tickSize) * tickSize;
        const label = `recon_sl_${Date.now()}`;
        console.log(`[Reconciliation] 🛡️  Re-placing missing SL for trade ${trade.id} at $${roundedSL}`);
        try {
          const slOrder = isLong
            ? await this.client.placeSellOrder(instrumentName, amount, roundedSL, 'stop_market', label, true)
            : await this.client.placeBuyOrder(instrumentName, amount, roundedSL, 'stop_market', label, true);
          const newSlId = slOrder?.order?.order_id || slOrder?.order_id;
          if (newSlId) {
            await tradeHistory.updateOrderIds(trade.id, newSlId, trade.tpOrderId || undefined);
          }
          console.log(`[Reconciliation] ✅ SL restored (order ${newSlId})`);
        } catch (err) {
          console.error('[Reconciliation] ❌ Failed to re-place SL:', err);
        }
      }

      // Repair TP if missing
      if (!tpExists && trade.takeProfit) {
        const desiredTP = trade.takeProfit;
        const roundedTP = Math.round(desiredTP / tickSize) * tickSize;
        const label = `recon_tp_${Date.now()}`;
        console.log(`[Reconciliation] 🎯 Re-placing missing TP for trade ${trade.id} at $${roundedTP}`);
        try {
          const tpOrder = isLong
            ? await this.client.placeSellOrder(instrumentName, amount, roundedTP, 'limit', label, true)
            : await this.client.placeBuyOrder(instrumentName, amount, roundedTP, 'limit', label, true);
          const newTpId = tpOrder?.order?.order_id || tpOrder?.order_id;
          if (newTpId) {
            // Preserve existing (possibly newly repaired) SL ID
            const updatedTrade = await tradeHistory.getTrade(trade.id);
            await tradeHistory.updateOrderIds(trade.id, updatedTrade?.slOrderId || trade.slOrderId || undefined, newTpId);
          }
          console.log(`[Reconciliation] ✅ TP restored (order ${newTpId})`);
        } catch (err) {
          console.error('[Reconciliation] ❌ Failed to re-place TP:', err);
        }
      }
    } catch (error) {
      console.error(`[Reconciliation] ❌ Protective order verification failed for trade ${trade.id}:`, error);
    }
  }
  
  /**
   * Check for reverse orphans: Deribit positions without database records
   * This happens when trade recording fails but position was opened
   */
  private async checkReverseOrphans(activePositions: any[]): Promise<void> {
    if (activePositions.length === 0) {
      console.log('[Reconciliation] ✅ No active positions on Deribit');
      return;
    }
    
    const tradeHistory = getTradeHistoryService();
    
    for (const position of activePositions) {
      const instrument = position.instrument_name || position.instrument;
      
      // Check if we have an open trade for this instrument
      const openTrades = await tradeHistory.queryTrades({
        instrument: instrument,
        status: 'open',
        limit: 1,
      });
      
      if (openTrades.length === 0) {
        // REVERSE ORPHAN: Position exists but no database record!
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[Reconciliation] 🚨 REVERSE ORPHAN DETECTED!`);
        console.log(`[Reconciliation] Instrument: ${instrument}`);
        console.log(`[Reconciliation] Deribit Position: ${position.size} contracts @ $${position.average_price || position.mark_price}`);
        console.log(`[Reconciliation] Database Status: NO RECORD FOUND`);
        console.log(`[Reconciliation] Reason: Trade recording failed (database initialization race condition)`);
        console.log(`[Reconciliation] Action: Creating database record for existing position`);
        console.log(`${'='.repeat(80)}\n`);
        
        // Create a database record for this orphan position
        const currentPrice = position.mark_price || position.average_price || 0;
        const amount = Math.abs(position.size);
        const side: 'buy' | 'sell' = position.direction === 'buy' ? 'buy' : 'sell';
        
        // Estimate SL/TP based on position data (if available)
        const stopLoss = position.stop_loss_price || (side === 'buy' ? currentPrice * 0.995 : currentPrice * 1.005);
        const takeProfit = position.take_profit_price || (side === 'buy' ? currentPrice * 1.01 : currentPrice * 0.99);
        
        // Record the trade retroactively
        const tradeId = await tradeHistory.recordTrade({
          strategyName: 'Razor', // Assume Razor strategy
          instrument: instrument,
          side: side,
          entryOrderId: `reverse_orphan_${Date.now()}`, // Placeholder
          slOrderId: undefined,
          tpOrderId: undefined,
          entryPrice: position.average_price || currentPrice,
          amount: amount,
          stopLoss: stopLoss,
          takeProfit: takeProfit,
        });
        
        console.log(`[Reconciliation] ✅ Created database record for reverse orphan`);
        console.log(`[Reconciliation]    Trade ID: ${tradeId}`);
        console.log(`[Reconciliation]    Entry: $${position.average_price || currentPrice}`);
        console.log(`[Reconciliation]    Amount: ${amount}`);
        console.log(`[Reconciliation]    Side: ${side.toUpperCase()}`);
        console.log(`[Reconciliation] 🎯 Position is now tracked and will be monitored\n`);
      }
    }
  }
  
  /**
   * Get current market price for instrument
   */
  private async getCurrentPrice(instrument: string): Promise<number> {
    try {
      // Try to get from ticker
      const ticker = await this.client.getTicker(instrument);
      if (ticker && ticker.last_price) {
        return ticker.last_price;
      }
      
      // Fallback: get from positions/orders
      const positions = await this.client.getPositions('USDC');
      const pos = positions.find((p: any) => {
        const inst = p.instrument_name || p.instrument;
        return inst === instrument;
      });
      
      if (pos && pos.mark_price) {
        return pos.mark_price;
      }
      
      // Last resort: return 0 (shouldn't happen)
      console.warn(`[Reconciliation] ⚠️  Could not get price for ${instrument}, using 0`);
      return 0;
    } catch (error) {
      console.error(`[Reconciliation] Error getting price for ${instrument}:`, error);
      return 0;
    }
  }
  
  /**
   * Calculate PnL for a trade
   */
  private calculatePnL(
    side: 'buy' | 'sell',
    entryPrice: number,
    exitPrice: number,
    amount: number
  ): number {
    if (side === 'buy') {
      // Long position: profit when price goes up
      return ((exitPrice - entryPrice) / entryPrice) * amount;
    } else {
      // Short position: profit when price goes down
      return ((entryPrice - exitPrice) / entryPrice) * amount;
    }
  }
  
  /**
   * Manual trigger for reconciliation (for testing/admin)
   */
  async triggerManualCheck(): Promise<void> {
    console.log('[Reconciliation] 🔧 Manual reconciliation check triggered');
    await this.runCheck();
  }
}

// Singleton instance
let reconciliationService: ReconciliationService | null = null;

export function createReconciliationService(
  client: BackendDeribitClient,
  checkIntervalMinutes?: number
): ReconciliationService {
  reconciliationService = new ReconciliationService(client, checkIntervalMinutes);
  return reconciliationService;
}

export function getReconciliationService(): ReconciliationService | null {
  return reconciliationService;
}

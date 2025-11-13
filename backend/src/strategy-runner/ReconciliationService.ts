import { IBroker, Order } from '../brokers/IBroker';
import { Position } from './types';

export interface ReconciliationResult {
  matched: {
    position: Position;
    entryOrder: Order;
    stopLossOrder?: Order;
    takeProfitOrder?: Order;
  } | null;
  orphanedOrders: Order[];
  actions: ReconciliationAction[];
}

export interface ReconciliationAction {
  type: 'restore_position' | 'cancel_order' | 'alert';
  orderId?: string;
  message: string;
  order?: Order;
}

export class ReconciliationService {
  private broker: IBroker;
  
  constructor(broker: IBroker) {
    this.broker = broker;
  }
  
  async reconcile(
    savedPosition: Position | null,
    labelPrefix: string = 'tb_'
  ): Promise<ReconciliationResult> {
    console.log('[Reconciliation] Starting order reconciliation...');
    
    const result: ReconciliationResult = {
      matched: null,
      orphanedOrders: [],
      actions: [],
    };
    
    try {
      const instrument = savedPosition?.instrument;
      const openOrders = await this.broker.getOpenOrders(instrument);
      console.log(`[Reconciliation] Found ${openOrders.length} open orders`);
      
      if (!savedPosition) {
        if (openOrders.length > 0) {
          console.log('[Reconciliation] No saved position but found open orders');
          result.orphanedOrders = openOrders.filter(o => 
            (o.label && o.label.includes(labelPrefix)) ||
            o.orderId.includes(labelPrefix)
          );
          
          if (result.orphanedOrders.length > 0) {
            result.actions.push({
              type: 'alert',
              message: `Found ${result.orphanedOrders.length} orphaned orders from previous session`,
            });
            
            for (const order of result.orphanedOrders) {
              result.actions.push({
                type: 'cancel_order',
                orderId: order.orderId,
                message: `Canceling orphaned order ${order.orderId}`,
                order,
              });
            }
          }
        } else {
          console.log('[Reconciliation] No saved position and no open orders - clean state');
        }
        
        return result;
      }
      
      console.log(`[Reconciliation] Attempting to match saved position for ${savedPosition.instrument}`);
      
      const entryOrder = openOrders.find(o => 
        o.orderId === savedPosition.orderId ||
        o.label === this.extractLabel(savedPosition.orderId)
      );
      
      const stopLossOrder = savedPosition.slOrderId ? 
        openOrders.find(o => 
          o.orderId === savedPosition.slOrderId ||
          o.label === this.extractLabel(savedPosition.slOrderId!)
        ) : undefined;
      
      const takeProfitOrder = savedPosition.tpOrderId ? 
        openOrders.find(o => 
          o.orderId === savedPosition.tpOrderId ||
          o.label === this.extractLabel(savedPosition.tpOrderId!)
        ) : undefined;
      
      if (entryOrder && entryOrder.status === 'filled') {
        console.log('[Reconciliation] ✓ Matched entry order - position still active');
        
        const hasValidProtection = 
          (stopLossOrder && stopLossOrder.status === 'open') ||
          (takeProfitOrder && takeProfitOrder.status === 'open');
        
        if (hasValidProtection) {
          result.matched = {
            position: savedPosition,
            entryOrder,
            stopLossOrder,
            takeProfitOrder,
          };
          
          result.actions.push({
            type: 'restore_position',
            message: `Restored active position on ${savedPosition.instrument}`,
          });
          
          console.log('[Reconciliation] Position fully reconciled with protection orders');
        } else {
          result.actions.push({
            type: 'alert',
            message: `Position on ${savedPosition.instrument} missing protection orders`,
          });
          
          console.warn('[Reconciliation] Position found but missing stop loss or take profit');
        }
      } else if (entryOrder && entryOrder.status === 'open') {
        console.log('[Reconciliation] Entry order still pending - not filled yet');
        
        result.actions.push({
          type: 'cancel_order',
          orderId: entryOrder.orderId,
          message: `Entry order never filled, canceling: ${entryOrder.orderId}`,
          order: entryOrder,
        });
      } else {
        console.log('[Reconciliation] Position not found in open orders - likely closed');
        
        const allOrders = [stopLossOrder, takeProfitOrder].filter(Boolean) as Order[];
        if (allOrders.length > 0) {
          result.orphanedOrders = allOrders;
          
          for (const order of allOrders) {
            result.actions.push({
              type: 'cancel_order',
              orderId: order.orderId,
              message: `Canceling leftover protection order: ${order.orderId}`,
              order,
            });
          }
        }
      }
      
      const trackedOrderIds = new Set([
        savedPosition.orderId,
        savedPosition.slOrderId,
        savedPosition.tpOrderId,
      ].filter(Boolean));
      
      const unknownOrders = openOrders.filter(o => 
        !trackedOrderIds.has(o.orderId) &&
        ((o.label && o.label.includes(labelPrefix)) || o.orderId.includes(labelPrefix))
      );
      
      if (unknownOrders.length > 0) {
        console.log(`[Reconciliation] Found ${unknownOrders.length} unknown orders with our label prefix`);
        
        result.orphanedOrders.push(...unknownOrders);
        
        for (const order of unknownOrders) {
          result.actions.push({
            type: 'alert',
            orderId: order.orderId,
            message: `Unknown order detected: ${order.orderId}`,
            order,
          });
        }
      }
      
    } catch (error) {
      console.error('[Reconciliation] Error during reconciliation:', error);
      result.actions.push({
        type: 'alert',
        message: `Reconciliation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
    
    return result;
  }
  
  async executeActions(actions: ReconciliationAction[], instrument: string): Promise<void> {
    for (const action of actions) {
      try {
        if (action.type === 'cancel_order' && action.orderId) {
          console.log(`[Reconciliation] Executing: ${action.message}`);
          await this.broker.cancelOrder(action.orderId, instrument);
        } else if (action.type === 'alert') {
          console.warn(`[Reconciliation] Alert: ${action.message}`);
        } else if (action.type === 'restore_position') {
          console.log(`[Reconciliation] ${action.message}`);
        }
      } catch (error) {
        console.error(`[Reconciliation] Failed to execute action:`, action, error);
      }
    }
  }
  
  private extractLabel(orderIdOrLabel: string): string {
    return orderIdOrLabel;
  }
}

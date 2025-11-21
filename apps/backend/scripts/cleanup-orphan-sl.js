/**
 * Emergency orphan SL order cleanup
 * Cancels all reduce_only orders on BTC_USDC-PERPETUAL when no position exists
 */

const { BackendDeribitClient } = require('./dist/deribit-client.js');
const fs = require('fs');

async function cleanupOrphanOrders() {
  try {
    console.log('[Cleanup] 🔍 Starting orphan order cleanup...');
    
    // Load credentials
    const credPath = '/root/Tradebaas/backend/.credentials/live.json';
    const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    
    console.log('[Cleanup] 📡 Connecting to Deribit LIVE...');
    const client = new BackendDeribitClient(credentials, 'live');
    await client.connect();
    
    console.log('[Cleanup] ✅ Connected to Deribit');
    
    // Check positions
    console.log('[Cleanup] 📊 Checking positions...');
    const positions = await client.getPositions('USDC');
    const btcPosition = positions.find(p => p.instrument_name === 'BTC_USDC-PERPETUAL');
    
    if (btcPosition && Math.abs(btcPosition.size) > 0) {
      console.log(`[Cleanup] ⚠️  WARNING: Position still exists (${btcPosition.size} contracts)`);
      console.log('[Cleanup] ❌ ABORT: Not safe to cancel orders while position is open');
      process.exit(1);
    }
    
    console.log('[Cleanup] ✅ No position - safe to cleanup');
    
    // Get open orders
    console.log('[Cleanup] 🔍 Fetching open orders for BTC_USDC-PERPETUAL...');
    const openOrders = await client.getOpenOrders('BTC_USDC-PERPETUAL');
    
    if (!openOrders || openOrders.length === 0) {
      console.log('[Cleanup] ✅ No open orders found - cleanup not needed');
      process.exit(0);
    }
    
    console.log(`[Cleanup] 📋 Found ${openOrders.length} open orders`);
    
    // Filter reduce_only orders
    const reduceOnlyOrders = openOrders.filter(o => o.reduce_only === true);
    
    if (reduceOnlyOrders.length === 0) {
      console.log('[Cleanup] ✅ No reduce_only orders found - cleanup not needed');
      process.exit(0);
    }
    
    console.log(`[Cleanup] ⚠️  Found ${reduceOnlyOrders.length} orphan reduce_only orders:`);
    reduceOnlyOrders.forEach(o => {
      console.log(`[Cleanup]    - ${o.order_id} (${o.order_type}, ${o.direction}, ${o.amount})`);
    });
    
    // Cancel each order
    console.log('[Cleanup] 🗑️  Cancelling orphan orders...');
    for (const order of reduceOnlyOrders) {
      try {
        await client.cancelOrder(order.order_id);
        console.log(`[Cleanup] ✅ Cancelled: ${order.order_id} (${order.order_type})`);
      } catch (err) {
        console.error(`[Cleanup] ❌ Failed to cancel ${order.order_id}:`, err.message);
      }
    }
    
    console.log('[Cleanup] 🎉 Orphan cleanup complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('[Cleanup] ❌ Error:', error.message);
    process.exit(1);
  }
}

cleanupOrphanOrders();

import { BackendDeribitClient } from '../deribit-client';
import { TradeRecord } from './ITradeHistoryStore';

export interface ExitDetails {
  exitPrice: number;
  pnl: number;
  pnlPercentage: number;
  exitReason: 'sl_hit' | 'tp_hit' | 'manual' | 'strategy_stop' | 'error';
  fees: number;
  source: 'deribit_trades' | 'estimation';
}

/**
 * Derive accurate exit details (reason + net PnL including fees) using Deribit trade data.
 * Falls back to estimation if user trades cannot be retrieved.
 */
export async function deriveExitDetails(client: BackendDeribitClient, trade: TradeRecord): Promise<ExitDetails> {
  try {
    const [ticker, userTradesResp] = await Promise.all([
      client.getTicker(trade.instrument),
      client.sendRequest('private/get_user_trades_by_instrument', {
        instrument_name: trade.instrument,
        count: 100,
        include_old: true
      })
    ]);

    const exitPrice = ticker.last_price;
    const allTrades: any[] = userTradesResp.trades || [];
    const entryTrades = allTrades.filter(t => t.order_id === trade.entryOrderId);
    const exitTrades = allTrades.filter(t => t.order_id === trade.slOrderId || t.order_id === trade.tpOrderId);

    if (exitTrades.length > 0 && entryTrades.length > 0) {
      const entryValue = entryTrades.reduce((s, t) => s + (t.price * t.amount), 0);
      const exitValue = exitTrades.reduce((s, t) => s + (t.price * t.amount), 0);
      const totalFees = [...entryTrades, ...exitTrades].reduce((s, t) => s + (t.fee || 0), 0);
      let pnl: number;
      if (trade.side === 'buy') {
        pnl = exitValue - entryValue - totalFees;
      } else {
        pnl = entryValue - exitValue - totalFees;
      }
      const pnlPercentage = entryValue !== 0 ? (pnl / entryValue) * 100 : 0;
      const slFilled = exitTrades.some(t => t.order_id === trade.slOrderId);
      const tpFilled = exitTrades.some(t => t.order_id === trade.tpOrderId);
      let exitReason: ExitDetails['exitReason'] = 'manual';
      if (slFilled) exitReason = 'sl_hit';
      else if (tpFilled) exitReason = 'tp_hit';
      return { exitPrice, pnl, pnlPercentage, exitReason, fees: totalFees, source: 'deribit_trades' };
    }

    // Fallback estimation
    return estimateExit(trade, exitPrice);
  } catch (err) {
    // Fallback if Deribit call fails
    const ticker = await client.getTicker(trade.instrument).catch(() => ({ last_price: trade.entryPrice }));
    return estimateExit(trade, ticker.last_price);
  }
}

function estimateExit(trade: TradeRecord, exitPrice: number): ExitDetails {
  const priceChangePercent = (exitPrice - trade.entryPrice) / trade.entryPrice;
  let pnl: number;
  if (trade.side === 'buy') {
    pnl = priceChangePercent * trade.amount; // linear contract approximation
  } else {
    pnl = -priceChangePercent * trade.amount;
  }
  const pnlPercentage = priceChangePercent * 100 * (trade.side === 'buy' ? 1 : -1);
  // Approximate exit reason by proximity
  let exitReason: ExitDetails['exitReason'] = 'manual';
  if (trade.stopLoss && Math.abs(exitPrice - trade.stopLoss) < Math.abs(exitPrice - trade.takeProfit)) exitReason = 'sl_hit';
  else if (trade.takeProfit && Math.abs(exitPrice - trade.takeProfit) < Math.abs(exitPrice - trade.stopLoss)) exitReason = 'tp_hit';
  return { exitPrice, pnl, pnlPercentage, exitReason, fees: 0, source: 'estimation' };
}

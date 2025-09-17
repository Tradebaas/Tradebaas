import { NextResponse } from 'next/server';
import { getAccountSummary, getUserTradesByCurrency, getOpenPositions, getTicker, type UserTrade, type Position, type Ticker } from '@/lib/deribit';

function startOfUtcDay(ts: number) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return Date.UTC(y, m, day);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const currency = (searchParams.get('currency') || 'USDC').toUpperCase();

    const now = Date.now();
    const start = startOfUtcDay(now); // Today 00:00 UTC
    const end = now;

    // Fetch account summary (baseline equity)
    const summary = await getAccountSummary(currency);

    // Fetch today's trades (futures)
    const trades = await getUserTradesByCurrency(currency, start, end, 500);
    let tradesCount = 0;
    let tradedNotional = 0;
    for (const t of trades as UserTrade[]) {
      tradesCount += 1;
      tradedNotional += Math.abs((t.amount || 0) * (t.price || 0));
    }

    // Realized PnL quick approximation (without full position accounting):
    // We approximate realized PnL today as 0 by default to avoid misleading values without a stateful engine.
    // If needed, more accurate RPL can be derived by pairing buys/sells from start-of-day position snapshot.
    const realizedPnlToday = 0;

    // Unrealized PnL for open positions (mark - avg) * size
    let unrealizedPnl = 0;
    const openPositions = await getOpenPositions(currency);
    for (const p of openPositions as Position[]) {
  const ticker: Ticker = await getTicker(p.instrument_name);
  const mark = ticker.mark_price ?? ticker.index_price ?? ticker.last_price ?? 0;
      const avg = p.average_price ?? 0;
      if (mark && avg && p.size) {
        // Futures on Deribit are quoted in the underlying currency; assume linear USDC contracts for this project
        unrealizedPnl += (mark - avg) * p.size;
      }
    }

    const pnlToday = realizedPnlToday + unrealizedPnl;

    return NextResponse.json({
      ok: true,
      currency,
      equity: summary?.equity ?? null,
      tradesCount,
      tradedNotional,
      pnlToday,
    });
  } catch (e) {
    const msg = (e as { message?: string })?.message || 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

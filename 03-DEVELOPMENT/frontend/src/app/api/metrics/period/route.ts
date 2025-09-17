import { NextResponse } from 'next/server';
import { getAccountSummary, getUserTradesByCurrency, getOpenPositions, getTicker, type UserTrade, type Position, type Ticker } from '@/lib/deribit';

function periodToWindow(period: string, now = Date.now()) {
  const p = (period || '1d').toLowerCase();
  const ms = 1000;
  const day = 24 * 60 * 60 * ms;
  switch (p) {
    case '1d':
      // Start of UTC day
      const d = new Date(now);
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      return { start, end: now };
    case '1w':
      return { start: now - 7 * day, end: now };
    case '1m':
      return { start: now - 30 * day, end: now };
    case '6m':
      return { start: now - 182 * day, end: now };
    case '1y':
      return { start: now - 365 * day, end: now };
    default:
      return { start: now - 7 * day, end: now };
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const currency = (searchParams.get('currency') || 'USDC').toUpperCase();
    const period = (searchParams.get('period') || '1d').toLowerCase();

    const { start, end } = periodToWindow(period);

    const summary = await getAccountSummary(currency);
    const trades = await getUserTradesByCurrency(currency, start, end, 1000);

    let tradesCount = 0;
    let tradedNotional = 0;
    for (const t of trades as UserTrade[]) {
      tradesCount += 1;
      tradedNotional += Math.abs((t.amount || 0) * (t.price || 0));
    }

    // PnL proxy: for 1d include unrealized based on current open positions; realized set to 0 (placeholder)
    let pnl: number | null = null;
    if (period === '1d') {
      let unrealizedPnl = 0;
      const openPositions = await getOpenPositions(currency);
      for (const p of openPositions as Position[]) {
        const ticker: Ticker = await getTicker(p.instrument_name);
        const mark = ticker.mark_price ?? ticker.index_price ?? ticker.last_price ?? 0;
        const avg = p.average_price ?? 0;
        if (mark && avg && p.size) {
          unrealizedPnl += (mark - avg) * p.size;
        }
      }
      pnl = 0 + unrealizedPnl;
    }

    // Compute winrate, drawdown and win/loss ratio from trades using simple FIFO pairing per instrument
    function computeMetrics(allTrades: UserTrade[], baseEquity: number | null | undefined) {
      if (!allTrades || allTrades.length === 0) {
        return { winrate: null as number | null, drawdown: null as number | null, winRatio: null as number | null };
      }

      // Sort trades by time ascending to reconstruct fills
      const sorted = [...allTrades].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      type Lot = { price: number; size: number }; // size > 0 long, < 0 short
      const books = new Map<string, Lot[]>(); // instrument -> FIFO lots

      type Closure = { ts: number; pnl: number };
      const closures: Closure[] = [];

      for (const t of sorted) {
        const instr = t.instrument_name;
        if (!instr || !isFinite(t.amount) || !isFinite(t.price) || !t.direction) continue;
        const lots = books.get(instr) || [];

        const delta = t.direction === 'buy' ? Math.abs(t.amount) : -Math.abs(t.amount);
        const incomingSign = Math.sign(delta) as 1 | -1 | 0;
        if (incomingSign === 0) continue;

        let remaining = Math.abs(delta);

        // If incoming sign is opposite to current position sign (lots[0] sign), we close against FIFO
        while (remaining > 0 && lots.length > 0 && Math.sign(lots[0].size) !== incomingSign) {
          const lot = lots[0];
          const closable = Math.min(Math.abs(lot.size), remaining);
          // PnL formula unified: (close - entry) * qty * sign(entry)
          const entrySign = Math.sign(lot.size);
          const pnlSegment = (t.price - lot.price) * closable * entrySign;
          closures.push({ ts: t.timestamp, pnl: pnlSegment });

          // Reduce the lot
          lot.size += entrySign * -closable; // move lot toward 0
          if (Math.abs(lot.size) < 1e-12) {
            lots.shift();
          }
          remaining -= closable;
        }

        // Any remainder opens a new lot with incoming sign
        if (remaining > 0) {
          lots.push({ price: t.price, size: incomingSign * remaining });
        }

        books.set(instr, lots);
      }

      // Aggregate closure stats
      let wins = 0;
      let losses = 0;
      let sumWins = 0;
      let sumLosses = 0; // negative sum
      const curve: { ts: number; cum: number }[] = [];
      let cum = 0;
      for (const c of closures.sort((a, b) => a.ts - b.ts)) {
        cum += c.pnl;
        curve.push({ ts: c.ts, cum });
        if (c.pnl > 0) {
          wins += 1;
          sumWins += c.pnl;
        } else if (c.pnl < 0) {
          losses += 1;
          sumLosses += c.pnl;
        }
      }

      const totalOutcomes = wins + losses;
      const winrate = totalOutcomes > 0 ? Math.round((wins / totalOutcomes) * 1000) / 10 : null; // % with 0.1 precision

      let winRatio: number | null = null;
      if (wins > 0 && losses > 0) {
        const avgWin = sumWins / wins;
        const avgLoss = Math.abs(sumLosses) / losses;
        if (avgLoss > 0) winRatio = Math.round(((avgWin / avgLoss) + Number.EPSILON) * 100) / 100; // 2 decimals
      }

      // Max drawdown based on equity curve = baseline + cumPnL
      let drawdown: number | null = null;
      const baseline = typeof baseEquity === 'number' && isFinite(baseEquity) && baseEquity > 0 ? baseEquity : 0;
      if (curve.length > 0 && baseline > 0) {
        let peak = baseline;
        let maxDd = 0;
        for (const point of curve) {
          const equity = baseline + point.cum;
          if (equity > peak) peak = equity;
          const dd = peak > 0 ? (peak - equity) / peak : 0;
          if (dd > maxDd) maxDd = dd;
        }
        drawdown = Math.round(maxDd * 1000) / 10; // % with 0.1 precision
      }

      return { winrate, drawdown, winRatio };
    }

    const { winrate, drawdown, winRatio } = computeMetrics(trades as UserTrade[], summary?.equity);

    return NextResponse.json({
      ok: true,
      currency,
      period,
      equity: summary?.equity ?? null,
      tradesCount,
      tradedNotional,
      pnl,
      winrate,
      drawdown,
      winRatio,
      start,
      end,
    });
  } catch (e) {
    const msg = (e as { message?: string })?.message || 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

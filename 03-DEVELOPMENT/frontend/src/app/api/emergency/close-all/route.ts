import { NextResponse } from 'next/server';
import { getOpenPositions, closePosition, getDeribitEnv, cancelAllByCurrency } from '@/lib/deribit';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { env } = getDeribitEnv();
    // Only allow in live env by default; optional override via env var
    if (env !== 'prod' && process.env.ALLOW_EMERGENCY_ON_TEST !== 'true') {
      return NextResponse.json({ ok: false, error: 'Emergency close disabled on test env' }, { status: 400 });
    }

    const currency = (process.env.DERIBIT_CURRENCY || 'USDC').toUpperCase();
  // Cancel all open orders for safety
  const cancelRes = await cancelAllByCurrency(currency).catch((e) => ({ error: (e as Error).message }));
  const open = await getOpenPositions(currency);
    if (!open.length) {
      return NextResponse.json({ ok: true, closed: [], message: 'No open positions' });
    }

    const results: Array<{ instrument: string; ok: boolean; error?: string }> = [];

    for (const p of open) {
      try {
        await closePosition(p.instrument_name, 'market');
        results.push({ instrument: p.instrument_name, ok: true });
      } catch (e) {
        results.push({ instrument: p.instrument_name, ok: false, error: (e as Error).message });
      }
    }

    const failed = results.filter(r => !r.ok);
    const status = failed.length ? 207 : 200; // Multi-Status if partial failure

  return NextResponse.json({ ok: failed.length === 0, cancelled: cancelRes, results }, { status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { getAccountSummary } from '@/lib/deribit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const currency = (searchParams.get('currency') || 'USDC').toUpperCase();

    const summary = await getAccountSummary(currency);

    return new Response(
      JSON.stringify({ ok: true, equity: summary.equity, currency: summary.currency, summary }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = (err as { message?: string })?.message || 'Unknown error';
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

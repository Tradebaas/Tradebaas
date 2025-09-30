import { NextResponse } from 'next/server';
import { placeOrder } from '@/lib/deribit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeNumber(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const instrumentName = String(body?.instrumentName ?? '').trim();
    const direction = String(body?.direction ?? '').trim().toLowerCase();
    const amount = normalizeNumber(body?.amount);
    const typeInput = String(body?.type ?? 'limit').trim().toLowerCase();
    const price = normalizeNumber(body?.price);
    const timeInForceInput = body?.timeInForce ? String(body.timeInForce).trim().toLowerCase() : undefined;
    const reduceOnly = body?.reduceOnly === true;
    const label = body?.label ? String(body.label).trim() : undefined;

    if (!instrumentName) {
      return NextResponse.json({ ok: false, error: 'instrumentName is verplicht' }, { status: 400 });
    }

    if (direction !== 'buy' && direction !== 'sell') {
      return NextResponse.json({ ok: false, error: 'direction moet "buy" of "sell" zijn' }, { status: 400 });
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'amount moet groter dan 0 zijn' }, { status: 400 });
    }

    const type = typeInput === 'market' ? 'market' : 'limit';
    const timeInForce = timeInForceInput === 'fill_or_kill'
      ? 'fill_or_kill'
      : timeInForceInput === 'immediate_or_cancel'
      ? 'immediate_or_cancel'
      : 'good_til_cancelled';

    if (type === 'limit' && (!price || price <= 0)) {
      return NextResponse.json({ ok: false, error: 'price is vereist voor limit orders' }, { status: 400 });
    }

    const result = await placeOrder({
      instrumentName,
      direction: direction as 'buy' | 'sell',
      amount,
      type,
      price,
      timeInForce,
      reduceOnly,
      label
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = (error as { message?: string })?.message || 'Onbekende fout';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

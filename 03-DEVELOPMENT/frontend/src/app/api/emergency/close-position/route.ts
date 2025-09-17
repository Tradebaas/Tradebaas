import { NextResponse } from 'next/server';
import { closePosition, getDeribitEnv } from '@/lib/deribit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { env } = getDeribitEnv();
    if (env !== 'prod' && process.env.ALLOW_EMERGENCY_ON_TEST !== 'true') {
      return NextResponse.json({ ok: false, error: 'Emergency close disabled on test env' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const instrumentName = body?.instrumentName as string | undefined;
    if (!instrumentName) {
      return NextResponse.json({ ok: false, error: 'instrumentName is required' }, { status: 400 });
    }

    const result = await closePosition(instrumentName, 'market');
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

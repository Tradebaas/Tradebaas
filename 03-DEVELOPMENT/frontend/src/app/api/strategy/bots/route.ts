import { NextResponse } from 'next/server';

// Simple env-based mapping for bot cards → instrument names.
// Configure via env vars (server-side):
// TB_BOT_CARD_1_INSTRUMENT, TB_BOT_CARD_2_INSTRUMENT, TB_BOT_CARD_3_INSTRUMENT, ...

type BotInstrument = { id: string; instrumentName?: string };

export async function GET() {
  try {
    // Read up to 10 bot card mappings for flexibility
    const bots: BotInstrument[] = [];
    for (let i = 1; i <= 10; i++) {
      const id = `card-${i}`;
      const envKey = `TB_BOT_CARD_${i}_INSTRUMENT`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = (process.env as any)[envKey] as string | undefined;
      if (val && typeof val === 'string' && val.trim()) {
        bots.push({ id, instrumentName: val.trim() });
      }
    }

    // If none configured, provide safe defaults matching current UI seeds
    if (bots.length === 0) {
      bots.push(
        { id: 'card-1', instrumentName: 'BTC-PERPETUAL' },
        { id: 'card-2', instrumentName: 'ETH-PERPETUAL' },
        { id: 'card-3', instrumentName: 'SOL-PERPETUAL' },
      );
    }

    return NextResponse.json({ ok: true, bots });
  } catch (e) {
    const msg = (e as { message?: string })?.message || 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

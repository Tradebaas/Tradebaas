import { NextResponse } from 'next/server';

// In-memory opslag van bot-modi (AUTO/MANUAL). In productie zou dit door een echte orchestrator worden beheerd.
const botModes = new Map<string, 'auto' | 'manual'>();

export async function GET() {
  // Geeft huidige map terug voor snelle verificatie/debug
  const modes = Array.from(botModes.entries()).map(([id, mode]) => ({ id, mode }));
  return NextResponse.json({ ok: true, modes });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? '').trim();
    const mode = String(body?.mode ?? '').trim();
    if (!id || (mode !== 'auto' && mode !== 'manual')) {
      return NextResponse.json({ ok: false, error: 'Invalid id or mode' }, { status: 400 });
    }
    botModes.set(id, mode as 'auto' | 'manual');
    return NextResponse.json({ ok: true, id, mode });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message || 'Unknown error' }, { status: 500 });
  }
}

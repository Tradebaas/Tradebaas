import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fileExists(path?: string) {
  // In dev we won't rely on fs to avoid lint issues; just assert path presence.
  return Boolean(path);
}

export async function GET(_req: NextRequest) {
  const env = (process.env.DERIBIT_ENV || 'prod').toLowerCase();
  const isTest = env === 'test' || env === 'testnet';

  const presence = {
    DERIBIT_ENV: process.env.DERIBIT_ENV ?? null,
    // generic
    DERIBIT_CLIENT_ID: Boolean(process.env.DERIBIT_CLIENT_ID),
    DERIBIT_CLIENT_SECRET: Boolean(process.env.DERIBIT_CLIENT_SECRET),
    DERIBIT_CLIENT_ID_FILE: fileExists(process.env.DERIBIT_CLIENT_ID_FILE),
    DERIBIT_CLIENT_SECRET_FILE: fileExists(process.env.DERIBIT_CLIENT_SECRET_FILE),
    // env-specific
    DERIBIT_CLIENT_ID_TEST: Boolean(process.env.DERIBIT_CLIENT_ID_TEST),
    DERIBIT_CLIENT_SECRET_TEST: Boolean(process.env.DERIBIT_CLIENT_SECRET_TEST),
    DERIBIT_CLIENT_ID_PROD: Boolean(process.env.DERIBIT_CLIENT_ID_PROD),
    DERIBIT_CLIENT_SECRET_PROD: Boolean(process.env.DERIBIT_CLIENT_SECRET_PROD),
  };

  const selected = {
    mode: isTest ? 'test' : 'prod',
    prefers: isTest ? '..._TEST' : '..._PROD',
    fallback: 'generic or *_FILE',
  };

  return new Response(
    JSON.stringify({ ok: true, env: selected, presence }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}

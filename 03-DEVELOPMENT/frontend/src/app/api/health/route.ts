import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: process.env.DERIBIT_ENV || 'prod',
    time: new Date().toISOString(),
  });
}

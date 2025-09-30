import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { Strategy } from '@/components';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATA_DIR = path.join(process.cwd(), 'data');
const STRATEGIES_FILE = path.join(DATA_DIR, 'strategies.json');

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STRATEGIES_FILE);
  } catch {
    await fs.writeFile(STRATEGIES_FILE, '[]', 'utf8');
  }
}

async function readCustomStrategies(): Promise<Strategy[]> {
  try {
    await ensureDataFile();
    const raw = await fs.readFile(STRATEGIES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Strategy => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string'))
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        description: String((item as { description?: string }).description ?? '').trim() || 'No description provided.'
      }));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeCustomStrategies(strategies: Strategy[]) {
  await ensureDataFile();
  await fs.writeFile(STRATEGIES_FILE, JSON.stringify(strategies, null, 2), 'utf8');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64);
}

export async function GET() {
  try {
    const strategies = await readCustomStrategies();
    return NextResponse.json({ ok: true, strategies });
  } catch (error) {
    const message = (error as { message?: string })?.message || 'Kon strategieën niet lezen';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const payload = Array.isArray(body?.strategies)
      ? body.strategies
      : body?.strategy
      ? [body.strategy]
      : Array.isArray(body)
      ? body
      : [body];

    const sanitized: Strategy[] = [];
    const seenIds = new Set<string>();

    for (const entry of payload) {
      if (!entry || typeof entry !== 'object') continue;
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      const description = typeof entry.description === 'string' ? entry.description.trim() : '';
      if (!name) continue;

      const preferredId = typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : name;
      const baseSlug = slugify(preferredId) || slugify(name) || `strategy-${Date.now()}`;
      let slug = baseSlug;
      let suffix = 2;
      while (seenIds.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      seenIds.add(slug);

      sanitized.push({
        id: slug,
        name,
        description: description || 'No description provided.'
      });
      if (sanitized.length >= 50) break;
    }

    if (sanitized.length === 0) {
      return NextResponse.json({ ok: false, error: 'Geen geldige strategieën gevonden' }, { status: 400 });
    }

    const existing = await readCustomStrategies();
    const map = new Map<string, Strategy>();
    existing.forEach((strategy) => {
      map.set(strategy.id, strategy);
    });
    sanitized.forEach((strategy) => {
      map.set(strategy.id, strategy);
    });

    const result = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    await writeCustomStrategies(result);

    return NextResponse.json({ ok: true, strategies: result });
  } catch (error) {
    const message = (error as { message?: string })?.message || 'Kon strategie niet opslaan';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

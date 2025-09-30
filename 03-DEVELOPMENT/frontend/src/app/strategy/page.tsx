'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components';
import type { Strategy } from '@/components';
import { BASE_STRATEGIES } from '@/lib/strategies';

interface UploadStrategyInput {
  id?: string;
  name: string;
  description?: string;
}

export default function StrategyPage() {
  const [customStrategies, setCustomStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const fetchStrategies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/strategy/custom', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || data.ok !== true || !Array.isArray(data.strategies)) {
        throw new Error((data && data.error) || `HTTP ${res.status}`);
      }

      const sanitized = (data.strategies as Strategy[]).map((strategy) => ({
        id: String(strategy.id),
        name: String(strategy.name),
        description: String(strategy.description ?? '').trim() || 'No description provided.'
      }));

      setCustomStrategies(sanitized);
    } catch (err) {
      const message = (err as { message?: string })?.message || 'Kon strategieën niet laden';
      setError(message);
      setCustomStrategies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies().catch(() => {});
  }, [fetchStrategies]);

  const allStrategies = useMemo(() => {
    return [...BASE_STRATEGIES, ...customStrategies];
  }, [customStrategies]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Naam is verplicht');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        strategies: [
          {
            name: name.trim(),
            description: description.trim()
          }
        ]
      };
      const res = await fetch('/api/strategy/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || data.ok !== true || !Array.isArray(data.strategies)) {
        throw new Error((data && data.error) || `HTTP ${res.status}`);
      }

      const sanitized = (data.strategies as Strategy[]).map((strategy) => ({
        id: String(strategy.id),
        name: String(strategy.name),
        description: String(strategy.description ?? '').trim() || 'No description provided.'
      }));

      setCustomStrategies(sanitized);
      setName('');
      setDescription('');
      setSuccess('Strategie opgeslagen');
    } catch (err) {
      const message = (err as { message?: string })?.message || 'Kon strategie niet opslaan';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Bestand bevat geen geldige JSON');
      }

      const inputs: UploadStrategyInput[] = (Array.isArray(parsed) ? parsed : [parsed])
        .filter((item): item is UploadStrategyInput => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          id: typeof (item as UploadStrategyInput).id === 'string' ? (item as UploadStrategyInput).id : undefined,
          name: typeof (item as UploadStrategyInput).name === 'string' ? (item as UploadStrategyInput).name : '',
          description: typeof (item as UploadStrategyInput).description === 'string'
            ? (item as UploadStrategyInput).description
            : ''
        }))
        .filter((item) => item.name.trim().length > 0);

      if (inputs.length === 0) {
        throw new Error('Bestand bevat geen geldige strategieën');
      }

      const res = await fetch('/api/strategy/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategies: inputs })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || data.ok !== true || !Array.isArray(data.strategies)) {
        throw new Error((data && data.error) || `HTTP ${res.status}`);
      }

      const sanitized = (data.strategies as Strategy[]).map((strategy) => ({
        id: String(strategy.id),
        name: String(strategy.name),
        description: String(strategy.description ?? '').trim() || 'No description provided.'
      }));

      setCustomStrategies(sanitized);
      setSuccess(inputs.length === 1 ? 'Strategie geïmporteerd' : `${inputs.length} strategieën geïmporteerd`);
    } catch (err) {
      const message = (err as { message?: string })?.message || 'Importeren mislukt';
      setError(message);
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
        <header className="space-y-3">
          <h1 className="text-3xl font-normal tracking-wide">Strategy Management</h1>
          <p className="text-sm text-white/70 max-w-2xl">
            Beheer de ingebouwde strategieën en voeg eigen trading-logica toe via JSON of handmatige invoer. Aangepaste strategieën
            worden opgeslagen op de server en zijn direct beschikbaar op het dashboard.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 border-white/10 bg-white/5">
            <CardHeader className="mb-2">
              <CardTitle className="text-lg font-normal text-white">Beschikbare strategieën</CardTitle>
              <p className="text-xs text-white/60">{allStrategies.length} totaal • {customStrategies.length} custom</p>
            </CardHeader>
            <CardContent className="space-y-6 text-sm text-white/80">
              <section className="space-y-2">
                <h2 className="text-xs uppercase tracking-widest text-white/50">Built-in</h2>
                <div className="space-y-3">
                  {BASE_STRATEGIES.map((strategy) => (
                    <div key={strategy.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="font-medium text-white/90">{strategy.name}</div>
                      <p className="mt-1 text-xs leading-relaxed text-white/60">{strategy.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs uppercase tracking-widest text-white/50">Custom</h2>
                  {loading && <span className="text-[11px] text-white/60">Laden…</span>}
                </div>
                <div className="space-y-3">
                  {loading && (
                    <>
                      <Skeleton className="h-16 w-full bg-white/10" useDefaultBg={false} />
                      <Skeleton className="h-16 w-full bg-white/10" useDefaultBg={false} />
                    </>
                  )}
                  {!loading && customStrategies.length === 0 && (
                    <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-white/50">
                      Geen custom strategieën gevonden.
                    </div>
                  )}
                  {!loading && customStrategies.map((strategy) => (
                    <div key={strategy.id} className="rounded-lg border border-brand-mint/20 bg-brand-mint/5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-white/90">{strategy.name}</div>
                        <span className="text-[11px] text-white/50">{strategy.id}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-white/70">{strategy.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-lg font-normal text-white">Nieuwe strategie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-lg border border-brand-mint/40 bg-brand-mint/10 px-3 py-2 text-xs text-brand-mint">
                  {success}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1">
                  <label htmlFor="strategy-name" className="text-xs uppercase tracking-widest text-white/50">
                    Naam
                  </label>
                  <input
                    id="strategy-name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white focus:border-brand-mint focus:outline-none focus:ring-2 focus:ring-brand-mint/40"
                    placeholder="Bijv. Mean Reversion"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="strategy-description" className="text-xs uppercase tracking-widest text-white/50">
                    Beschrijving
                  </label>
                  <textarea
                    id="strategy-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="h-24 w-full rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white focus:border-brand-mint focus:outline-none focus:ring-2 focus:ring-brand-mint/40"
                    placeholder="Wat doet deze strategie?"
                  />
                </div>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="w-full border border-brand-mint/40 text-brand-mint hover:bg-brand-mint/10"
                  loading={isSubmitting}
                >
                  Opslaan
                </Button>
              </form>

              <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
                <div>
                  <h3 className="text-sm font-medium text-white/90">Importeer JSON</h3>
                  <p className="mt-1 text-xs text-white/60">
                    Upload een JSON-bestand met een enkele strategie of een array van strategie-objecten (id, name, description).
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-white/15 px-3 py-2 text-xs text-white/80 hover:bg-white/10">
                  <input
                    type="file"
                    accept="application/json"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isImporting}
                  />
                  {isImporting ? 'Importeren…' : 'Selecteer JSON'}
                </label>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

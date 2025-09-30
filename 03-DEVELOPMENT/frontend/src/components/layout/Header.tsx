'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components';
import { useMode } from '@/context/ModeContext';
import { useBots } from '@/context/BotsContext';

interface HeaderProps {
  className?: string;
}

// Live/Demo toggle states
type ConnectionStatus = 'connected' | 'connecting' | 'error' | 'demo';

const connectionColors = {
  connected: 'bg-green-500',
  connecting: 'bg-orange-500',
  error: 'bg-red-500',
  demo: 'bg-blue-500'
};

// Timezone options
const TIMEZONE_OPTIONS = [
  { name: 'Nederland', value: 'Europe/Amsterdam', label: 'CET/CEST' },
  { name: 'UTC', value: 'UTC', label: 'UTC' },
  { name: 'New York', value: 'America/New_York', label: 'EST/EDT' },
  { name: 'London', value: 'Europe/London', label: 'GMT/BST' },
  { name: 'Tokyo', value: 'Asia/Tokyo', label: 'JST' },
  { name: 'Sydney', value: 'Australia/Sydney', label: 'AEST/AEDT' }
];

export default function Header({ className }: HeaderProps) {
  const { mode, toggleMode } = useMode();
  const [isDark, setIsDark] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    mode === 'demo' ? 'demo' : 'connecting'
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showConnectionInfoModal, setShowConnectionInfoModal] = useState(false);
  const [lastCheckAt, setLastCheckAt] = useState<Date | null>(null);
  const [lastOkAt, setLastOkAt] = useState<Date | null>(null);
  const [lastOkData, setLastOkData] = useState<{ equity?: number; currency?: string; summary?: unknown } | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [selectedTimezone, setSelectedTimezone] = useState(TIMEZONE_OPTIONS[0]);
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const hasInitialCheckedRef = useRef(false);

  // Initialize time on client-side only to prevent hydration mismatch
  useEffect(() => {
    setCurrentTime(new Date());
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Ensure dark theme is active on mount
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
  }, [isDark]);

  // Connectivity check against Deribit balance endpoint
  const runConnectivityCheck = async (silent = false) => {
    try {
      if (!silent) {
        setConnectionStatus('connecting');
        setConnectionError(null);
      }
      const res = await fetch('/api/deribit/balance?currency=USDC', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));

      setLastCheckAt(new Date());
      if (res.ok && data && data.ok) {
        setConnectionStatus('connected');
        setConnectionError(null);
        setLastOkAt(new Date());
        setLastOkData({ equity: data.equity, currency: data.currency, summary: data.summary });
        return true;
      }
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      setConnectionStatus('error');
      setConnectionError(String(msg));
      return false;
    } catch (e) {
      const msg = (e as { message?: string })?.message || 'Network error';
      setConnectionStatus('error');
      setConnectionError(String(msg));
      return false;
    }
  };

  useEffect(() => {
    if (mode === 'live') {
      // Initial check
      hasInitialCheckedRef.current = true;
      runConnectivityCheck(false);
      // Poll periodically without flashing connecting
      const id = setInterval(() => runConnectivityCheck(true), 10000);
      return () => {
        clearInterval(id);
      };
    } else {
      // Demo mode: no network, fixed status
      setConnectionStatus('demo');
      setConnectionError(null);
      return () => {
      };
    }
  }, [mode]);

  const toggleTheme = () => {
    setIsDark(!isDark);
    // Toggle the class on document.documentElement for global theme
    if (!isDark) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  };

  const isLiveMode = mode === 'live';
  const { globalStopped, stopAll, startAll } = useBots();

  const formatTime = (date: Date) => {
    const timeString = date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: selectedTimezone.value
    });
    
    return timeString;
  };

  const getTimezoneInfo = (date: Date) => {
    // Get timezone offset and name for tooltip
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: selectedTimezone.value,
      timeZoneName: 'short'
    });
    
    const parts = formatter.formatToParts(date);
    const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value || selectedTimezone.label;
    
    return `${selectedTimezone.name} (${timeZoneName})`;
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      case 'demo': return 'Demo Mode';
      default: return 'Unknown';
    }
  };

  // Emergency stop modal state
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [stopResult, setStopResult] = useState<{ ok: boolean; message?: string; results?: Array<{ instrument: string; ok: boolean; error?: string }> } | null>(null);
  const [showStopResult, setShowStopResult] = useState(false);

  const handleEmergencyStop = async () => {
    try {
      const res = await fetch('/api/emergency/close-all', { method: 'POST', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setStopResult(data);
      setShowStopResult(true);
    } catch (e) {
      setStopResult({ ok: false, message: (e as { message?: string })?.message || 'Network error' });
      setShowStopResult(true);
    }
  };

  return (
    <header 
      className={cn('', className)}
      style={{ backgroundColor: '#252823' }}
    >
      <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="flex items-center h-16">
          
          {/* Left side: Logo + Badge + Clock (consistent spacing) */}
          <div className="flex items-center flex-shrink-0 gap-4">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-4">
              <span className="flex items-center gap-2">
                <Image
                  src={isDark ? "/logo-yellow.png" : "/logo-black.png"}
                  alt="Tradebaas"
                  width={32}
                  height={32}
                  className="w-8 h-8 flex-shrink-0"
                />
                <span className={cn(
                  "text-xl font-semibold whitespace-nowrap",
                  isDark ? "text-yellow-400" : "text-black"
                )}>
                  Tradebaas
                </span>
              </span>
              {/* Subtle mode badge */}
              {mode === 'live' ? (
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] leading-none font-bold uppercase tracking-wide border"
                  style={{
                    backgroundColor: 'rgba(34,197,94,0.12)', // green-500 @ 12%
                    borderColor: 'rgba(34,197,94,0.25)',
                    color: '#86efac' // green-300
                  }}
                >
                  LIVE
                </span>
              ) : (
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] leading-none font-bold uppercase tracking-wide border"
                  style={{
                    backgroundColor: 'rgba(59,130,246,0.12)', // blue-500 @ 12%
                    borderColor: 'rgba(59,130,246,0.25)',
                    color: '#93c5fd' // blue-300
                  }}
                >
                  DEMO
                </span>
              )}
            </Link>

            {/* Clock next to badge */}
            <button
              onClick={() => setShowTimezoneModal(true)}
              className="text-sm font-semibold text-gray-600 dark:text-gray-200 tabular-nums hover:text-gray-800 dark:hover:text-white transition-colors cursor-pointer"
              title={currentTime ? getTimezoneInfo(currentTime) : 'Click to change timezone'}
            >
              {currentTime ? formatTime(currentTime) : '--:--:--'}
            </button>
          </div>

          {/* Center: Navigation - Flex grow to center */}
          <div className="flex-1 flex justify-center">
            <nav className="hidden md:flex items-center gap-4">
              <Link 
                href="/dashboard" 
                className="text-gray-700 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap font-semibold text-sm px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Dashboard
              </Link>
              <Link 
                href="/strategy" 
                className="text-gray-700 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap font-semibold text-sm px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Strategies
              </Link>
              <Link 
                href="/analytics" 
                className="text-gray-700 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap font-semibold text-sm px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Analytics
              </Link>
            </nav>
          </div>

          {/* Right side: Controls (consistent spacing) */}
          <div className="flex items-center flex-shrink-0 gap-4">
            
            {/* Live/Demo Toggle */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={toggleMode}
                className="relative inline-flex h-4 w-7 items-center rounded-full border transition-all duration-200 focus:outline-none hover:scale-105 flex-shrink-0"
                style={{
                  borderColor: isLiveMode 
                    ? '#22c55e' // green-500
                    : '#fbbf24', // yellow-400
                  backgroundColor: 'transparent'
                }}
              >
                <span
                  className={cn(
                    'inline-block h-2.5 w-2.5 transform rounded-full transition-all duration-200',
                    isLiveMode ? 'translate-x-3 bg-green-500' : 'translate-x-0.5 bg-yellow-400'
                  )}
                />
              </button>
              <span 
                className={cn(
                  "text-xs transition-colors duration-200 font-medium whitespace-nowrap flex-shrink-0",
                  isLiveMode 
                    ? "text-green-400" 
                    : "text-yellow-400"
                )}
                style={{ minWidth: '40px' }}
              >
                {isLiveMode ? 'LIVE' : 'DEMO'}
              </span>
            </div>

            {/* Connection Status Indicator */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => {
                  if (connectionStatus === 'error') setShowConnectionModal(true);
                  if (connectionStatus === 'connected') setShowConnectionInfoModal(true);
                }}
                className={cn(
                  'w-2.5 h-2.5 rounded-full',
                  connectionColors[connectionStatus],
                  connectionStatus === 'error' ? 'cursor-pointer' : 'cursor-default'
                )}
                title={(function () {
                  const base = getStatusText();
                  if (connectionStatus === 'connected') {
                    return 'API connection OK';
                  }
                  if (connectionStatus !== 'error' || !connectionError) return base;
                  const trimmed = connectionError.replace(/\s+/g, ' ').trim();
                  return `${base}: ${trimmed.length > 80 ? trimmed.slice(0, 77) + '…' : trimmed}`;
                })()}
                aria-label={getStatusText()}
              />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="relative p-2 w-10 h-10 flex items-center justify-center text-gray-600 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-all duration-200 hover:rotate-12 active:scale-95"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                // Sun icon
                <svg 
                  className="w-5 h-5 transform transition-transform duration-200 hover:rotate-90" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={1.5} 
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" 
                  />
                </svg>
              ) : (
                // Moon icon
                <svg 
                  className="w-5 h-5 transform transition-transform duration-200 hover:-rotate-12" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={1.5} 
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" 
                  />
                </svg>
              )}
            </button>

            {/* Emergency Stop / Start All */}
            {globalStopped ? (
              <button
                className="px-3 py-1.5 border border-brand-mint/30 text-brand-mint hover:bg-brand-mint/10 text-xs rounded font-medium transition-colors flex items-center justify-center min-w-[60px]"
                onClick={() => startAll()}
                title="Start all bots"
              >
                START
              </button>
            ) : (
              <button 
                className="px-3 py-1.5 border border-red-500 hover:border-red-600 text-white hover:bg-red-50 dark:hover:bg-red-950 text-xs rounded font-medium transition-colors flex items-center justify-center min-w-[50px]"
                onClick={async () => {
                  setShowStopConfirm(true);
                  try {
                    await fetch('/api/strategy/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'GLOBAL', mode: 'manual' }) });
                  } catch {}
                }}
                title="Close all open positions (Live) & stop all bots"
              >
                STOP
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Timezone Selection Modal */}
      <Modal 
        isOpen={showTimezoneModal} 
        onClose={() => setShowTimezoneModal(false)}
        title="Select Timezone"
        size="sm"
      >
        <div className="space-y-3">
          <div className="space-y-2">
            {TIMEZONE_OPTIONS.map((timezone) => (
              <button
                key={timezone.value}
                onClick={() => {
                  setSelectedTimezone(timezone);
                  setShowTimezoneModal(false);
                }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg transition-all duration-200 border",
                  selectedTimezone.value === timezone.value
                    ? "border-white/15 text-white"
                    : "border-white/10 text-white/80 hover:text-white hover:border-white/15"
                )}
                style={{
                  backgroundColor: selectedTimezone.value === timezone.value 
                    ? 'rgba(255, 255, 255, 0.07)' 
                    : 'rgba(255, 255, 255, 0.04)',
                  boxShadow: selectedTimezone.value === timezone.value
                    ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
                    : 'none'
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{timezone.name}</span>
                  <span 
                    className="text-xs font-mono"
                    style={{ color: '#86A694' }}
                  >
                    {timezone.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Emergency Stop Confirm */}
      <Modal
        isOpen={showStopConfirm}
        onClose={() => setShowStopConfirm(false)}
        title="Emergency Stop"
        size="sm"
      >
        <p className="text-white/85">
          Weet je zeker dat je ALLE open posities direct wilt sluiten en ALLE bots wilt stoppen? Je kunt later weer starten.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={() => setShowStopConfirm(false)} variant="ghost" className="border border-white/10 hover:border-white/15 text-white/85 hover:text-white">Annuleren</Button>
          <Button onClick={async () => { setShowStopConfirm(false); await handleEmergencyStop(); stopAll(); }} variant="ghost" className="border border-red-500/40 text-red-400 hover:bg-red-500/10">Bevestigen</Button>
        </div>
      </Modal>

      {/* Emergency Stop Result */}
      <Modal
        isOpen={showStopResult}
        onClose={() => setShowStopResult(false)}
        title={stopResult?.ok ? 'Stop voltooid' : 'Stop mislukt'}
        size="md"
      >
        {(() => {
          const results = stopResult?.results || [];
          const total = Array.isArray(results) ? results.length : 0;
          type StopItem = { ok?: boolean } & Record<string, unknown>;
          const okCount = Array.isArray(results) ? (results as StopItem[]).filter((r) => !!r.ok).length : 0;
          return (
            <div className="space-y-4">
              {stopResult?.ok ? (
                <div className="text-sm text-brand-mint">Gelukt: orders geannuleerd en {okCount}/{total} posities gesloten.</div>
              ) : (
                <div className="text-sm text-red-400">Niet volledig gelukt: {okCount}/{total} posities gesloten.</div>
              )}
              {stopResult && 'cancelled' in stopResult ? (
                <div className="text-xs text-white/70">Cancel summary: <span className="font-mono">{typeof (stopResult as { cancelled?: unknown }).cancelled === 'object' ? 'zie details' : String((stopResult as { cancelled?: unknown }).cancelled)}</span></div>
              ) : null}
              {total > 0 ? (
                <div>
                  <div className="text-sm text-white/80 mb-2">Resultaten per instrument:</div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 max-h-64 overflow-auto">
                    <pre className="text-xs whitespace-pre-wrap text-white/80">{JSON.stringify(results, null, 2)}</pre>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-white/80">{stopResult?.message || (stopResult?.ok ? 'Alle posities zijn gesloten.' : 'Onbekende fout.')}</div>
              )}
            </div>
          );
        })()}
        <div className="flex justify-end pt-2">
          <Button onClick={() => setShowStopResult(false)} variant="ghost" className="border border-white/10 hover:border-white/15 text-white/85 hover:text-white">Sluiten</Button>
        </div>
      </Modal>

      {/* Connection Error Modal */}
      <Modal
        isOpen={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
        title="Connection Error"
        size="md"
      >
        <div className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-medium text-white/90 mb-2">There was a problem connecting to the API</div>
            <pre className="text-xs text-white/80 whitespace-pre-wrap">{connectionError || 'Unknown error'}</pre>
          </div>
          <div className="text-xs text-white/60">
            Endpoint: <span className="font-mono">/api/deribit/balance?currency=USDC</span>
          </div>
          <div className="pt-1" />
          <div className="flex justify-end gap-2">
            <Button onClick={() => { if (connectionError) navigator.clipboard.writeText(connectionError); }} variant="ghost" size="sm" className="border border-white/10 hover:border-white/15 text-white/85 hover:text-white">COPY ERROR</Button>
            <Button onClick={async () => { const ok = await runConnectivityCheck(false); if (ok) setShowConnectionModal(false); }} variant="ghost" size="sm" className="border border-brand-mint/30 text-brand-mint hover:bg-brand-mint/10">RETRY</Button>
          </div>
        </div>
      </Modal>

      {/* Connection Info Modal (success state) */}
      <Modal
        isOpen={showConnectionInfoModal}
        onClose={() => setShowConnectionInfoModal(false)}
        title="Connection Status"
        size="md"
      >
        <div className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-medium text-white/90">API connection OK</div>
            <div className="text-xs text-white/70 mt-1">Endpoint: <span className="font-mono">/api/deribit/balance?currency=USDC</span></div>
            <div className="text-xs text-white/70 mt-1">Last checked: <span className="font-mono">{lastCheckAt ? new Intl.DateTimeFormat('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(lastCheckAt) : '—'}</span></div>
            <div className="text-xs text-white/70 mt-1">Last OK: <span className="font-mono">{lastOkAt ? new Intl.DateTimeFormat('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(lastOkAt) : '—'}</span></div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-white/70">Last successful response</div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 max-h-64 overflow-auto">
              <pre className="text-xs text-white/80 whitespace-pre-wrap">{JSON.stringify({ equity: lastOkData?.equity, currency: lastOkData?.currency, summary: lastOkData?.summary }, null, 2)}</pre>
            </div>
          </div>

          <div className="pt-1" />
          <div className="flex justify-end gap-2">
            <Button onClick={async () => { await navigator.clipboard.writeText(JSON.stringify({ equity: lastOkData?.equity, currency: lastOkData?.currency, summary: lastOkData?.summary }, null, 2)); }} variant="ghost" size="sm" className="border border-white/10 hover:border-white/15 text-white/85 hover:text-white">COPY DETAILS</Button>
            <Button onClick={async () => { await runConnectivityCheck(false); }} variant="ghost" size="sm" className="border border-brand-mint/30 text-brand-mint hover:bg-brand-mint/10">REFRESH</Button>
          </div>
        </div>
      </Modal>
    </header>
  );
}
"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppMode = 'live' | 'demo';

interface ModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined);

const STORAGE_KEY = 'tradebaas.mode';

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('live');

  // Load from localStorage on mount (default to live)
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) as AppMode | null) : null;
      if (saved === 'live' || saved === 'demo') {
        setModeState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev: AppMode): AppMode => {
      const next: AppMode = prev === 'live' ? 'demo' : 'live';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used within a ModeProvider');
  return ctx;
}

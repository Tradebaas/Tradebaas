"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface BotsContextValue {
  globalStopped: boolean;
  stoppedBots: Set<string>;
  stopAll: () => void;
  startAll: () => void;
  stopBot: (id: string) => void;
  startBot: (id: string) => void;
  isBotStopped: (id: string) => boolean;
}

const BotsContext = createContext<BotsContextValue | undefined>(undefined);

export function BotsProvider({ children }: { children: React.ReactNode }) {
  const [globalStopped, setGlobalStopped] = useState(false);
  const [stoppedBotsSet, setStoppedBotsSet] = useState<Set<string>>(new Set());

  const stopAll = useCallback(() => {
    setGlobalStopped(true);
    setStoppedBotsSet(new Set());
  }, []);

  const startAll = useCallback(() => {
    setGlobalStopped(false);
    setStoppedBotsSet(new Set());
  }, []);

  const stopBot = useCallback((id: string) => {
    setGlobalStopped(false);
    setStoppedBotsSet(prev => new Set(prev).add(id));
  }, []);

  const startBot = useCallback((id: string) => {
    setStoppedBotsSet(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // If any bot starts, header should show STOP (not all stopped)
    setGlobalStopped(false);
  }, []);

  const isBotStopped = useCallback((id: string) => {
    return globalStopped || stoppedBotsSet.has(id);
  }, [globalStopped, stoppedBotsSet]);

  const value = useMemo(() => ({
    globalStopped,
    stoppedBots: stoppedBotsSet,
    stopAll,
    startAll,
    stopBot,
    startBot,
    isBotStopped,
  }), [globalStopped, stoppedBotsSet, stopAll, startAll, stopBot, startBot, isBotStopped]);

  return <BotsContext.Provider value={value}>{children}</BotsContext.Provider>;
}

export function useBots(): BotsContextValue {
  const ctx = useContext(BotsContext);
  if (!ctx) throw new Error('useBots must be used within a BotsProvider');
  return ctx;
}

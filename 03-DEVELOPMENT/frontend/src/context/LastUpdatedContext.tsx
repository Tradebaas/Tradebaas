"use client";

import React, { createContext, useCallback, useContext, useState } from 'react';

interface LastUpdatedContextValue {
  lastUpdated: Date;
  touch: () => void;
}

const LastUpdatedContext = createContext<LastUpdatedContextValue | undefined>(undefined);

export function LastUpdatedProvider({ children }: { children: React.ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const touch = useCallback(() => {
    setLastUpdated(new Date());
  }, []);

  return (
    <LastUpdatedContext.Provider value={{ lastUpdated, touch }}>
      {children}
    </LastUpdatedContext.Provider>
  );
}

export function useLastUpdated(): LastUpdatedContextValue {
  const ctx = useContext(LastUpdatedContext);
  if (!ctx) {
    throw new Error('useLastUpdated must be used within a LastUpdatedProvider');
  }
  return ctx;
}

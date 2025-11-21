/**
 * localStorage-based KV Hook (replaces legacy Spark KV)
 * For standalone deployment - no external dependencies!
 */

import { useState, useEffect, useCallback, useRef } from 'react';

type SetValue<T> = (value: T | ((prev: T) => T)) => void;

export function useKV<T = string>(
  key: string,
  defaultValue: T
): [T, SetValue<T>] {
  const [value, setValue] = useState<T>(defaultValue);
  const isInitialized = useRef(false);

  // Load initial value from localStorage
  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (isInitialized.current) return;
    isInitialized.current = true;

    try {
      const stored = localStorage.getItem(`tradebaas:${key}`);
      if (stored !== null) {
        setValue(JSON.parse(stored) as T);
      }
    } catch (error) {
      console.error(`[useKV] Failed to load key "${key}":`, error);
    }
  }, [key]);

  // Custom setter that persists to localStorage
  const setValueAndPersist = useCallback<SetValue<T>>(
    (newValue) => {
      setValue((prev) => {
        const valueToSet = typeof newValue === 'function' 
          ? (newValue as (prev: T) => T)(prev)
          : newValue;

        // Persist to localStorage
        try {
          localStorage.setItem(`tradebaas:${key}`, JSON.stringify(valueToSet));
        } catch (error) {
          console.error(`[useKV] Failed to persist key "${key}":`, error);
        }

        return valueToSet;
      });
    },
    [key]
  );

  return [value, setValueAndPersist];
}

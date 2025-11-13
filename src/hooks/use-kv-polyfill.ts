/**
 * Custom useKV hook that works with our Spark KV polyfill
 * Replaces @github/spark/hooks useKV for self-hosted deployments
 */

import { useState, useEffect, useCallback, useRef } from 'react';

type SetValue<T> = (value: T | ((prev: T) => T)) => void;

export function useKV<T = string>(
  key: string,
  defaultValue: T
): [T, SetValue<T>] {
  const [value, setValue] = useState<T>(defaultValue);
  const isInitialized = useRef(false);

  // Load initial value from KV store
  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (isInitialized.current) return;
    isInitialized.current = true;

    const loadValue = async () => {
      try {
        // Wait for polyfill to initialize
        let retries = 0;
        while (!window.spark?.kv && retries < 10) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }

        if (!window.spark?.kv) {
          console.warn('[useKV] Spark KV not available after waiting, using default value');
          return;
        }

        const stored = await window.spark.kv.get<T>(key);
        if (stored !== undefined && stored !== null) {
          setValue(stored);
        }
      } catch (error) {
        console.error(`[useKV] Failed to load key "${key}":`, error);
      }
    };

    loadValue();
  }, [key]);

  // Custom setter that persists to KV store
  const setValueAndPersist = useCallback<SetValue<T>>(
    (newValue) => {
      setValue((prev) => {
        const valueToSet = typeof newValue === 'function' 
          ? (newValue as (prev: T) => T)(prev)
          : newValue;

        // Persist to KV store asynchronously
        if (window.spark?.kv) {
          window.spark.kv.set(key, valueToSet).catch((error) => {
            console.error(`[useKV] Failed to persist key "${key}":`, error);
          });
        } else {
          console.warn('[useKV] Spark KV not available for persisting, value only in memory');
        }

        return valueToSet;
      });
    },
    [key]
  );

  return [value, setValueAndPersist];
}

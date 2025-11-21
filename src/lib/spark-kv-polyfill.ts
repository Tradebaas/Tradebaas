/**
 * Spark KV API Polyfill for Self-Hosted Deployment
 * 
 * This polyfill replaces the GitHub Spark KV API with calls to our backend KV storage.
 * All KV operations now go through the backend API on port 3000 for robustness and scalability.
 * 
 * Architecture:
 * - Frontend: Uses this polyfill to mimic Spark KV API
 * - Backend: /api/kv/* endpoints handle storage (in-memory, upgradeable to Redis/PostgreSQL)
 * - No dependency on port 7001 or Vite dev server
 * - Rate limit proof - backend handles all throttling
 */

import { getBackendUrl } from './backend-url';

const KV_API_BASE = `${getBackendUrl()}/api/kv`;

class SparkKVPolyfill implements SparkKV {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const response = await fetch(`${KV_API_BASE}/${encodeURIComponent(key)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // 404 means key not found - return undefined
      if (response.status === 404) {
        return undefined;
      }

      if (!response.ok) {
        throw new Error(`KV GET failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.value === null ? undefined : (data.value as T);
    } catch (error) {
      console.error(`[SparkKV] Failed to get key "${key}":`, error);
      throw error;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      const response = await fetch(`${KV_API_BASE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, value }),
      });

      if (!response.ok) {
        throw new Error(`KV SET failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`[SparkKV] Failed to set key "${key}":`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const response = await fetch(`${KV_API_BASE}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`KV DELETE failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`[SparkKV] Failed to delete key "${key}":`, error);
      throw error;
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    // Note: Not implemented yet - can be added to backend if needed
    console.warn('[SparkKV] keys() not implemented in backend yet');
    return [];
  }
}

/**
 * Initialize Spark polyfill
 * Call this before any Spark API usage
 */
export function initSparkPolyfill() {
  if (typeof window === 'undefined') {
    return; // SSR guard
  }

  // Check if we're running in GitHub Spark environment
  const isGitHubSpark = window.location.hostname.includes('github.dev') || 
                        window.location.hostname.includes('githubassets.com');

  // Only polyfill if NOT in GitHub Spark
  if (!isGitHubSpark && !window.spark) {
    console.log('[SparkKV] Initializing polyfill for self-hosted deployment');

    const polyfillKV = new SparkKVPolyfill();

    // Create mock Spark runtime
    window.spark = {
      kv: polyfillKV as any,
      user: async () => ({
        id: 1,
        email: 'user@tradebazen.nl',
        login: 'tradebazen',
        avatarUrl: '',
        isOwner: true, // Grant owner permissions in self-hosted
      }),
      llmPrompt: ((strings: any, ...values: any[]) => {
        return strings.reduce((acc: string, str: string, i: number) => acc + str + (values[i] || ''), '');
      }) as any,
      llm: async (prompt: string) => {
        console.warn('[SparkKV] LLM not available in self-hosted mode');
        return 'LLM not available in self-hosted mode';
      },
    } as any;

    // Also set global spark
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).spark = window.spark;
    }
  } else if (window.spark) {
    console.log('[SparkKV] Using native GitHub Spark API');
  }
}

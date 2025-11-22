/**
 * Spark KV API Polyfill for Self-Hosted Deployment
 * 
 * This polyfill replaces the GitHub Spark KV API with localStorage.
 * All KV operations now use localStorage for simplicity.
 * 
 * Architecture:
 * - Frontend: Uses localStorage with spark-kv: prefix
 * - No backend dependency for KV
 * - Simple and robust
 */

class SparkKVPolyfill implements SparkKV {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = localStorage.getItem(`spark-kv:${key}`);
      if (value === null) {
        return undefined;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[SparkKV] Failed to get key "${key}":`, error);
      return undefined;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      localStorage.setItem(`spark-kv:${key}`, JSON.stringify(value));
    } catch (error) {
      console.error(`[SparkKV] Failed to set key "${key}":`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(`spark-kv:${key}`);
    } catch (error) {
      console.error(`[SparkKV] Failed to delete key "${key}":`, error);
      throw error;
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('spark-kv:'));
      const filtered = prefix ? keys.filter(key => key.startsWith(`spark-kv:${prefix}`)) : keys;
      return filtered.map(key => key.replace('spark-kv:', ''));
    } catch (error) {
      console.error(`[SparkKV] Failed to get keys:`, error);
      return [];
    }
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

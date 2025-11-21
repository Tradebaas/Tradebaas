/**
 * KV Storage Service
 * Robust, scalable key-value storage for frontend state
 * 
 * Architecture:
 * - In-memory Map for development (fast, simple)
 * - Can be upgraded to Redis/PostgreSQL for production
 * - Type-safe with generics
 * - No rate limits (handled by Fastify)
 */

import { log } from './logger';

interface KVEntry<T = any> {
  value: T;
  timestamp: number;
  expiresAt?: number;
}

class KVStorage {
  private store = new Map<string, KVEntry>();
  private cleanupInterval: NodeJS.Timeout;
  
  constructor() {
    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
    
    log.info('[KVStorage] Initialized in-memory storage');
  }
  
  /**
   * Get a value by key
   */
  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      log.debug('[KVStorage] Key expired and deleted', { key });
      return null;
    }
    
    return entry.value as T;
  }
  
  /**
   * Set a value by key
   */
  async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const entry: KVEntry<T> = {
      value,
      timestamp: Date.now(),
    };
    
    if (ttlSeconds) {
      entry.expiresAt = Date.now() + (ttlSeconds * 1000);
    }
    
    this.store.set(key, entry);
    log.debug('[KVStorage] Key set:', { key, hasTTL: !!ttlSeconds });
  }
  
  /**
   * Delete a value by key
   */
  async delete(key: string): Promise<boolean> {
    const existed = this.store.has(key);
    this.store.delete(key);
    
    if (existed) {
      log.debug('[KVStorage] Key deleted', { key });
    }
    
    return existed;
  }
  
  /**
   * Check if a key exists
   */
  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    
    if (!entry) {
      return false;
    }
    
    // Check if expired
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get all keys (for debugging)
   */
  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
  
  /**
   * Clear all entries (for testing)
   */
  async clear(): Promise<void> {
    this.store.clear();
    log.info('[KVStorage] All entries cleared');
  }
  
  /**
   * Get storage stats
   */
  async stats(): Promise<{
    totalKeys: number;
    expiredKeys: number;
    memoryUsage: string;
  }> {
    let expiredKeys = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        expiredKeys++;
      }
    }
    
    return {
      totalKeys: this.store.size,
      expiredKeys,
      memoryUsage: `${Math.round((JSON.stringify([...this.store]).length / 1024))} KB`,
    };
  }
  
  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.store.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      log.debug(`[KVStorage] Cleanup: removed ${cleaned} expired keys`);
    }
  }
  
  /**
   * Shutdown cleanup
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    log.info('[KVStorage] Shutdown complete');
  }
}

// Singleton instance
export const kvStorage = new KVStorage();

// Graceful shutdown
process.on('SIGTERM', () => {
  kvStorage.destroy();
});

process.on('SIGINT', () => {
  kvStorage.destroy();
});

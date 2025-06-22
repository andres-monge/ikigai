/**
 * @description
 * This file provides a simple in-memory cache implementation with Time-to-Live (TTL) support.
 * It's designed to be a generic cache, but a specific instance for caching salary data is exported.
 * This helps to reduce latency and API costs by temporarily storing frequently requested data.
 *
 * Key features:
 * - Stores any type of data with a specific TTL.
 * - Automatically evicts expired entries upon access.
 * - Provides standard `get`, `set`, and `has` methods.
 *
 * @dependencies
 * - None
 *
 * @notes
 * - This is for MVP purposes only. Data is not persisted across server restarts.
 * - For a production environment, this could be replaced with a more robust solution like Redis.
 */

interface CacheEntry<T> {
  data: T;
  expires: number; // Expiration timestamp in milliseconds
}

/**
 * @class Cache
 * @description A generic in-memory cache class.
 */
class Cache {
  private store = new Map<string, CacheEntry<any>>();

  /**
   * Sets a value in the cache with a specified TTL.
   * @param {string} key - The key to store the data under.
   * @param {T} value - The data to store.
   * @param {number} ttlMs - The time-to-live for the cache entry in milliseconds.
   */
  set<T>(key: string, value: T, ttlMs: number): void {
    const expires = Date.now() + ttlMs;
    this.store.set(key, { data: value, expires });
    console.log(`[Cache] Set key: ${key} with TTL: ${ttlMs}ms`);
  }

  /**
   * Retrieves a value from the cache. Returns null if the key doesn't exist or the entry has expired.
   * Expired entries are deleted on access.
   * @param {string} key - The key of the data to retrieve.
   * @returns {T | null} The cached data or null.
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      console.log(`[Cache] Miss for key: ${key}`);
      return null;
    }

    if (Date.now() > entry.expires) {
      this.store.delete(key);
      console.log(`[Cache] Expired and deleted key: ${key}`);
      return null;
    }

    console.log(`[Cache] Hit for key: ${key}`);
    return entry.data as T;
  }

  /**
   * Checks if a key exists and is not expired in the cache.
   * Expired entries are deleted on access.
   * @param {string} key - The key to check.
   * @returns {boolean} True if the key exists and is valid, false otherwise.
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return false;
    }
    return true;
  }
}

/**
 * Singleton instance of the Cache class specifically for salary data.
 * The technical specification requires a 24-hour cache for salaries.
 */
export const salaryCache = new Cache();
export const SALARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
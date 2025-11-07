/**
 * Generic API cache for HTTP requests with configurable TTL per request
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

interface CacheEntry {
  data: any
  timestamp: number
  expiresAt: number
  fallbackExpiresAt?: number // Optional extended expiry for fallback usage
}

export interface APICacheConfig {
  defaultTTLMs?: number
  maxEntries?: number
  cleanupIntervalMs?: number
  fallbackTTLMs?: number // How long to keep expired data for fallback (default: 7 days)
  persistToDisk?: boolean // Whether to persist cache to disk (default: true in production)
  cacheDir?: string // Directory to store cache files (default: OS temp dir + 'feri-timetable-cache')
}

export interface CacheOptions {
  ttl?: number
  key?: string
  skipCache?: boolean
  useFallback?: boolean // Whether to use expired cache as fallback when request fails
}

export class APICache {
  private cache = new Map<string, CacheEntry>()
  private config: Required<APICacheConfig>
  private cleanupInterval?: NodeJS.Timeout
  private cacheFilePath: string

  constructor(config: APICacheConfig = {}) {
    this.config = {
      defaultTTLMs: config.defaultTTLMs ?? 30 * 60 * 1000, // 30 minutes default
      maxEntries: config.maxEntries ?? 1000, // Prevent memory leaks
      cleanupIntervalMs: config.cleanupIntervalMs ?? 5 * 60 * 1000, // Cleanup every 5 minutes
      fallbackTTLMs: config.fallbackTTLMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days default for fallback data
      persistToDisk: config.persistToDisk ?? (process.env.NODE_ENV === 'production'), // Auto-enable in production
      cacheDir: config.cacheDir ?? join(tmpdir(), 'feri-timetable-cache'),
    }

    // Set up cache file path
    this.cacheFilePath = join(this.config.cacheDir, 'api-cache.json')

    // Load cache from disk if persistence is enabled (async)
    if (this.config.persistToDisk) {
      this.loadCacheFromDisk().catch((error: any) => 
        console.warn('Failed to load cache from disk:', error)
      )
    }

    // Start periodic cleanup
    this.startCleanup()
  }

  /**
   * Get cached response or execute the request function
   */
  async request<T>(
    requestFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const { 
      ttl = this.config.defaultTTLMs, 
      key, 
      skipCache = false, 
      useFallback = true 
    } = options

    // Generate cache key if not provided
    const cacheKey = key ?? this.generateKey(requestFn.toString())

    // Return cached result if available and not skipping cache
    if (!skipCache) {
      const cached = this.get<T>(cacheKey)
      if (cached !== null) {
        return cached
      }
    }

    try {
      // Execute the request
      const result = await requestFn()

      // Cache the result if not skipping cache
      if (!skipCache) {
        this.set(cacheKey, result, ttl)
      }

      return result
    } catch (error) {
      // If request fails and fallback is enabled, try to return expired cached data
      if (useFallback && !skipCache) {
        const fallbackData = this.getFallback<T>(cacheKey)
        if (fallbackData !== null) {
          console.warn(`APICache: Backend failed, returning fallback data for key: ${cacheKey}`, error)
          return fallbackData
        }
      }
      
      // No fallback available, re-throw the original error
      throw error
    }
  }

  /**
   * Get cached data by key
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * Get cached data by key, including expired entries (for fallback)
   */
  getFallback<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    // Check if fallback data is still valid
    if (entry.fallbackExpiresAt && Date.now() > entry.fallbackExpiresAt) {
      return null
    }
    
    return entry.data // Return data even if normally expired
  }

  /**
   * Set cached data with custom TTL
   */
  set<T>(key: string, data: T, ttl: number = this.config.defaultTTLMs): void {
    const now = Date.now()
    
    // Enforce max entries limit
    if (this.cache.size >= this.config.maxEntries) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
      fallbackExpiresAt: now + this.config.fallbackTTLMs,
    })

    // Persist to disk if enabled (async, don't wait)
    if (this.config.persistToDisk) {
      this.saveCacheToDisk().catch((error: any) => 
        console.warn('Failed to save cache to disk:', error)
      )
    }
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * Delete a specific cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear()
    
    // Also remove disk cache if persistence is enabled
    if (this.config.persistToDisk) {
      this.clearDiskCache().catch((error: any) =>
        console.warn('Failed to clear disk cache:', error)
      )
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number
    maxEntries: number
    defaultTTLMs: number
    fallbackTTLMs: number
    entries: Array<{ 
      key: string; 
      timestamp: number; 
      expiresAt: number; 
      fallbackExpiresAt?: number;
      expired: boolean;
      fallbackOnly: boolean;
    }>
  } {
    const now = Date.now()
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      timestamp: entry.timestamp,
      expiresAt: entry.expiresAt,
      fallbackExpiresAt: entry.fallbackExpiresAt,
      expired: now > entry.expiresAt,
      fallbackOnly: Boolean(now > entry.expiresAt && entry.fallbackExpiresAt && now <= entry.fallbackExpiresAt),
    }))

    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      defaultTTLMs: this.config.defaultTTLMs,
      fallbackTTLMs: this.config.fallbackTTLMs,
      entries,
    }
  }

  /**
   * Check if a key exists as fallback data (expired but still usable for fallback)
   */
  hasFallback(key: string): boolean {
    return this.getFallback(key) !== null
  }

  /**
   * Cached version of fetch with automatic JSON parsing
   */
  async cachedFetch<T = any>(
    url: string,
    init?: RequestInit,
    options: CacheOptions = {}
  ): Promise<T> {
    const cacheKey = options.key ?? this.generateFetchKey(url, init)
    
    return this.request(async () => {
      const response = await fetch(url, init)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      }
      
      return await response.text()
    }, { useFallback: true, ...options, key: cacheKey })
  }

  /**
   * Generate a cache key from function string
   */
  private generateKey(input: string): string {
    // Simple hash function for generating keys
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return `cache_${Math.abs(hash)}_${Date.now()}`
  }

  /**
   * Generate a cache key for fetch requests
   */
  private generateFetchKey(url: string, init?: RequestInit): string {
    const method = init?.method ?? 'GET'
    const headers = JSON.stringify(init?.headers ?? {})
    const body = init?.body ?? ''
    return `fetch_${method}_${url}_${this.hashString(headers + body)}`
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Clean up expired entries (only remove entries that are past fallback expiry)
   */
  private cleanup(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, entry] of this.cache.entries()) {
      // Only delete if past fallback expiry, or if no fallback expiry is set and past regular expiry
      const fallbackExpiry = entry.fallbackExpiresAt ?? entry.expiresAt
      if (now > fallbackExpiry) {
        expiredKeys.push(key)
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key))
    
    if (expiredKeys.length > 0) {
      console.log(`APICache: Cleaned up ${expiredKeys.length} fully expired entries`)
      
      // Save to disk after cleanup if persistence is enabled
      if (this.config.persistToDisk) {
        this.saveCacheToDisk().catch((error: any) =>
          console.warn('Failed to save cache to disk after cleanup:', error)
        )
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      this.config.cleanupIntervalMs
    )
  }

  /**
   * Load cache from disk if it exists
   */
  private async loadCacheFromDisk(): Promise<void> {
    if (!this.config.persistToDisk) return

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.config.cacheDir, { recursive: true })
      
      // Try to read the cache file
      const cacheData = await fs.readFile(this.cacheFilePath, 'utf-8')
      const parsedData = JSON.parse(cacheData)
      
      // Validate and load cache entries
      if (parsedData && typeof parsedData === 'object') {
        const now = Date.now()
        let loadedCount = 0
        let expiredCount = 0
        
        for (const [key, entry] of Object.entries(parsedData)) {
          if (this.isValidCacheEntry(entry)) {
            // Only load entries that haven't completely expired (including fallback period)
            const fallbackExpiry = entry.fallbackExpiresAt ?? entry.expiresAt
            if (now <= fallbackExpiry) {
              this.cache.set(key, entry as CacheEntry)
              loadedCount++
            } else {
              expiredCount++
            }
          }
        }
        
        console.log(`APICache: Loaded ${loadedCount} entries from disk (skipped ${expiredCount} expired)`)
      }
    } catch (error) {
      // File doesn't exist or is corrupted - start with empty cache
      console.log('APICache: No existing cache file found or failed to load, starting fresh')
    }
  }

  /**
   * Save current cache to disk
   */
  private async saveCacheToDisk(): Promise<void> {
    if (!this.config.persistToDisk) return

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.config.cacheDir, { recursive: true })
      
      // Convert Map to plain object for JSON serialization
      const cacheObject = Object.fromEntries(this.cache.entries())
      
      // Write to disk
      await fs.writeFile(this.cacheFilePath, JSON.stringify(cacheObject, null, 2), 'utf-8')
    } catch (error) {
      console.error('APICache: Failed to save cache to disk:', error)
      throw error
    }
  }

  /**
   * Clear disk cache file
   */
  private async clearDiskCache(): Promise<void> {
    if (!this.config.persistToDisk) return

    try {
      await fs.unlink(this.cacheFilePath)
      console.log('APICache: Disk cache cleared')
    } catch (error: any) {
      // File might not exist, which is fine
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  /**
   * Validate cache entry structure
   */
  private isValidCacheEntry(entry: any): entry is CacheEntry {
    return (
      entry &&
      typeof entry === 'object' &&
      typeof entry.timestamp === 'number' &&
      typeof entry.expiresAt === 'number' &&
      entry.data !== undefined &&
      (entry.fallbackExpiresAt === undefined || typeof entry.fallbackExpiresAt === 'number')
    )
  }

  /**
   * Stop periodic cleanup and clear cache
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }
    
    // Save to disk before clearing if persistence is enabled
    if (this.config.persistToDisk && this.cache.size > 0) {
      this.saveCacheToDisk().catch((error: any) =>
        console.warn('Failed to save cache to disk during destroy:', error)
      )
    }
    
    this.clear()
  }
}

// Export a default instance for convenience
export const defaultAPICache = new APICache({
  defaultTTLMs: 30 * 60 * 1000, // 30 minutes
  fallbackTTLMs: 7 * 24 * 60 * 60 * 1000, // 7 days fallback
  persistToDisk: true, // Enable disk persistence for default instance
})

/*
Usage Example with Fallback and Disk Persistence:

// Basic usage - will automatically use fallback if backend fails
const data = await cache.cachedFetch('https://api.example.com/data')

// Custom cache with disk persistence
const persistentCache = new APICache({
  defaultTTLMs: 30 * 60 * 1000, // 30 minutes fresh data
  fallbackTTLMs: 30 * 24 * 60 * 60 * 1000, // 30 days fallback
  persistToDisk: true, // Save cache to disk for persistence across restarts
  cacheDir: '/path/to/cache/dir', // Optional: custom cache directory
})

// Custom options with fallback
const data = await cache.request(
  () => fetch('https://api.example.com/data').then(r => r.json()),
  { 
    ttl: 5 * 60 * 1000, // 5 minutes fresh
    useFallback: true, // Use expired data if backend fails (default: true)
    key: 'my-custom-key'
  }
)

// Disable fallback for critical operations
const data = await cache.request(
  () => criticalApiCall(),
  { useFallback: false } // Will throw error if backend fails, no fallback
)

// Check if fallback data is available
if (cache.hasFallback('my-key')) {
  console.log('Fallback data available for my-key')
}

// Get cache statistics including fallback info
const stats = cache.getStats()
console.log(`Cache has ${stats.entries.filter(e => e.fallbackOnly).length} fallback-only entries`)

// Disk persistence features:
// - Cache automatically loads from disk on startup
// - Cache saves to disk after every update (async)
// - Cache persists through application restarts
// - Expired entries are cleaned up but fallback data is preserved
// - Default location: OS temp directory + 'feri-timetable-cache'
// - Automatically enabled in production environments
*/
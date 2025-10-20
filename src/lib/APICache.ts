/**
 * Generic API cache for HTTP requests with configurable TTL per request
 */

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

  constructor(config: APICacheConfig = {}) {
    this.config = {
      defaultTTLMs: config.defaultTTLMs ?? 30 * 60 * 1000, // 30 minutes default
      maxEntries: config.maxEntries ?? 1000, // Prevent memory leaks
      cleanupIntervalMs: config.cleanupIntervalMs ?? 5 * 60 * 1000, // Cleanup every 5 minutes
      fallbackTTLMs: config.fallbackTTLMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days default for fallback data
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
   * Stop periodic cleanup and clear cache
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }
    this.clear()
  }
}

// Export a default instance for convenience
export const defaultAPICache = new APICache({
  defaultTTLMs: 30 * 60 * 1000, // 30 minutes
  fallbackTTLMs: 7 * 24 * 60 * 60 * 1000, // 7 days fallback
})

/*
Usage Example with Fallback:

// Basic usage - will automatically use fallback if backend fails
const data = await cache.cachedFetch('https://api.example.com/data')

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
*/
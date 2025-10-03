/**
 * Generic API cache for HTTP requests with configurable TTL per request
 */

interface CacheEntry {
  data: any
  timestamp: number
  expiresAt: number
}

export interface APICacheConfig {
  defaultTTLMs?: number
  maxEntries?: number
  cleanupIntervalMs?: number
}

export interface CacheOptions {
  ttl?: number
  key?: string
  skipCache?: boolean
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
    const { ttl = this.config.defaultTTLMs, key, skipCache = false } = options

    // Generate cache key if not provided
    const cacheKey = key ?? this.generateKey(requestFn.toString())

    // Return cached result if available and not skipping cache
    if (!skipCache) {
      const cached = this.get<T>(cacheKey)
      if (cached !== null) {
        return cached
      }
    }

    // Execute the request
    const result = await requestFn()

    // Cache the result if not skipping cache
    if (!skipCache) {
      this.set(cacheKey, result, ttl)
    }

    return result
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
    entries: Array<{ key: string; timestamp: number; expiresAt: number; expired: boolean }>
  } {
    const now = Date.now()
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      timestamp: entry.timestamp,
      expiresAt: entry.expiresAt,
      expired: now > entry.expiresAt,
    }))

    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      defaultTTLMs: this.config.defaultTTLMs,
      entries,
    }
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
    }, { ...options, key: cacheKey })
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
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key)
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key))
    
    if (expiredKeys.length > 0) {
      console.log(`APICache: Cleaned up ${expiredKeys.length} expired entries`)
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
export const defaultAPICache = new APICache()
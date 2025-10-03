import { Branch, GroupBranchMain, LectureWise, Programme, SchoolInfo } from "../types/types"
import { API_URL, USERNAME, PASSWORD } from "../const"

type FetchTokenResponse = {
  token: string
}

type FetchSchoolUrlResponse = {
  server: string
}

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

export interface TimetableConfig {
  cacheExpirationMs?: number
  tokenExpirationBufferMs?: number
}

export class Timetable {
  private token: string | null = null
  private serverUrl: string | null = null
  private cache = new Map<string, CacheEntry<any>>()
  private config: Required<TimetableConfig>

  constructor(config: TimetableConfig = {}) {
    this.config = {
      cacheExpirationMs: config.cacheExpirationMs ?? 5 * 60 * 1000, // 5 minutes default
      tokenExpirationBufferMs: config.tokenExpirationBufferMs ?? 60 * 1000, // 1 minute buffer
    }
  }

  private getCacheKey(method: string, ...args: any[]): string {
    return `${method}_${JSON.stringify(args)}`
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  private setCache<T>(key: string, data: T, customExpirationMs?: number): void {
    const now = Date.now()
    const expirationMs = customExpirationMs ?? this.config.cacheExpirationMs
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + expirationMs,
    })
  }

  private async fetchToken(): Promise<string> {
    if (!USERNAME || !PASSWORD) {
      throw new Error('USERNAME and PASSWORD environment variables must be set')
    }
    
    const base64Credentials = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')

    
    const response = await fetch(`${API_URL}login`, {
      headers: {
        'Authorization': 'Basic ' + base64Credentials,
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Token fetch failed with status ${response.status}: ${errorText}`)
      throw new Error(`Failed to fetch token: ${response.status} ${response.statusText}`)
    }

    const json = (await response.json()) as FetchTokenResponse
    console.log('Token fetched successfully')
    return json.token
  }

  private async getToken(): Promise<string> {
    if (this.token) {
      const base64Strings = this.token.split('.')
      const payload = JSON.parse(Buffer.from(base64Strings[1], 'base64').toString('utf8')) as any as { exp: number }
      const nowInSeconds = Math.floor(Date.now() / 1000)

      if (nowInSeconds < payload.exp - Math.floor(this.config.tokenExpirationBufferMs / 1000)) {
        return this.token
      }
      console.log("TOKEN HAS EXPIRED!")
    }

    this.token = await this.fetchToken()
    return this.token
  }

  private async get<T>(url: string): Promise<T> {
    const token = await this.getToken()
    
    console.log(`Making request to: ${url}`)
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`API Error - Status: ${response.status} ${response.statusText}`)
      console.error(`URL: ${url}`)
      console.error(`Response: ${errorText}`)
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const responseText = await response.text()
    try {
      return JSON.parse(responseText) as T
    } catch (parseError) {
      console.error(`JSON Parse Error for URL: ${url}`)
      console.error(`Response text: ${responseText}`)
      throw new Error(`Invalid JSON response: ${parseError}`)
    }
  }

  private getISODateNoTimestamp(date: Date): string {
    const [withoutTime] = date.toISOString().split('T')
    return withoutTime
  }

  private async fetchSchoolUrl(userSchoolCode: string): Promise<string> {
    console.log(`Fetching school URL for code: ${userSchoolCode}`)
    const json = await this.get<FetchSchoolUrlResponse>(`${API_URL}url?schoolCode=${userSchoolCode}&language=slo`)
    const serverUrl = json.server.replace('http://', 'https://') // FUNNY WISE
    console.log(`School URL received: ${json.server}, converted to: ${serverUrl}`)
    return serverUrl
  }

  async getSchoolInfo(userSchoolCode: string): Promise<SchoolInfo> {
    const cacheKey = this.getCacheKey('getSchoolInfo', userSchoolCode)
    
    const cached = this.getFromCache<SchoolInfo>(cacheKey)
    if (cached) return cached

    const serverURL = await this.fetchSchoolUrl(userSchoolCode)
    this.serverUrl = serverURL

    const result = await this.get<SchoolInfo>(`${serverURL}schoolCode?schoolCode=${userSchoolCode}&language=slo`)
    this.setCache(cacheKey, result)
    return result
  }

  async getBasicProgrammes(schoolCode: string): Promise<Programme[]> {
    if (!this.serverUrl) {
      throw new Error('Server URL not set. Call getSchoolInfo first.')
    }

    const cacheKey = this.getCacheKey('getBasicProgrammes', schoolCode)
    
    const cached = this.getFromCache<Programme[]>(cacheKey)
    if (cached) return cached

    const result = await this.get<Programme[]>(`${this.serverUrl}basicProgrammeAll?schoolCode=${schoolCode}&language=slo`)
    this.setCache(cacheKey, result)
    return result
  }

  async fetchBranchesForProgramm(schoolCode: string, programmeId: string, year: string): Promise<Branch[]> {
    if (!this.serverUrl) {
      throw new Error('Server URL not set. Call getSchoolInfo first.')
    }

    const cacheKey = this.getCacheKey('fetchBranchesForProgramm', schoolCode, programmeId, year)
    
    const cached = this.getFromCache<Branch[]>(cacheKey)
    if (cached) return cached

    const result = await this.get<Branch[]>(`${this.serverUrl}branchAllForProgrmmeYear?schoolCode=${schoolCode}&language=slo&programmeId=${programmeId}&year=${year}`)
    this.setCache(cacheKey, result)
    return result
  }

  async fetchGroupsForBranch(schoolCode: string, branchId: string): Promise<GroupBranchMain[]> {
    if (!this.serverUrl) {
      throw new Error('Server URL not set. Call getSchoolInfo first.')
    }

    const cacheKey = this.getCacheKey('fetchGroupsForBranch', schoolCode, branchId)
    
    const cached = this.getFromCache<GroupBranchMain[]>(cacheKey)
    if (cached) return cached

    const result = await this.get<GroupBranchMain[]>(`${this.serverUrl}groupAllForBranch?schoolCode=${schoolCode}&language=slo&branchId=${branchId}`)
    this.setCache(cacheKey, result)
    return result
  }

  async fetchLecturesForGroups(schoolCode: string, groups: { id: number }[], startDate: Date, endDate: Date): Promise<LectureWise[]> {
    if (!this.serverUrl) {
      throw new Error('Server URL not set. Call getSchoolInfo first.')
    }

    const cacheKey = this.getCacheKey('fetchLecturesForGroups', schoolCode, groups, startDate.getTime(), endDate.getTime())
    
    const cached = this.getFromCache<LectureWise[]>(cacheKey)
    if (cached) return cached

    let allGroupsId = ''
    groups.forEach(group => {
      allGroupsId += group.id.toString() + '_'
    })
    allGroupsId = allGroupsId.slice(0, -1)

    const startDateIso = this.getISODateNoTimestamp(startDate)
    const endDateIso = this.getISODateNoTimestamp(endDate)
    
    console.log(`Fetching lectures for ${groups.length} groups from ${startDateIso} to ${endDateIso}`)
    const result = await this.get<LectureWise[]>(`${this.serverUrl}scheduleByGroups?schoolCode=${schoolCode}&dateFrom=${startDateIso}&dateTo=${endDateIso}&language=slo&groupsId=${allGroupsId}`)
    
    // Cache lecture data for 30 minutes since it's a larger dataset and changes less frequently
    this.setCache(cacheKey, result, 30 * 60 * 1000)
    console.log(`Cached ${result.length} lectures for 30 minutes`)
    return result
  }

  // Cache management methods
  clearCache(): void {
    this.cache.clear()
  }

  getCacheSize(): number {
    return this.cache.size
  }

  getCacheStats(): { size: number; entries: Array<{ key: string; timestamp: number; expiresAt: number }> } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      timestamp: entry.timestamp,
      expiresAt: entry.expiresAt,
    }))

    return {
      size: this.cache.size,
      entries,
    }
  }

  // Manual cache invalidation for specific methods
  invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.clearCache()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }
}
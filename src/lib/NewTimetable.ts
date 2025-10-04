import { Branch, GroupBranchMain, LectureWise, Programme, SchoolInfo } from "../types/types"
import { API_URL, getUsername, getPassword } from "../const"
import { APICache, APICacheConfig } from "./APICache"

type FetchTokenResponse = {
  token: string
}

type FetchSchoolUrlResponse = {
  server: string
}

export interface NewTimetableConfig extends APICacheConfig {
  tokenExpirationBufferMs?: number
}

export class NewTimetable {
  private cache: APICache
  private serverUrl: string | null = null
  private schoolInfo: SchoolInfo | null = null
  private actualSchoolCode: string | null = null
  private config: Required<Omit<NewTimetableConfig, keyof APICacheConfig>> & APICacheConfig

  constructor(
    private humanSchoolCode: string,
    config: NewTimetableConfig = {}
  ) {
    this.config = {
      tokenExpirationBufferMs: config.tokenExpirationBufferMs ?? 60 * 1000, // 1 minute buffer
      defaultTTLMs: config.defaultTTLMs ?? 10 * 60 * 1000, // 10 minutes default
      maxEntries: config.maxEntries ?? 500,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 5 * 60 * 1000,
    }

    // Create API cache instance with custom configuration
    this.cache = new APICache({
      defaultTTLMs: this.config.defaultTTLMs,
      maxEntries: this.config.maxEntries,
      cleanupIntervalMs: this.config.cleanupIntervalMs,
    })

    // Initialize by getting school info
    this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      await this.getSchoolInfo()
    } catch (error) {
      console.error('Failed to initialize NewTimetable:', error)
    }
  }

  /**
   * Get authentication token with caching
   */
  private async getToken(): Promise<string> {
    return this.cache.request(
      async () => {
        // Get credentials at runtime, not build time
        const username = getUsername()
        const password = getPassword()
        
        const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64')

        console.log(`Using credentials for user: ${username}`)
        
        console.log('Fetching fresh authentication token...')
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
      },
      {
        key: 'auth_token',
        ttl: 25 * 60 * 1000, // Cache token for 25 minutes (JWT usually expires in 30min)
      }
    )
  }

  /**
   * Make authenticated API request with automatic token handling
   */
  private async authenticatedRequest<T>(url: string): Promise<T> {
    const token = await this.getToken()
    
    console.log(`Making authenticated request to: ${url}`)
    
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

  /**
   * Get school URL for the human-readable school code
   */
  private async fetchSchoolUrl(): Promise<string> {
    return this.cache.request(
      async () => {
        console.log(`Fetching school URL for code: ${this.humanSchoolCode}`)
        const json = await this.authenticatedRequest<FetchSchoolUrlResponse>(
          `${API_URL}url?schoolCode=${this.humanSchoolCode}&language=slo`
        )
        const serverUrl = json.server.replace('http://', 'https://') // Convert to HTTPS
        console.log(`School URL received: ${json.server}, converted to: ${serverUrl}`)
        return serverUrl
      },
      {
        key: `school_url_${this.humanSchoolCode}`,
        ttl: 60 * 60 * 1000, // Cache for 1 hour (rarely changes)
      }
    )
  }

  /**
   * Get school information and initialize server URL
   */
  async getSchoolInfo(): Promise<SchoolInfo> {
    if (this.schoolInfo) {
      return this.schoolInfo
    }

    return this.cache.request(
      async () => {
        const serverURL = await this.fetchSchoolUrl()
        this.serverUrl = serverURL

        console.log(`Fetching school info for code: ${this.humanSchoolCode}`)
        const result = await this.authenticatedRequest<SchoolInfo>(
          `${serverURL}schoolCode?schoolCode=${this.humanSchoolCode}&language=slo`
        )
        
        this.schoolInfo = result
        // Store the actual school code from the API response
        this.actualSchoolCode = result.schoolCode
        console.log(`Using actual school code: ${this.actualSchoolCode}`)
        return result
      },
      {
        key: `school_info_${this.humanSchoolCode}`,
        ttl: 30 * 60 * 1000, // Cache for 30 minutes
      }
    )
  }

  /**
   * Get all basic programmes for the school
   */
  async getBasicProgrammes(): Promise<Programme[]> {
    // Ensure school info is loaded
    await this.getSchoolInfo()
    
    if (!this.serverUrl || !this.actualSchoolCode) {
      throw new Error('Server URL or school code not set. Failed to initialize school info.')
    }

    return this.cache.request(
      async () => {
        console.log(`Fetching programmes for school code: ${this.actualSchoolCode}`)
        const result = await this.authenticatedRequest<Programme[]>(
          `${this.serverUrl}basicProgrammeAll?schoolCode=${this.actualSchoolCode}&language=slo`
        )
        console.log(`Found ${result.length} programmes`)
        return result
      },
      {
        key: `programmes_${this.actualSchoolCode}`,
        ttl: 20 * 60 * 1000, // Cache for 20 minutes
      }
    )
  }

  /**
   * Get branches for a specific programme and year
   */
  async getBranchesForProgramme(programmeId: string, year: string): Promise<Branch[]> {
    // Ensure school info is loaded
    await this.getSchoolInfo()
    
    if (!this.serverUrl || !this.actualSchoolCode) {
      throw new Error('Server URL or school code not set. Failed to initialize school info.')
    }

    return this.cache.request(
      async () => {
        console.log(`Fetching branches for programme ${programmeId}, year ${year}`)
        const result = await this.authenticatedRequest<Branch[]>(
          `${this.serverUrl}branchAllForProgrmmeYear?schoolCode=${this.actualSchoolCode}&language=slo&programmeId=${programmeId}&year=${year}`
        )
        console.log(`Found ${result.length} branches`)
        return result
      },
      {
        key: `branches_${this.actualSchoolCode}_${programmeId}_${year}`,
        ttl: 15 * 60 * 1000, // Cache for 15 minutes
      }
    )
  }

  /**
   * Get groups for a specific branch
   */
  async getGroupsForBranch(branchId: string): Promise<GroupBranchMain[]> {
    // Ensure school info is loaded
    await this.getSchoolInfo()
    
    if (!this.serverUrl || !this.actualSchoolCode) {
      throw new Error('Server URL or school code not set. Failed to initialize school info.')
    }

    return this.cache.request(
      async () => {
        console.log(`Fetching groups for branch ${branchId}`)
        const result = await this.authenticatedRequest<GroupBranchMain[]>(
          `${this.serverUrl}groupAllForBranch?schoolCode=${this.actualSchoolCode}&language=slo&branchId=${branchId}`
        )
        console.log(`Found ${result.length} groups`)
        return result
      },
      {
        key: `groups_${this.actualSchoolCode}_${branchId}`,
        ttl: 10 * 60 * 1000, // Cache for 10 minutes
      }
    )
  }

  /**
   * Get lectures for specific groups within a date range
   */
  async getLecturesForGroups(groups: { id: number }[], startDate: Date, endDate: Date): Promise<LectureWise[]> {
    // Ensure school info is loaded
    await this.getSchoolInfo()
    
    if (!this.serverUrl || !this.actualSchoolCode) {
      throw new Error('Server URL or school code not set. Failed to initialize school info.')
    }

    return this.cache.request(
      async () => {
        // Build groups ID string
        let allGroupsId = ''
        groups.forEach(group => {
          allGroupsId += group.id.toString() + '_'
        })
        allGroupsId = allGroupsId.slice(0, -1) // Remove trailing underscore

        const startDateIso = this.getISODateNoTimestamp(startDate)
        const endDateIso = this.getISODateNoTimestamp(endDate)
        
        console.log(`Fetching lectures for ${groups.length} groups from ${startDateIso} to ${endDateIso}`)
        const result = await this.authenticatedRequest<LectureWise[]>(
          `${this.serverUrl}scheduleByGroups?schoolCode=${this.actualSchoolCode}&dateFrom=${startDateIso}&dateTo=${endDateIso}&language=slo&groupsId=${allGroupsId}`
        )
        
        console.log(`Found ${result.length} lectures`)
        return result
      },
      {
        key: `lectures_${this.actualSchoolCode}_${groups.map(g => g.id).join('_')}_${startDate.getTime()}_${endDate.getTime()}`,
        ttl: 5 * 60 * 1000, // Cache lectures for 5 minutes (they can change more frequently)
      }
    )
  }

  /**
   * Utility function to convert date to ISO date string without timestamp
   */
  private getISODateNoTimestamp(date: Date): string {
    const [withoutTime] = date.toISOString().split('T')
    return withoutTime
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats()
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear()
    this.serverUrl = null
    this.schoolInfo = null
    this.actualSchoolCode = null
  }

  /**
   * Get the human-readable school code
   */
  getSchoolCode(): string {
    return this.humanSchoolCode
  }

  /**
   * Get the server URL (after initialization)
   */
  getServerUrl(): string | null {
    return this.serverUrl
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cache.destroy()
    this.serverUrl = null
    this.schoolInfo = null
    this.actualSchoolCode = null
  }
}
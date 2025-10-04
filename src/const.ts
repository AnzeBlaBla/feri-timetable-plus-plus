export const API_URL = 'https://wise-tt.com/WTTWebRestAPI/ws/rest/'

// Get environment variables at runtime, not build time
// This ensures Docker can pass env vars correctly
export function getUsername(): string {
  const username = process.env.WTT_USERNAME
  if (!username) {
    throw new Error('WTT_USERNAME environment variable is not set')
  }
  return username
}

export function getPassword(): string {
  const password = process.env.WTT_PASSWORD
  if (!password) {
    throw new Error('WTT_PASSWORD environment variable is not set')
  }
  return password
}

// Legacy exports for backwards compatibility - but these should be avoided
export const USERNAME = process.env.WTT_USERNAME
export const PASSWORD = process.env.WTT_PASSWORD
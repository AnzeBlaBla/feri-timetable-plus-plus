export const API_URL = 'https://wise-tt.com/WTTWebRestAPI/ws/rest/';

function requiredEnvironmentVariable(name: 'WTT_USERNAME' | 'WTT_PASSWORD'): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be configured for timetable requests.`);
  }

  return value;
}

export function getUsername(): string {
  return requiredEnvironmentVariable('WTT_USERNAME');
}

export function getPassword(): string {
  return requiredEnvironmentVariable('WTT_PASSWORD');
}

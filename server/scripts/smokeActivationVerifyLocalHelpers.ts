export const LOCAL_SMOKE_API_BASE_DEFAULT = 'http://localhost:4200'

export const LOCAL_SMOKE_API_REFUSAL_MESSAGE =
  'Local activation verify smoke refused: API base URL is not local'

export interface SmokeFixtureState {
  orderCreated: boolean
  itemCreated: boolean
}

export function shouldAttemptFixtureCleanup(state: SmokeFixtureState): boolean {
  return state.orderCreated || state.itemCreated
}

export function isLocalSmokeApiBase(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')

    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
      return false
    }

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function assertLocalSmokeApiBase(url: string): void {
  if (!isLocalSmokeApiBase(url)) {
    throw new Error(LOCAL_SMOKE_API_REFUSAL_MESSAGE)
  }
}

export function resolveSmokeApiBase(raw?: string): string {
  const base = raw?.trim() || LOCAL_SMOKE_API_BASE_DEFAULT
  assertLocalSmokeApiBase(base)
  return base.replace(/\/$/, '')
}

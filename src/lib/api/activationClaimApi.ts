import { parseRetryAfterMs } from './activationApi'
import { getBrowserSupabaseClient } from '../supabase/client'

export const ACTIVATION_CLAIM_PATH = '/api/activation/claim'

export type ActivationClaimOutcome =
  | 'success'
  | 'already_claimed'
  | 'no_context'
  | 'context_expired'
  | 'email_not_confirmed'
  | 'unauthenticated'
  | 'not_eligible'

export type ActivationClaimResult =
  | { kind: 'outcome'; outcome: ActivationClaimOutcome }
  | { kind: 'rate_limited'; retryAfterMs: number | null }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export interface ActivationClaimRequestOptions {
  fetchFn?: typeof fetch
  getAccessToken?: () => Promise<string | null>
  signal?: AbortSignal
}

const CLAIM_OUTCOMES = new Set<ActivationClaimOutcome>([
  'success',
  'already_claimed',
  'no_context',
  'context_expired',
  'email_not_confirmed',
  'unauthenticated',
  'not_eligible',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function mapClaimStatus(status: unknown): ActivationClaimOutcome | null {
  if (typeof status !== 'string') {
    return null
  }

  const normalized = status.toLowerCase()

  if (normalized === 'success') {
    return 'success'
  }

  if (normalized === 'already_claimed') {
    return 'already_claimed'
  }

  if (normalized === 'no_context') {
    return 'no_context'
  }

  if (normalized === 'context_expired') {
    return 'context_expired'
  }

  if (normalized === 'email_not_confirmed') {
    return 'email_not_confirmed'
  }

  if (normalized === 'unauthenticated') {
    return 'unauthenticated'
  }

  if (normalized === 'not_eligible') {
    return 'not_eligible'
  }

  return null
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

async function defaultGetAccessToken(): Promise<string | null> {
  const client = getBrowserSupabaseClient()
  const { data, error } = await client.auth.getSession()

  if (error || !data.session?.access_token) {
    return null
  }

  return data.session.access_token
}

export async function claimActivationEntitlement(
  options: ActivationClaimRequestOptions = {},
): Promise<ActivationClaimResult> {
  const fetchFn = options.fetchFn ?? fetch
  const getAccessToken = options.getAccessToken ?? defaultGetAccessToken
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return { kind: 'outcome', outcome: 'unauthenticated' }
  }

  try {
    const response = await fetchFn(ACTIVATION_CLAIM_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: options.signal,
    })

    const body = await readResponseBody(response)

    if (response.status === 429 && isRecord(body) && body.error === 'RATE_LIMITED') {
      return {
        kind: 'rate_limited',
        retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
      }
    }

    if (response.status >= 500) {
      return { kind: 'service_unavailable' }
    }

    if (response.status === 401 && isRecord(body) && body.status === 'UNAUTHENTICATED') {
      return { kind: 'outcome', outcome: 'unauthenticated' }
    }

    if (!response.ok) {
      return { kind: 'service_unavailable' }
    }

    if (isRecord(body)) {
      const outcome = mapClaimStatus(body.status)
      if (outcome && CLAIM_OUTCOMES.has(outcome)) {
        return { kind: 'outcome', outcome }
      }
    }

    return { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  }
}

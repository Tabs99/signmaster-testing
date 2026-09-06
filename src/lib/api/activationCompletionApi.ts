import { getBrowserSupabaseClient } from '../supabase/client'

export const ACTIVATION_COMPLETE_PATH = '/api/activation/complete'

export type ActivationCompletionOutcome =
  | 'completed'
  | 'no_context'
  | 'not_eligible'
  | 'email_not_confirmed'
  | 'unauthenticated'

export type ActivationCompletionResult =
  | { kind: 'outcome'; outcome: ActivationCompletionOutcome }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export interface ActivationCompletionRequestOptions {
  fetchFn?: typeof fetch
  getAccessToken?: () => Promise<string | null>
  signal?: AbortSignal
}

const COMPLETION_OUTCOMES = new Set<ActivationCompletionOutcome>([
  'completed',
  'no_context',
  'not_eligible',
  'email_not_confirmed',
  'unauthenticated',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function mapCompletionStatus(status: unknown): ActivationCompletionOutcome | null {
  if (typeof status !== 'string') {
    return null
  }

  const normalized = status.toLowerCase()

  if (normalized === 'completed') {
    return 'completed'
  }

  if (normalized === 'no_context') {
    return 'no_context'
  }

  if (normalized === 'not_eligible') {
    return 'not_eligible'
  }

  if (normalized === 'email_not_confirmed') {
    return 'email_not_confirmed'
  }

  if (normalized === 'unauthenticated') {
    return 'unauthenticated'
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

export async function completeActivation(
  options: ActivationCompletionRequestOptions = {},
): Promise<ActivationCompletionResult> {
  const fetchFn = options.fetchFn ?? fetch
  const getAccessToken = options.getAccessToken ?? defaultGetAccessToken
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return { kind: 'outcome', outcome: 'unauthenticated' }
  }

  try {
    const response = await fetchFn(ACTIVATION_COMPLETE_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: options.signal,
    })

    const body = await readResponseBody(response)

    if (response.status >= 500) {
      return { kind: 'service_unavailable' }
    }

    if (
      response.status === 401 &&
      isRecord(body) &&
      body.status === 'UNAUTHENTICATED'
    ) {
      return { kind: 'outcome', outcome: 'unauthenticated' }
    }

    if (!response.ok) {
      return { kind: 'service_unavailable' }
    }

    if (isRecord(body)) {
      const outcome = mapCompletionStatus(body.status)
      if (outcome && COMPLETION_OUTCOMES.has(outcome)) {
        return { kind: 'outcome', outcome }
      }
    }

    return { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  }
}

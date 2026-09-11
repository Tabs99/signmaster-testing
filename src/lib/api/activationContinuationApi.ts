import { getBrowserSupabaseClient } from '../supabase/client'

export const ACTIVATION_CONTINUATION_CREATE_PATH = '/api/activation/continuation'
export const ACTIVATION_CONTINUE_PATH = '/api/activation/continue'

// --- Create (mint reference in the original browser) ----------------------

export type ActivationContinuationCreateResult =
  | { kind: 'created'; reference: string }
  | { kind: 'no_context' }
  | { kind: 'error' }

export interface RequestActivationContinuationOptions {
  fetchFn?: typeof fetch
  signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

/**
 * Mints an opaque cross-device continuation reference bound to the current
 * activation context (resolved server-side from the HttpOnly cookie) and the
 * sign-up email. The reference is embedded in the confirmation email link.
 */
export async function requestActivationContinuation(
  email: string,
  options: RequestActivationContinuationOptions = {},
): Promise<ActivationContinuationCreateResult> {
  const fetchFn = options.fetchFn ?? fetch

  try {
    const response = await fetchFn(ACTIVATION_CONTINUATION_CREATE_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: options.signal,
    })

    const body = await readResponseBody(response)

    if (!response.ok) {
      return { kind: 'error' }
    }

    if (isRecord(body) && body.status === 'CREATED' && typeof body.reference === 'string') {
      return { kind: 'created', reference: body.reference }
    }

    if (isRecord(body) && body.status === 'NO_CONTEXT') {
      return { kind: 'no_context' }
    }

    return { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

// --- Consume (resume on the confirming device) ----------------------------

export type ActivationContinueOutcome =
  | 'continued'
  | 'invalid'
  | 'expired'
  | 'already_consumed'
  | 'email_not_confirmed'
  | 'unauthenticated'

export type ActivationContinueResult =
  | { kind: 'outcome'; outcome: ActivationContinueOutcome }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export interface ConsumeActivationContinuationOptions {
  fetchFn?: typeof fetch
  getAccessToken?: () => Promise<string | null>
  signal?: AbortSignal
}

const CONTINUE_OUTCOMES: Record<string, ActivationContinueOutcome> = {
  continued: 'continued',
  invalid: 'invalid',
  expired: 'expired',
  already_consumed: 'already_consumed',
  email_not_confirmed: 'email_not_confirmed',
  unauthenticated: 'unauthenticated',
}

function mapContinueStatus(status: unknown): ActivationContinueOutcome | null {
  if (typeof status !== 'string') {
    return null
  }

  return CONTINUE_OUTCOMES[status.toLowerCase()] ?? null
}

async function defaultGetAccessToken(): Promise<string | null> {
  const client = getBrowserSupabaseClient()
  const { data, error } = await client.auth.getSession()

  if (error || !data.session?.access_token) {
    return null
  }

  return data.session.access_token
}

/**
 * Consumes a continuation reference on the confirming device. Requires an
 * authenticated, confirmed session (established by the Supabase confirmation
 * redirect). On `continued` the server has re-issued the HttpOnly activation
 * context cookie for the same verified order.
 */
export async function consumeActivationContinuation(
  reference: string,
  options: ConsumeActivationContinuationOptions = {},
): Promise<ActivationContinueResult> {
  const fetchFn = options.fetchFn ?? fetch
  const getAccessToken = options.getAccessToken ?? defaultGetAccessToken
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return { kind: 'outcome', outcome: 'unauthenticated' }
  }

  try {
    const response = await fetchFn(ACTIVATION_CONTINUE_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: reference }),
      signal: options.signal,
    })

    const body = await readResponseBody(response)

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
      const outcome = mapContinueStatus(body.status)
      if (outcome) {
        return { kind: 'outcome', outcome }
      }
    }

    return { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  }
}

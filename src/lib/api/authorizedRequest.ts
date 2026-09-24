import { getBrowserSupabaseClient } from '../supabase/client'

/**
 * The pieces every bearer-token API client shares: reading the session token,
 * parsing a response body without trusting it, and the shape checks the
 * result-mapping code leans on.
 *
 * Each client still owns its own result type and status mapping — those are
 * the parts that differ per endpoint and the parts a reader wants to see in
 * one place.
 */

export interface AuthorizedRequestOptions {
  fetchFn?: typeof fetch
  getAccessToken?: () => Promise<string | null>
  signal?: AbortSignal
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The body as JSON, or null if it is empty or not JSON. Never throws. */
export async function readResponseBody(response: Response): Promise<unknown> {
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

export async function getSessionAccessToken(): Promise<string | null> {
  const client = getBrowserSupabaseClient()
  const { data, error } = await client.auth.getSession()

  if (error || !data.session?.access_token) {
    return null
  }

  return data.session.access_token
}

export interface AuthorizedFetchInit {
  method: 'GET' | 'POST'
  /** Serialised as JSON with the matching content type. */
  body?: unknown
}

/**
 * Performs a request with the session's bearer token. Resolves to null when
 * there is no session, so callers can return `unauthenticated` without a
 * network round trip. Network failures propagate as thrown errors, which
 * callers map to `connection_error`.
 */
export async function authorizedFetch(
  path: string,
  init: AuthorizedFetchInit,
  options: AuthorizedRequestOptions = {},
): Promise<Response | null> {
  const fetchFn = options.fetchFn ?? fetch
  const accessToken = await (options.getAccessToken ?? getSessionAccessToken)()

  if (!accessToken) {
    return null
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }

  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  return fetchFn(path, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: options.signal,
  })
}

import { getBrowserSupabaseClient } from '../supabase/client'

export const ENTITLEMENT_ME_PATH = '/api/entitlement/me'

/**
 * Discriminated, safe-category result of the server-authoritative entitlement
 * check. `active`/`none` are definitive answers from the backend;
 * `unauthenticated` means there is no usable session; `service_unavailable` /
 * `connection_error` are transient failures the caller must treat as
 * "no access yet" (fail closed) rather than as a definitive NONE.
 *
 * No Amazon Order ID, entitlement id, user id, or raw error ever crosses this
 * boundary — the client only ever learns one of these categories.
 */
export type EntitlementResult =
  | { kind: 'active' }
  | { kind: 'none' }
  | { kind: 'unauthenticated' }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export interface EntitlementRequestOptions {
  fetchFn?: typeof fetch
  getAccessToken?: () => Promise<string | null>
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

async function defaultGetAccessToken(): Promise<string | null> {
  const client = getBrowserSupabaseClient()
  const { data, error } = await client.auth.getSession()

  if (error || !data.session?.access_token) {
    return null
  }

  return data.session.access_token
}

/**
 * Fetches the authenticated user's entitlement status from the backend. The
 * browser only ever sends its Supabase bearer token; the user id is derived
 * server-side. Unknown/malformed responses collapse to `service_unavailable`
 * so a garbled payload can never be mistaken for a definitive answer.
 */
export async function fetchEntitlement(
  options: EntitlementRequestOptions = {},
): Promise<EntitlementResult> {
  const fetchFn = options.fetchFn ?? fetch
  const getAccessToken = options.getAccessToken ?? defaultGetAccessToken
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return { kind: 'unauthenticated' }
  }

  try {
    const response = await fetchFn(ENTITLEMENT_ME_PATH, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: options.signal,
    })

    const body = await readResponseBody(response)

    if (response.status === 401) {
      return { kind: 'unauthenticated' }
    }

    if (response.status >= 500) {
      return { kind: 'service_unavailable' }
    }

    if (!response.ok) {
      return { kind: 'service_unavailable' }
    }

    if (isRecord(body)) {
      if (body.status === 'ACTIVE') {
        return { kind: 'active' }
      }

      if (body.status === 'NONE') {
        return { kind: 'none' }
      }
    }

    return { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  }
}

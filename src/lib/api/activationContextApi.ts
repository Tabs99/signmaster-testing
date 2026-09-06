export const ACTIVATION_CONTEXT_PATH = '/api/activation/context'

export type ActivationContextResolutionStatus = 'VALID' | 'EXPIRED' | 'NONE'

export type ActivationContextCreateResult =
  | { kind: 'created' }
  | { kind: 'invalid_order_id' }
  | { kind: 'not_eligible' }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export type ActivationContextResolveResult =
  | { kind: 'status'; status: ActivationContextResolutionStatus }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export interface ActivationContextRequestOptions {
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

export async function createActivationContext(
  orderId: string,
  options: ActivationContextRequestOptions = {},
): Promise<ActivationContextCreateResult> {
  const fetchFn = options.fetchFn ?? fetch

  try {
    const response = await fetchFn(ACTIVATION_CONTEXT_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ orderId }),
      signal: options.signal,
    })

    const body = await readResponseBody(response)

    if (response.status === 400 && isRecord(body)) {
      if (body.error === 'INVALID_ORDER_ID') {
        return { kind: 'invalid_order_id' }
      }

      if (body.error === 'NOT_ELIGIBLE') {
        return { kind: 'not_eligible' }
      }
    }

    if (response.status >= 500) {
      return { kind: 'service_unavailable' }
    }

    if (!response.ok) {
      return { kind: 'service_unavailable' }
    }

    if (isRecord(body) && body.status === 'CREATED') {
      return { kind: 'created' }
    }

    return { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  }
}

export async function resolveActivationContext(
  options: ActivationContextRequestOptions = {},
): Promise<ActivationContextResolveResult> {
  const fetchFn = options.fetchFn ?? fetch

  try {
    const response = await fetchFn(ACTIVATION_CONTEXT_PATH, {
      method: 'GET',
      credentials: 'include',
      signal: options.signal,
    })

    const body = await readResponseBody(response)

    if (response.status >= 500) {
      return { kind: 'service_unavailable' }
    }

    if (!response.ok) {
      return { kind: 'service_unavailable' }
    }

    if (
      isRecord(body) &&
      (body.status === 'VALID' ||
        body.status === 'EXPIRED' ||
        body.status === 'NONE')
    ) {
      return {
        kind: 'status',
        status: body.status,
      }
    }

    return { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  }
}

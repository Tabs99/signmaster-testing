export const ACTIVATION_VERIFY_TIMEOUT_MS = 15_000

export const ACTIVATION_VERIFY_PATH = '/api/activation/verify'

export type ActivationBusinessStatus =
  | 'ELIGIBLE'
  | 'NOT_FOUND'
  | 'NOT_SHIPPED'
  | 'ALREADY_CLAIMED'
  | 'CANCELLED'
  | 'RETURNED'

const ACTIVATION_BUSINESS_STATUSES = new Set<ActivationBusinessStatus>([
  'ELIGIBLE',
  'NOT_FOUND',
  'NOT_SHIPPED',
  'ALREADY_CLAIMED',
  'CANCELLED',
  'RETURNED',
])

export type ActivationVerifyResult =
  | { kind: 'business_status'; status: ActivationBusinessStatus }
  | { kind: 'invalid_order_id' }
  | { kind: 'rate_limited'; retryAfterMs: number | null }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export interface VerifyActivationOrderOptions {
  fetchFn?: typeof fetch
  signal?: AbortSignal
  timeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isActivationBusinessStatus(
  value: unknown,
): value is ActivationBusinessStatus {
  return (
    typeof value === 'string' &&
    ACTIVATION_BUSINESS_STATUSES.has(value as ActivationBusinessStatus)
  )
}

export function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) {
    return null
  }

  const trimmed = retryAfterHeader.trim()
  if (!trimmed) {
    return null
  }

  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000)
  }

  const retryDate = Date.parse(trimmed)
  if (Number.isNaN(retryDate)) {
    return null
  }

  return Math.max(0, retryDate - Date.now())
}

function parseSuccessBody(body: unknown): ActivationVerifyResult | null {
  if (!isRecord(body)) {
    return null
  }

  if (body.status === 'ERROR') {
    return { kind: 'service_unavailable' }
  }

  if (isActivationBusinessStatus(body.status)) {
    return { kind: 'business_status', status: body.status }
  }

  return null
}

function parseErrorBody(body: unknown): ActivationVerifyResult | null {
  if (!isRecord(body)) {
    return null
  }

  if (body.error === 'INVALID_ORDER_ID') {
    return { kind: 'invalid_order_id' }
  }

  if (body.status === 'ERROR') {
    return { kind: 'service_unavailable' }
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

export async function verifyActivationOrder(
  orderId: string,
  options: VerifyActivationOrderOptions = {},
): Promise<ActivationVerifyResult> {
  const fetchFn = options.fetchFn ?? fetch
  const timeoutMs = options.timeoutMs ?? ACTIVATION_VERIFY_TIMEOUT_MS
  const timeoutController = new AbortController()
  const timeoutId = globalThis.setTimeout(() => timeoutController.abort(), timeoutMs)

  const signals: AbortSignal[] = [timeoutController.signal]
  if (options.signal) {
    signals.push(options.signal)
  }

  const combinedController = new AbortController()
  const onAbort = () => combinedController.abort()

  for (const signal of signals) {
    if (signal.aborted) {
      combinedController.abort()
      break
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const response = await fetchFn(ACTIVATION_VERIFY_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId }),
      signal: combinedController.signal,
    })

    const body = await readResponseBody(response)

    if (response.status === 400) {
      return parseErrorBody(body) ?? { kind: 'invalid_order_id' }
    }

    if (response.status === 429) {
      return {
        kind: 'rate_limited',
        retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
      }
    }

    if (response.status >= 500) {
      return { kind: 'service_unavailable' }
    }

    if (!response.ok) {
      return { kind: 'service_unavailable' }
    }

    return parseSuccessBody(body) ?? { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  } finally {
    globalThis.clearTimeout(timeoutId)
    for (const signal of signals) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

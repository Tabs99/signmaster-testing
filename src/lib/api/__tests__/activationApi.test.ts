import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVATION_VERIFY_PATH,
  ACTIVATION_VERIFY_TIMEOUT_MS,
  isActivationBusinessStatus,
  parseRetryAfterMs,
  verifyActivationOrder,
} from '../activationApi'

function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? headers[name] ?? null
      },
    },
    text: async () => (body === null ? '' : JSON.stringify(body)),
  } as Response
}

describe('activationApi', () => {
  it('POSTs JSON to /api/activation/verify with Content-Type application/json', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { status: 'ELIGIBLE' }))

    await verifyActivationOrder('205-1234567-1234567', { fetchFn })

    expect(fetchFn).toHaveBeenCalledWith(ACTIVATION_VERIFY_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: '205-1234567-1234567' }),
      signal: expect.any(AbortSignal),
    })
  })

  it.each([
    ['ELIGIBLE', 'ELIGIBLE'],
    ['NOT_FOUND', 'NOT_FOUND'],
    ['NOT_SHIPPED', 'NOT_SHIPPED'],
    ['ALREADY_CLAIMED', 'ALREADY_CLAIMED'],
    ['CANCELLED', 'CANCELLED'],
    ['RETURNED', 'RETURNED'],
  ] as const)('maps business status %s', async (status, expected) => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { status }))

    await expect(verifyActivationOrder('205-1234567-1234567', { fetchFn })).resolves.toEqual({
      kind: 'business_status',
      status: expected,
    })
  })

  it('maps 400 INVALID_ORDER_ID', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mockResponse(400, { error: 'INVALID_ORDER_ID' }))

    await expect(verifyActivationOrder('205-1234567-1234567', { fetchFn })).resolves.toEqual({
      kind: 'invalid_order_id',
    })
  })

  it('maps 429 with Retry-After seconds', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(429, { error: 'RATE_LIMITED' }, { 'retry-after': '120' }),
    )

    const result = await verifyActivationOrder('205-1234567-1234567', { fetchFn })

    expect(result).toEqual({ kind: 'rate_limited', retryAfterMs: 120_000 })
  })

  it('maps 429 without usable Retry-After', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(429, { error: 'RATE_LIMITED' }, {}))

    await expect(verifyActivationOrder('205-1234567-1234567', { fetchFn })).resolves.toEqual({
      kind: 'rate_limited',
      retryAfterMs: null,
    })
  })

  it('maps 500 and ERROR status to service_unavailable', async () => {
    const fetch500 = vi.fn().mockResolvedValue(mockResponse(500, { status: 'ERROR' }))
    const fetch200Error = vi.fn().mockResolvedValue(mockResponse(200, { status: 'ERROR' }))

    await expect(verifyActivationOrder('205-1234567-1234567', { fetchFn: fetch500 })).resolves.toEqual(
      { kind: 'service_unavailable' },
    )
    await expect(
      verifyActivationOrder('205-1234567-1234567', { fetchFn: fetch200Error }),
    ).resolves.toEqual({ kind: 'service_unavailable' })
  })

  it('maps unknown status and malformed bodies to service_unavailable', async () => {
    const unknown = vi.fn().mockResolvedValue(mockResponse(200, { status: 'MYSTERY' }))
    const malformed = vi.fn().mockResolvedValue(mockResponse(200, 'not-json'))
    const empty = vi.fn().mockResolvedValue(mockResponse(200, null))

    await expect(verifyActivationOrder('205-1234567-1234567', { fetchFn: unknown })).resolves.toEqual(
      { kind: 'service_unavailable' },
    )
    await expect(
      verifyActivationOrder('205-1234567-1234567', { fetchFn: malformed }),
    ).resolves.toEqual({ kind: 'service_unavailable' })
    await expect(verifyActivationOrder('205-1234567-1234567', { fetchFn: empty })).resolves.toEqual(
      { kind: 'service_unavailable' },
    )
  })

  it('maps invalid JSON to service_unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => '{bad json',
    } as unknown as Response)

    await expect(verifyActivationOrder('205-1234567-1234567', { fetchFn })).resolves.toEqual({
      kind: 'service_unavailable',
    })
  })

  it('maps fetch rejection and timeout to connection_error', async () => {
    const rejecting = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(verifyActivationOrder('205-1234567-1234567', { fetchFn: rejecting })).resolves.toEqual(
      { kind: 'connection_error' },
    )

    vi.useFakeTimers()
    const hanging = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      }),
    )

    const promise = verifyActivationOrder('205-1234567-1234567', {
      fetchFn: hanging,
      timeoutMs: 50,
    })
    await vi.advanceTimersByTimeAsync(60)
    await expect(promise).resolves.toEqual({ kind: 'connection_error' })
    vi.useRealTimers()
  })

  it('parses Retry-After HTTP date', () => {
    const future = new Date(Date.now() + 90_000).toUTCString()
    const parsed = parseRetryAfterMs(future)
    expect(parsed).not.toBeNull()
    expect(parsed!).toBeGreaterThan(80_000)
    expect(parsed!).toBeLessThanOrEqual(90_000)
  })

  it('returns null for unsupported Retry-After values', () => {
    expect(parseRetryAfterMs('not-a-valid-delay')).toBeNull()
    expect(parseRetryAfterMs('')).toBeNull()
  })

  it('recognises business statuses at runtime', () => {
    expect(isActivationBusinessStatus('ELIGIBLE')).toBe(true)
    expect(isActivationBusinessStatus('UNKNOWN')).toBe(false)
  })

  it('uses the 15 second default timeout constant', () => {
    expect(ACTIVATION_VERIFY_TIMEOUT_MS).toBe(15_000)
  })
})

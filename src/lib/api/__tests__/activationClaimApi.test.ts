import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVATION_CLAIM_REQUEST_BODY,
  buildActivationClaimRequestInit,
  claimActivationEntitlement,
} from '../activationClaimApi.ts'

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

describe('activationClaimApi', () => {
  it('builds a bodyless claim request with an empty JSON object only', () => {
    const init = buildActivationClaimRequestInit('test-access-token')

    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-access-token',
      'Content-Type': 'application/json',
    })
    expect(init.body).toBe(ACTIVATION_CLAIM_REQUEST_BODY)
    expect(JSON.parse(ACTIVATION_CLAIM_REQUEST_BODY)).toEqual({})

    const parsed = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(Object.keys(parsed)).toHaveLength(0)
    expect(parsed).not.toHaveProperty('orderId')
    expect(parsed).not.toHaveProperty('email')
    expect(parsed).not.toHaveProperty('userId')
  })

  it('POSTs with credentials include and bearer token only', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'SUCCESS' }), { status: 200 }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'test-access-token',
      }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'success' })

    expect(fetchFn).toHaveBeenCalledWith(
      '/api/activation/claim',
      expect.objectContaining({
        ...buildActivationClaimRequestInit('test-access-token'),
      }),
    )

    const requestInit = fetchFn.mock.calls[0]?.[1]
    expect(requestInit?.body).toBe('{}')
    expect(JSON.parse(String(requestInit?.body))).toEqual({})
  })

  it('maps SUCCESS', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'SUCCESS' }), { status: 200 }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'success' })
  })

  it('maps ALREADY_CLAIMED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ALREADY_CLAIMED' }), { status: 200 }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'already_claimed' })
  })

  it('maps NO_CONTEXT', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'NO_CONTEXT' }), { status: 200 }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'no_context' })
  })

  it('maps CONTEXT_EXPIRED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'CONTEXT_EXPIRED' }), { status: 200 }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'context_expired' })
  })

  it('maps EMAIL_NOT_CONFIRMED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'EMAIL_NOT_CONFIRMED' }), { status: 200 }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'email_not_confirmed' })
  })

  it('maps UNAUTHENTICATED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'UNAUTHENTICATED' }), { status: 401 }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'unauthenticated' })
  })

  it('maps NOT_ELIGIBLE', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'NOT_ELIGIBLE' }), { status: 200 }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'not_eligible' })
  })

  it('maps 429 RATE_LIMITED with Retry-After seconds', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(429, { error: 'RATE_LIMITED' }, { 'retry-after': '120' }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'rate_limited', retryAfterMs: 120_000 })
  })

  it('maps 429 RATE_LIMITED without usable Retry-After', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(429, { error: 'RATE_LIMITED' }, {}),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'rate_limited', retryAfterMs: null })
  })

  it('maps 429 RATE_LIMITED with malformed Retry-After to rate_limited with null retryAfterMs', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(429, { error: 'RATE_LIMITED' }, { 'retry-after': 'not-a-delay' }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'rate_limited', retryAfterMs: null })
  })

  it('maps 429 without RATE_LIMITED to service_unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(429, { error: 'OTHER' }, {}))

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'service_unavailable' })
  })

  it('maps 5xx to service_unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ERROR' }), { status: 500 }),
    )

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'service_unavailable' })
  })

  it('maps network errors to connection_error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'connection_error' })
  })

  it('maps malformed responses to service_unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }))

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => 'token',
      }),
    ).resolves.toEqual({ kind: 'service_unavailable' })
  })

  it('returns unauthenticated when no access token is available', async () => {
    const fetchFn = vi.fn()

    await expect(
      claimActivationEntitlement({
        fetchFn,
        getAccessToken: async () => null,
      }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'unauthenticated' })

    expect(fetchFn).not.toHaveBeenCalled()
  })
})

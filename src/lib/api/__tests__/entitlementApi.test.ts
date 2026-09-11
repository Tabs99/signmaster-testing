import { describe, expect, it, vi } from 'vitest'
import { fetchEntitlement } from '../entitlementApi.ts'

describe('entitlementApi', () => {
  it('GETs /api/entitlement/me with a bearer token and no body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ACTIVE' }), { status: 200 }),
    )

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => 'test-token' }),
    ).resolves.toEqual({ kind: 'active' })

    expect(fetchFn).toHaveBeenCalledWith(
      '/api/entitlement/me',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer test-token' },
      }),
    )

    const requestInit = fetchFn.mock.calls[0]?.[1]
    expect(requestInit?.body).toBeUndefined()
  })

  it('maps ACTIVE to active', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ACTIVE' }), { status: 200 }),
    )

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => 'token' }),
    ).resolves.toEqual({ kind: 'active' })
  })

  it('maps NONE to none', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'NONE' }), { status: 200 }),
    )

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => 'token' }),
    ).resolves.toEqual({ kind: 'none' })
  })

  it('returns unauthenticated when there is no access token (no request sent)', async () => {
    const fetchFn = vi.fn()

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => null }),
    ).resolves.toEqual({ kind: 'unauthenticated' })

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('maps 401 to unauthenticated', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'UNAUTHENTICATED' }), { status: 401 }),
    )

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => 'token' }),
    ).resolves.toEqual({ kind: 'unauthenticated' })
  })

  it('maps 5xx to service_unavailable (never a definitive none)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ERROR' }), { status: 500 }),
    )

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => 'token' }),
    ).resolves.toEqual({ kind: 'service_unavailable' })
  })

  it('maps other non-ok responses to service_unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 403 }))

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => 'token' }),
    ).resolves.toEqual({ kind: 'service_unavailable' })
  })

  it('maps network failures to connection_error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => 'token' }),
    ).resolves.toEqual({ kind: 'connection_error' })
  })

  it('maps unknown/malformed status payloads to service_unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'MAYBE' }), { status: 200 }),
    )

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => 'token' }),
    ).resolves.toEqual({ kind: 'service_unavailable' })
  })

  it('maps non-JSON bodies to service_unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }))

    await expect(
      fetchEntitlement({ fetchFn, getAccessToken: async () => 'token' }),
    ).resolves.toEqual({ kind: 'service_unavailable' })
  })
})

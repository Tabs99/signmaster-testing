import { describe, expect, it, vi } from 'vitest'
import { claimActivationEntitlement } from '../activationClaimApi.ts'

describe('activationClaimApi', () => {
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
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: 'Bearer test-access-token',
        },
      }),
    )

    const requestInit = fetchFn.mock.calls[0]?.[1]
    expect(requestInit?.body).toBeUndefined()
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

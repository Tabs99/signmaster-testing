import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVATION_COMPLETE_PATH,
  completeActivation,
} from '../activationCompletionApi'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const getAccessToken = () => Promise.resolve('test-access-token')

describe('completeActivation', () => {
  it('returns unauthenticated without calling the network when no token is available', async () => {
    const fetchFn = vi.fn()

    const result = await completeActivation({
      fetchFn: fetchFn as unknown as typeof fetch,
      getAccessToken: () => Promise.resolve(null),
    })

    expect(result).toEqual({ kind: 'outcome', outcome: 'unauthenticated' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('posts with bearer auth and credentials and maps COMPLETED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'COMPLETED' }))

    const result = await completeActivation({
      fetchFn: fetchFn as unknown as typeof fetch,
      getAccessToken,
    })

    expect(result).toEqual({ kind: 'outcome', outcome: 'completed' })
    expect(fetchFn).toHaveBeenCalledWith(
      ACTIVATION_COMPLETE_PATH,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: 'Bearer test-access-token' },
      }),
    )
  })

  it.each([
    ['NO_CONTEXT', 'no_context'],
    ['NOT_ELIGIBLE', 'not_eligible'],
    ['EMAIL_NOT_CONFIRMED', 'email_not_confirmed'],
  ] as const)('maps %s to %s', async (status, outcome) => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { status }))

    const result = await completeActivation({
      fetchFn: fetchFn as unknown as typeof fetch,
      getAccessToken,
    })

    expect(result).toEqual({ kind: 'outcome', outcome })
  })

  it('maps a 401 UNAUTHENTICATED body to the unauthenticated outcome', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { status: 'UNAUTHENTICATED' }))

    const result = await completeActivation({
      fetchFn: fetchFn as unknown as typeof fetch,
      getAccessToken,
    })

    expect(result).toEqual({ kind: 'outcome', outcome: 'unauthenticated' })
  })

  it('treats 5xx responses as service_unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(500, { status: 'ERROR' }))

    const result = await completeActivation({
      fetchFn: fetchFn as unknown as typeof fetch,
      getAccessToken,
    })

    expect(result).toEqual({ kind: 'service_unavailable' })
  })

  it('treats network failures as connection_error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('network down'))

    const result = await completeActivation({
      fetchFn: fetchFn as unknown as typeof fetch,
      getAccessToken,
    })

    expect(result).toEqual({ kind: 'connection_error' })
  })

  it('treats malformed/unknown bodies as service_unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'WAT' }))

    const result = await completeActivation({
      fetchFn: fetchFn as unknown as typeof fetch,
      getAccessToken,
    })

    expect(result).toEqual({ kind: 'service_unavailable' })
  })
})

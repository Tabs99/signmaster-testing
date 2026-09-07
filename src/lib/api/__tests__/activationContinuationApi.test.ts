import { describe, expect, it, vi } from 'vitest'
import {
  requestActivationContinuation,
  consumeActivationContinuation,
  ACTIVATION_CONTINUATION_CREATE_PATH,
  ACTIVATION_CONTINUE_PATH,
} from '../activationContinuationApi'

const REFERENCE = 'cross-device-reference-abcdefghijklmnopqrstuvwxyz012345'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('requestActivationContinuation', () => {
  it('posts the email with credentials and returns the reference', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { status: 'CREATED', reference: REFERENCE }))

    const result = await requestActivationContinuation('owner@example.invalid', { fetchFn })

    expect(result).toEqual({ kind: 'created', reference: REFERENCE })
    const [path, init] = fetchFn.mock.calls[0]
    expect(path).toBe(ACTIVATION_CONTINUATION_CREATE_PATH)
    expect(init?.credentials).toBe('include')
    expect(init?.method).toBe('POST')
    expect(String(init?.body)).toContain('owner@example.invalid')
  })

  it('maps NO_CONTEXT', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { status: 'NO_CONTEXT' }))
    await expect(
      requestActivationContinuation('owner@example.invalid', { fetchFn }),
    ).resolves.toEqual({ kind: 'no_context' })
  })

  it('maps server failures and network errors to error', async () => {
    const failing = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(500, { status: 'ERROR' }))
    await expect(
      requestActivationContinuation('owner@example.invalid', { fetchFn: failing }),
    ).resolves.toEqual({ kind: 'error' })

    const throwing = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
    await expect(
      requestActivationContinuation('owner@example.invalid', { fetchFn: throwing }),
    ).resolves.toEqual({ kind: 'error' })
  })
})

describe('consumeActivationContinuation', () => {
  const getAccessToken = () => Promise.resolve('token-abc')

  it('returns unauthenticated without calling fetch when no token', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const result = await consumeActivationContinuation(REFERENCE, {
      fetchFn,
      getAccessToken: () => Promise.resolve(null),
    })
    expect(result).toEqual({ kind: 'outcome', outcome: 'unauthenticated' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('sends the bearer token and reference and maps continued', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { status: 'CONTINUED' }))

    const result = await consumeActivationContinuation(REFERENCE, { fetchFn, getAccessToken })

    expect(result).toEqual({ kind: 'outcome', outcome: 'continued' })
    const [path, init] = fetchFn.mock.calls[0]
    expect(path).toBe(ACTIVATION_CONTINUE_PATH)
    expect(init?.credentials).toBe('include')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-abc')
    expect(String(init?.body)).toContain(REFERENCE)
  })

  it.each(['invalid', 'expired', 'already_consumed', 'email_not_confirmed'] as const)(
    'maps the %s outcome',
    async (outcome) => {
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(200, { status: outcome.toUpperCase() }))
      await expect(
        consumeActivationContinuation(REFERENCE, { fetchFn, getAccessToken }),
      ).resolves.toEqual({ kind: 'outcome', outcome })
    },
  )

  it('maps 5xx to service_unavailable and thrown errors to connection_error', async () => {
    const failing = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(503, { status: 'ERROR' }))
    await expect(
      consumeActivationContinuation(REFERENCE, { fetchFn: failing, getAccessToken }),
    ).resolves.toEqual({ kind: 'service_unavailable' })

    const throwing = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
    await expect(
      consumeActivationContinuation(REFERENCE, { fetchFn: throwing, getAccessToken }),
    ).resolves.toEqual({ kind: 'connection_error' })
  })

  it('maps a 401 UNAUTHENTICATED body to the unauthenticated outcome', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(401, { status: 'UNAUTHENTICATED' }))
    await expect(
      consumeActivationContinuation(REFERENCE, { fetchFn, getAccessToken }),
    ).resolves.toEqual({ kind: 'outcome', outcome: 'unauthenticated' })
  })
})

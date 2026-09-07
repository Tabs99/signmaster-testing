import { describe, expect, it, vi } from 'vitest'
import {
  handleActivationContinue,
  type ActivationContinueHandlerDeps,
  type VercelLikeResponse,
} from '../continue.ts'

const CURRENT_USER_ID = '11111111-1111-4111-8111-111111111111'
const EMAIL = 'owner@example.invalid'
const REFERENCE = 'cross-device-reference-abcdefghijklmnopqrstuvwxyz012345'
const CONTEXT_TOKEN = 'fresh-context-token-abcdefghijklmnopqrstuvwxyz012345'

function createMockResponse(): VercelLikeResponse & {
  statusCode: number | null
  body: unknown
  headers: Record<string, string | string[]>
} {
  const response = {
    statusCode: null as number | null,
    body: null as unknown,
    headers: {} as Record<string, string | string[]>,
    setHeader(name: string, value: string | string[]) {
      response.headers[name] = value
      return response
    },
    status(code: number) {
      response.statusCode = code
      return response
    },
    json(body: unknown) {
      response.body = body
      return undefined
    },
  }

  return response
}

function createDeps(
  overrides: Partial<ActivationContinueHandlerDeps> = {},
): ActivationContinueHandlerDeps {
  return {
    createClient: vi.fn().mockReturnValue({}),
    getAuthenticatedUser: vi
      .fn()
      .mockResolvedValue({ id: CURRENT_USER_ID, email: EMAIL, emailConfirmed: true }),
    consumeContinuation: vi.fn(),
    shouldUseSecureCookie: vi.fn().mockReturnValue(false),
    ...overrides,
  }
}

const headers = { authorization: 'Bearer test-access-token' }

function isContextSetCookie(value: string | string[] | undefined): boolean {
  const cookie = Array.isArray(value) ? value.join('; ') : value
  return Boolean(
    cookie &&
      cookie.includes('sm_activation_ctx=') &&
      cookie.includes('HttpOnly') &&
      !cookie.includes('Max-Age=0'),
  )
}

describe('handleActivationContinue', () => {
  it('rejects non-POST methods', async () => {
    const res = createMockResponse()
    await handleActivationContinue({ method: 'GET' }, res, createDeps())
    expect(res.statusCode).toBe(405)
    expect(res.headers['Allow']).toBe('POST')
  })

  it('returns UNAUTHENTICATED when no session is present', async () => {
    const res = createMockResponse()
    const consumeContinuation = vi.fn()
    await handleActivationContinue(
      { method: 'POST', headers, body: { ref: REFERENCE } },
      res,
      createDeps({
        getAuthenticatedUser: vi.fn().mockResolvedValue(null),
        consumeContinuation,
      }),
    )
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ status: 'UNAUTHENTICATED' })
    expect(consumeContinuation).not.toHaveBeenCalled()
  })

  it('returns EMAIL_NOT_CONFIRMED for unconfirmed users', async () => {
    const res = createMockResponse()
    const consumeContinuation = vi.fn()
    await handleActivationContinue(
      { method: 'POST', headers, body: { ref: REFERENCE } },
      res,
      createDeps({
        getAuthenticatedUser: vi
          .fn()
          .mockResolvedValue({ id: CURRENT_USER_ID, email: EMAIL, emailConfirmed: false }),
        consumeContinuation,
      }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'EMAIL_NOT_CONFIRMED' })
    expect(consumeContinuation).not.toHaveBeenCalled()
  })

  it('returns INVALID when the reference is missing from the body', async () => {
    const res = createMockResponse()
    const consumeContinuation = vi.fn()
    await handleActivationContinue(
      { method: 'POST', headers, body: {} },
      res,
      createDeps({ consumeContinuation }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'INVALID' })
    expect(consumeContinuation).not.toHaveBeenCalled()
  })

  it('sets the activation context cookie and returns CONTINUED on success', async () => {
    const res = createMockResponse()
    const consumeContinuation = vi
      .fn()
      .mockResolvedValue({ status: 'CONTINUED', contextToken: CONTEXT_TOKEN })
    await handleActivationContinue(
      { method: 'POST', headers, body: { ref: REFERENCE } },
      res,
      createDeps({ consumeContinuation }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'CONTINUED' })
    expect(isContextSetCookie(res.headers['Set-Cookie'])).toBe(true)
    // The authenticated (trusted) email is the binding authority passed to consume.
    expect(consumeContinuation).toHaveBeenCalledWith(
      expect.objectContaining({ reference: REFERENCE, email: EMAIL }),
    )
  })

  it.each(['INVALID', 'EXPIRED', 'ALREADY_CONSUMED'] as const)(
    'returns %s without setting a cookie',
    async (status) => {
      const res = createMockResponse()
      await handleActivationContinue(
        { method: 'POST', headers, body: { ref: REFERENCE } },
        res,
        createDeps({ consumeContinuation: vi.fn().mockResolvedValue({ status }) }),
      )
      expect(res.statusCode).toBe(200)
      expect(res.body).toEqual({ status })
      expect(res.headers['Set-Cookie']).toBeUndefined()
    },
  )

  it('returns ERROR without leaking the reference or token when consume throws', async () => {
    const res = createMockResponse()
    await handleActivationContinue(
      { method: 'POST', headers, body: { ref: REFERENCE } },
      res,
      createDeps({
        consumeContinuation: vi
          .fn()
          .mockRejectedValue(new Error(`boom ${REFERENCE} ${CONTEXT_TOKEN}`)),
      }),
    )
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain(REFERENCE)
    expect(serialized).not.toContain(CONTEXT_TOKEN)
  })
})

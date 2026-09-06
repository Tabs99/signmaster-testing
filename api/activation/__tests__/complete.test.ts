import { describe, expect, it, vi } from 'vitest'
import {
  handleActivationComplete,
  type ActivationCompleteHandlerDeps,
  type VercelLikeResponse,
} from '../complete.ts'

const FIXTURE_TOKEN = 'fixture-opaque-token-123456789012345678901234567890'
const CURRENT_USER_ID = '11111111-1111-4111-8111-111111111111'
const CONTEXT_COOKIE_NAME = 'sm_activation_ctx'

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
  overrides: Partial<ActivationCompleteHandlerDeps> = {},
): ActivationCompleteHandlerDeps {
  return {
    createClient: vi.fn().mockReturnValue({}),
    getAuthenticatedUser: vi.fn(),
    finalizeCompletion: vi.fn(),
    shouldUseSecureCookie: vi.fn().mockReturnValue(false),
    ...overrides,
  }
}

const requestHeaders = {
  authorization: 'Bearer test-access-token',
  cookie: `${CONTEXT_COOKIE_NAME}=${encodeURIComponent(FIXTURE_TOKEN)}`,
}

function isClearCookie(value: string | string[] | undefined): boolean {
  const cookie = Array.isArray(value) ? value.join('; ') : value
  return Boolean(cookie && cookie.includes('Max-Age=0') && cookie.includes('HttpOnly'))
}

describe('handleActivationComplete', () => {
  it('rejects non-POST methods', async () => {
    const res = createMockResponse()

    await handleActivationComplete({ method: 'GET' }, res, createDeps())

    expect(res.statusCode).toBe(405)
    expect(res.headers['Allow']).toBe('POST')
  })

  it('returns UNAUTHENTICATED when no session is present', async () => {
    const res = createMockResponse()
    const finalizeCompletion = vi.fn()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue(null),
      finalizeCompletion,
    })

    await handleActivationComplete({ method: 'POST', headers: requestHeaders }, res, deps)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ status: 'UNAUTHENTICATED' })
    expect(finalizeCompletion).not.toHaveBeenCalled()
  })

  it('returns EMAIL_NOT_CONFIRMED for unconfirmed users', async () => {
    const res = createMockResponse()
    const finalizeCompletion = vi.fn()
    const deps = createDeps({
      getAuthenticatedUser: vi
        .fn()
        .mockResolvedValue({ id: CURRENT_USER_ID, emailConfirmed: false }),
      finalizeCompletion,
    })

    await handleActivationComplete({ method: 'POST', headers: requestHeaders }, res, deps)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'EMAIL_NOT_CONFIRMED' })
    expect(finalizeCompletion).not.toHaveBeenCalled()
  })

  it('returns NO_CONTEXT without clearing a cookie when none is present', async () => {
    const res = createMockResponse()
    const finalizeCompletion = vi.fn()
    const deps = createDeps({
      getAuthenticatedUser: vi
        .fn()
        .mockResolvedValue({ id: CURRENT_USER_ID, emailConfirmed: true }),
      finalizeCompletion,
    })

    await handleActivationComplete(
      { method: 'POST', headers: { authorization: 'Bearer test-access-token' } },
      res,
      deps,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'NO_CONTEXT' })
    expect(res.headers['Set-Cookie']).toBeUndefined()
    expect(finalizeCompletion).not.toHaveBeenCalled()
  })

  it('clears the activation cookie and returns COMPLETED on success', async () => {
    const res = createMockResponse()
    const finalizeCompletion = vi.fn().mockResolvedValue('COMPLETED')
    const deps = createDeps({
      getAuthenticatedUser: vi
        .fn()
        .mockResolvedValue({ id: CURRENT_USER_ID, emailConfirmed: true }),
      finalizeCompletion,
    })

    await handleActivationComplete({ method: 'POST', headers: requestHeaders }, res, deps)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'COMPLETED' })
    expect(isClearCookie(res.headers['Set-Cookie'])).toBe(true)
    expect(finalizeCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ userId: CURRENT_USER_ID, token: FIXTURE_TOKEN }),
    )
  })

  it('clears the stale cookie and returns NO_CONTEXT for a gone/expired context (repeat completion)', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi
        .fn()
        .mockResolvedValue({ id: CURRENT_USER_ID, emailConfirmed: true }),
      finalizeCompletion: vi.fn().mockResolvedValue('NO_CONTEXT'),
    })

    await handleActivationComplete({ method: 'POST', headers: requestHeaders }, res, deps)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'NO_CONTEXT' })
    expect(isClearCookie(res.headers['Set-Cookie'])).toBe(true)
  })

  it('returns NOT_ELIGIBLE without clearing the cookie', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi
        .fn()
        .mockResolvedValue({ id: CURRENT_USER_ID, emailConfirmed: true }),
      finalizeCompletion: vi.fn().mockResolvedValue('NOT_ELIGIBLE'),
    })

    await handleActivationComplete({ method: 'POST', headers: requestHeaders }, res, deps)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'NOT_ELIGIBLE' })
    expect(res.headers['Set-Cookie']).toBeUndefined()
  })

  it('returns ERROR without leaking details when finalisation throws', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi
        .fn()
        .mockResolvedValue({ id: CURRENT_USER_ID, emailConfirmed: true }),
      finalizeCompletion: vi
        .fn()
        .mockRejectedValue(new Error(`invalidate failed for ${FIXTURE_TOKEN}`)),
    })

    await handleActivationComplete({ method: 'POST', headers: requestHeaders }, res, deps)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
    expect(res.headers['Set-Cookie']).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain(FIXTURE_TOKEN)
  })

  it('never exposes the activation token or order id in any response', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi
        .fn()
        .mockResolvedValue({ id: CURRENT_USER_ID, emailConfirmed: true }),
      finalizeCompletion: vi.fn().mockResolvedValue('COMPLETED'),
    })

    await handleActivationComplete(
      {
        method: 'POST',
        headers: requestHeaders,
        body: { orderId: '999-9999999-9999999', token: FIXTURE_TOKEN },
      },
      res,
      deps,
    )

    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain(FIXTURE_TOKEN)
    expect(serialized).not.toContain('999-9999999-9999999')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { hashActivationContextToken } from '../../../server/activation/contextToken.ts'
import {
  ActivationContextError,
  ACTIVATION_CONTEXT_LIFETIME_MS,
  createActivationContext,
  resolveActivationContext,
  type ActivationContextResolutionStatus,
  type ActivationContextRow,
} from '../../../server/services/activationContextService.ts'
import {
  handleActivationContext,
  handleActivationContextCreate,
  handleActivationContextResolve,
  parseActivationContextCreateRequestBody,
  type VercelLikeResponse,
} from '../context.ts'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const FIXTURE_TOKEN = 'fixture-opaque-token-123456789012345678901234567890'

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

describe('parseActivationContextCreateRequestBody', () => {
  it('accepts a valid order ID', () => {
    expect(
      parseActivationContextCreateRequestBody({ orderId: FIXTURE_ORDER_ID }),
    ).toEqual({ orderId: FIXTURE_ORDER_ID })
  })

  it('rejects malformed bodies', () => {
    expect(parseActivationContextCreateRequestBody({})).toBeNull()
    expect(parseActivationContextCreateRequestBody({ orderId: 'bad' })).toBeNull()
  })
})

describe('handleActivationContextCreate', () => {
  it('creates context only after server-side ELIGIBLE verification', async () => {
    const res = createMockResponse()
    const verifyEligibility = vi.fn().mockResolvedValue({ status: 'ELIGIBLE' })
    const createContext = vi.fn().mockResolvedValue({
      token: FIXTURE_TOKEN,
      expiresAt: new Date('2026-09-06T13:00:00.000Z'),
    })

    await handleActivationContextCreate(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
      },
      res,
      {
        createClient: vi.fn().mockReturnValue({}),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility,
        createContext,
        resolveContext: vi.fn(),
        shouldUseSecureCookie: () => true,
      },
    )

    expect(verifyEligibility).toHaveBeenCalledWith(FIXTURE_ORDER_ID, expect.any(Object))
    expect(createContext).toHaveBeenCalledWith(FIXTURE_ORDER_ID, expect.any(Object))
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'CREATED' })
    expect(String(res.headers['Set-Cookie'])).toContain('HttpOnly')
    expect(String(res.headers['Set-Cookie'])).toContain('Secure')
    expect(String(res.headers['Set-Cookie'])).toContain('SameSite=Lax')
    expect(String(res.headers['Set-Cookie'])).toContain('Max-Age=3600')
  })

  it('rejects non-eligible verification results', async () => {
    const res = createMockResponse()

    await handleActivationContextCreate(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
      },
      res,
      {
        createClient: vi.fn().mockReturnValue({}),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn().mockResolvedValue({ status: 'NOT_FOUND' }),
        createContext: vi.fn(),
        resolveContext: vi.fn(),
        shouldUseSecureCookie: () => false,
      },
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'NOT_ELIGIBLE' })
  })

  it('allows insecure cookies in local development', async () => {
    const res = createMockResponse()

    await handleActivationContextCreate(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
      },
      res,
      {
        createClient: vi.fn().mockReturnValue({}),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn().mockResolvedValue({ status: 'ELIGIBLE' }),
        createContext: vi.fn().mockResolvedValue({
          token: FIXTURE_TOKEN,
          expiresAt: new Date('2026-09-06T13:00:00.000Z'),
        }),
        resolveContext: vi.fn(),
        shouldUseSecureCookie: () => false,
      },
    )

    expect(String(res.headers['Set-Cookie'])).not.toContain('Secure')
  })
})

describe('handleActivationContextResolve', () => {
  it('returns VALID without exposing order data', async () => {
    const res = createMockResponse()
    const resolveContext = vi.fn().mockResolvedValue('VALID' satisfies ActivationContextResolutionStatus)
    const createContext = vi.fn()

    await handleActivationContextResolve(
      {
        method: 'GET',
        headers: {
          cookie: `sm_activation_ctx=${FIXTURE_TOKEN}`,
        },
      },
      res,
      {
        createClient: vi.fn().mockReturnValue({}),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn(),
        createContext,
        resolveContext,
        shouldUseSecureCookie: () => true,
      },
    )

    expect(resolveContext).toHaveBeenCalledWith(
      expect.objectContaining({ token: FIXTURE_TOKEN }),
    )
    expect(createContext).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'VALID' })

    const setCookie = String(res.headers['Set-Cookie'])
    expect(setCookie).toContain(`sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Max-Age=3600')
  })

  it('reissues the same opaque token on VALID resolve in local development', async () => {
    const res = createMockResponse()
    const resolveContext = vi.fn().mockResolvedValue('VALID' satisfies ActivationContextResolutionStatus)

    await handleActivationContextResolve(
      {
        method: 'GET',
        headers: {
          cookie: `sm_activation_ctx=${FIXTURE_TOKEN}`,
        },
      },
      res,
      {
        createClient: vi.fn().mockReturnValue({}),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn(),
        createContext: vi.fn(),
        resolveContext,
        shouldUseSecureCookie: () => false,
      },
    )

    const setCookie = String(res.headers['Set-Cookie'])
    expect(setCookie).toContain(`sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`)
    expect(setCookie).not.toContain('Secure')
    expect(setCookie).toContain('Max-Age=3600')
  })

  it('returns NONE when cookie is missing', async () => {
    const res = createMockResponse()

    await handleActivationContextResolve(
      { method: 'GET', headers: {} },
      res,
      {
        createClient: vi.fn().mockReturnValue({}),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn(),
        createContext: vi.fn(),
        resolveContext: vi.fn(),
        shouldUseSecureCookie: () => false,
      },
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'NONE' })
  })

  it('clears malformed cookies that resolve to NONE', async () => {
    const res = createMockResponse()

    await handleActivationContextResolve(
      {
        method: 'GET',
        headers: { cookie: 'sm_activation_ctx=bad-token' },
      },
      res,
      {
        createClient: vi.fn().mockReturnValue({}),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn(),
        createContext: vi.fn(),
        resolveContext: vi.fn().mockResolvedValue('NONE'),
        shouldUseSecureCookie: () => false,
      },
    )

    expect(res.body).toEqual({ status: 'NONE' })
    expect(String(res.headers['Set-Cookie'])).toContain('Max-Age=0')
  })

  it('returns EXPIRED without leaking order data', async () => {
    const res = createMockResponse()
    const createContext = vi.fn()

    await handleActivationContextResolve(
      {
        method: 'GET',
        headers: { cookie: `sm_activation_ctx=${FIXTURE_TOKEN}` },
      },
      res,
      {
        createClient: vi.fn().mockReturnValue({}),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn(),
        createContext,
        resolveContext: vi.fn().mockResolvedValue('EXPIRED'),
        shouldUseSecureCookie: () => false,
      },
    )

    expect(createContext).not.toHaveBeenCalled()
    expect(res.body).toEqual({ status: 'EXPIRED' })
    expect(res.headers['Set-Cookie']).toBeUndefined()
  })

  it('maps service failures to ERROR', async () => {
    const res = createMockResponse()

    await handleActivationContextResolve(
      {
        method: 'GET',
        headers: { cookie: `sm_activation_ctx=${FIXTURE_TOKEN}` },
      },
      res,
      {
        createClient: vi.fn().mockReturnValue({}),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn(),
        createContext: vi.fn(),
        resolveContext: vi.fn().mockRejectedValue(new ActivationContextError('db')),
        shouldUseSecureCookie: () => false,
      },
    )

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
  })
})

describe('handleActivationContext', () => {
  it('rejects unsupported methods', async () => {
    const res = createMockResponse()

    await handleActivationContext({ method: 'DELETE' }, res)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET, POST')
  })
})

describe('activation context sliding expiry integration', () => {
  it('extends DB expiry and reissues the same cookie token at T0 + 50 minutes', async () => {
    const t0 = new Date('2026-09-06T10:00:00.000Z')
    const t50 = new Date('2026-09-06T10:50:00.000Z')
    const token = FIXTURE_TOKEN
    const tokenHash = hashActivationContextToken(token)
    let row: ActivationContextRow = {
      id: 'ctx-1',
      token_hash: tokenHash,
      amazon_order_id: FIXTURE_ORDER_ID,
      created_at: t0.toISOString(),
      updated_at: t0.toISOString(),
      expires_at: new Date(t0.getTime() + ACTIVATION_CONTEXT_LIFETIME_MS).toISOString(),
      invalidated_at: null,
    }

    const supabaseClient = {
      from(table: 'activation_contexts') {
        expect(table).toBe('activation_contexts')

        return {
          insert(values: Record<string, unknown>) {
            row = {
              id: 'ctx-1',
              token_hash: values.token_hash as string,
              amazon_order_id: values.amazon_order_id as string,
              created_at: values.created_at as string,
              updated_at: values.updated_at as string,
              expires_at: values.expires_at as string,
              invalidated_at: null,
            }

            return {
              select() {
                return {
                  maybeSingle: async () => ({
                    data: { id: row.id, expires_at: row.expires_at },
                    error: null,
                  }),
                }
              },
            }
          },
          select() {
            return {
              eq(_column: string, value: string) {
                return {
                  maybeSingle: async () => ({
                    data: value === tokenHash ? row : null,
                    error: null,
                  }),
                }
              },
            }
          },
          update(values: Record<string, unknown>) {
            return {
              eq: async (_column: string, value: string) => {
                if (value === tokenHash) {
                  row = {
                    ...row,
                    updated_at: values.updated_at as string,
                    expires_at: values.expires_at as string,
                  }
                }

                return { error: null }
              },
            }
          },
        }
      },
    }

    await createActivationContext(FIXTURE_ORDER_ID, {
      supabaseClient,
      now: t0,
      generateToken: () => token,
    })

    const res = createMockResponse()

    await handleActivationContextResolve(
      {
        method: 'GET',
        headers: { cookie: `sm_activation_ctx=${token}` },
      },
      res,
      {
        createClient: vi.fn().mockReturnValue(supabaseClient),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn(),
        createContext: createActivationContext,
        resolveContext: (options) =>
          resolveActivationContext({
            ...options,
            now: t50,
          }),
        shouldUseSecureCookie: () => true,
      },
    )

    expect(res.body).toEqual({ status: 'VALID' })
    expect(row.expires_at).toBe(
      new Date(t50.getTime() + ACTIVATION_CONTEXT_LIFETIME_MS).toISOString(),
    )

    const setCookie = String(res.headers['Set-Cookie'])
    expect(setCookie).toContain(`sm_activation_ctx=${encodeURIComponent(token)}`)
    expect(setCookie).toContain('Max-Age=3600')
  })
})

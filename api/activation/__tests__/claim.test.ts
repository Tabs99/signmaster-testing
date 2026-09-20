import { describe, expect, it, vi } from 'vitest'
import { ActivationClaimRateLimitError } from '../../../server/services/activationClaimRateLimit.ts'
import {
  handleActivationClaim,
  performActivationClaim,
  type VercelLikeResponse,
} from '../claim.ts'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const FIXTURE_TOKEN = 'fixture-opaque-token-123456789012345678901234567890'
const CURRENT_USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'

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

function createDeps(overrides: Partial<Parameters<typeof handleActivationClaim>[2]> = {}) {
  return {
    createClient: vi.fn().mockReturnValue({}),
    getTargetAsin: () => 'B0TEST12345',
    getAuthenticatedUser: vi.fn(),
    resolveContextWithOrderId: vi.fn(),
    verifyEligibility: vi.fn(),
    claimEntitlement: vi.fn(),
    fetchEntitlement: vi.fn(),
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: null }),
    getClientIp: () => '203.0.113.10',
    ...overrides,
  }
}

const claimRequestHeaders = {
  cookie: `sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`,
}

describe('handleActivationClaim', () => {
  it('rejects non-POST methods', async () => {
    const res = createMockResponse()

    await handleActivationClaim({ method: 'GET' }, res, createDeps())

    expect(res.statusCode).toBe(405)
  })

  it('returns UNAUTHENTICATED when no session is present', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue(null),
    })

    await handleActivationClaim({ method: 'POST' }, res, deps)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ status: 'UNAUTHENTICATED' })
  })

  it('returns UNAUTHENTICATED when token validation fails without treating it as infrastructure error', async () => {
    const res = createMockResponse()
    const resolveContextWithOrderId = vi.fn()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue(null),
      resolveContextWithOrderId,
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer invalid-token',
          cookie: `sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`,
        },
      },
      res,
      deps,
    )

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ status: 'UNAUTHENTICATED' })
    expect(resolveContextWithOrderId).not.toHaveBeenCalled()
  })

  it('returns ERROR when auth dependency throws without leaking details', async () => {
    const res = createMockResponse()
    const resolveContextWithOrderId = vi.fn()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockRejectedValue(
        new Error('Supabase auth.getUser outage: secret-token-abc123'),
      ),
      resolveContextWithOrderId,
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token-abc123',
          cookie: `sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`,
        },
      },
      res,
      deps,
    )

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
    expect(JSON.stringify(res.body)).not.toContain('Supabase')
    expect(JSON.stringify(res.body)).not.toContain('secret-token-abc123')
    expect(JSON.stringify(res.body)).not.toContain('auth.getUser')
    expect(resolveContextWithOrderId).not.toHaveBeenCalled()
  })

  it('returns EMAIL_NOT_CONFIRMED for unconfirmed users', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: false,
      }),
    })

    await handleActivationClaim({ method: 'POST' }, res, deps)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'EMAIL_NOT_CONFIRMED' })
  })

  it('returns NO_CONTEXT when cookie is missing', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
    })

    await handleActivationClaim({ method: 'POST' }, res, deps)

    expect(res.body).toEqual({ status: 'NO_CONTEXT' })
  })

  it('returns CONTEXT_EXPIRED for expired activation context', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({ status: 'EXPIRED' }),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: {
          cookie: `sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`,
        },
      },
      res,
      deps,
    )

    expect(res.body).toEqual({ status: 'CONTEXT_EXPIRED' })
  })

  it('returns SUCCESS for valid context and fresh ELIGIBLE claim without clearing context', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue(null),
      verifyEligibility: vi.fn().mockResolvedValue({ status: 'ELIGIBLE' }),
      claimEntitlement: vi.fn().mockResolvedValue('SUCCESS'),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: claimRequestHeaders,
      },
      res,
      deps,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'SUCCESS' })
    expect(res.headers['Set-Cookie']).toBeUndefined()
  })

  it('returns SUCCESS for same-user existing entitlement without clearing context', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: CURRENT_USER_ID,
        status: 'active',
      }),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: claimRequestHeaders,
      },
      res,
      deps,
    )

    expect(res.body).toEqual({ status: 'SUCCESS' })
    expect(deps.claimEntitlement).not.toHaveBeenCalled()
    expect(res.headers['Set-Cookie']).toBeUndefined()
  })

  it('retries SUCCESS with the same context after a lost response', async () => {
    const claimEntitlement = vi.fn().mockResolvedValue('SUCCESS')
    const fetchEntitlement = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: CURRENT_USER_ID,
        status: 'active',
      })
    const resolveContextWithOrderId = vi.fn().mockResolvedValue({
      status: 'VALID',
      amazonOrderId: FIXTURE_ORDER_ID,
    })
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId,
      fetchEntitlement,
      verifyEligibility: vi.fn().mockResolvedValue({ status: 'ELIGIBLE' }),
      claimEntitlement,
    })

    const firstResponse = createMockResponse()
    await handleActivationClaim(
      { method: 'POST', headers: claimRequestHeaders },
      firstResponse,
      deps,
    )

    const secondResponse = createMockResponse()
    await handleActivationClaim(
      { method: 'POST', headers: claimRequestHeaders },
      secondResponse,
      deps,
    )

    expect(firstResponse.body).toEqual({ status: 'SUCCESS' })
    expect(secondResponse.body).toEqual({ status: 'SUCCESS' })
    expect(resolveContextWithOrderId).toHaveBeenCalledTimes(2)
    expect(claimEntitlement).toHaveBeenCalledTimes(1)
    expect(fetchEntitlement).toHaveBeenCalledTimes(2)
    expect(firstResponse.headers['Set-Cookie']).toBeUndefined()
    expect(secondResponse.headers['Set-Cookie']).toBeUndefined()
  })

  it('returns ALREADY_CLAIMED for other-user entitlement', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: OTHER_USER_ID,
        status: 'active',
      }),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: {
          cookie: `sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`,
        },
      },
      res,
      deps,
    )

    expect(res.body).toEqual({ status: 'ALREADY_CLAIMED' })
    expect(JSON.stringify(res.body)).not.toContain(OTHER_USER_ID)
  })

  it('returns NOT_ELIGIBLE for same-user revoked entitlement without modifying the row', async () => {
    const res = createMockResponse()
    const claimEntitlement = vi.fn()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: CURRENT_USER_ID,
        status: 'revoked',
      }),
      claimEntitlement,
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: claimRequestHeaders,
      },
      res,
      deps,
    )

    expect(res.body).toEqual({ status: 'NOT_ELIGIBLE' })
    expect(claimEntitlement).not.toHaveBeenCalled()
    expect(JSON.stringify(res.body)).not.toContain('revoked')
    expect(JSON.stringify(res.body)).not.toContain(CURRENT_USER_ID)
  })

  it('returns ALREADY_CLAIMED for other-user revoked entitlement', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: OTHER_USER_ID,
        status: 'revoked',
      }),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: claimRequestHeaders,
      },
      res,
      deps,
    )

    expect(res.body).toEqual({ status: 'ALREADY_CLAIMED' })
    expect(JSON.stringify(res.body)).not.toContain(OTHER_USER_ID)
    expect(JSON.stringify(res.body)).not.toContain('revoked')
  })

  it('returns NOT_ELIGIBLE when order changed to CANCELLED', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue(null),
      verifyEligibility: vi.fn().mockResolvedValue({ status: 'CANCELLED' }),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: {
          cookie: `sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`,
        },
      },
      res,
      deps,
    )

    expect(res.body).toEqual({ status: 'NOT_ELIGIBLE' })
  })

  it('returns NOT_ELIGIBLE when order changed to RETURNED', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue(null),
      verifyEligibility: vi.fn().mockResolvedValue({ status: 'RETURNED' }),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: {
          cookie: `sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`,
        },
      },
      res,
      deps,
    )

    expect(res.body).toEqual({ status: 'NOT_ELIGIBLE' })
  })

  it('returns ERROR on unexpected verification failure', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue(null),
      verifyEligibility: vi.fn().mockRejectedValue(new Error('verify failed')),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: {
          cookie: `sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`,
        },
      },
      res,
      deps,
    )

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
  })

  it('returns ERROR on unexpected claim failure', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue(null),
      verifyEligibility: vi.fn().mockResolvedValue({ status: 'ELIGIBLE' }),
      claimEntitlement: vi.fn().mockRejectedValue(new Error('claim failed')),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: {
          cookie: `sm_activation_ctx=${encodeURIComponent(FIXTURE_TOKEN)}`,
        },
      },
      res,
      deps,
    )

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
  })

  it('rejects unexpected request body content and does not use it for claim authority', async () => {
    const res = createMockResponse()
    const resolveContextWithOrderId = vi.fn().mockResolvedValue({
      status: 'VALID',
      amazonOrderId: FIXTURE_ORDER_ID,
    })
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId,
      fetchEntitlement: vi.fn().mockResolvedValue(null),
      verifyEligibility: vi.fn().mockResolvedValue({ status: 'ELIGIBLE' }),
      claimEntitlement: vi.fn().mockResolvedValue('SUCCESS'),
    })

    await handleActivationClaim(
      {
        method: 'POST',
        body: {
          orderId: '999-9999999-9999999',
          userId: OTHER_USER_ID,
        },
        headers: claimRequestHeaders,
      },
      res,
      deps,
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'INVALID_REQUEST' })
    expect(resolveContextWithOrderId).not.toHaveBeenCalled()
  })

  it('returns 413 for oversized bodies', async () => {
    const res = createMockResponse()
    const deps = createDeps()

    await handleActivationClaim(
      {
        method: 'POST',
        headers: { 'content-length': '5000' },
        body: {},
      },
      res,
      deps,
    )

    expect(res.statusCode).toBe(413)
    expect(res.body).toEqual({ error: 'REQUEST_TOO_LARGE' })
  })

  it('returns 429 with Retry-After when rate limited', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      checkRateLimit: vi
        .fn()
        .mockResolvedValue({ allowed: false, retryAfterSeconds: 120 }),
    })

    await handleActivationClaim({ method: 'POST', headers: claimRequestHeaders }, res, deps)

    expect(res.statusCode).toBe(429)
    expect(res.body).toEqual({ error: 'RATE_LIMITED' })
    expect(res.headers['Retry-After']).toBe('120')
  })

  it('returns 503 when rate limit infrastructure fails', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      checkRateLimit: vi.fn().mockRejectedValue(
        new ActivationClaimRateLimitError('Activation claim rate limit check failed'),
      ),
    })

    await handleActivationClaim({ method: 'POST', headers: claimRequestHeaders }, res, deps)

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ status: 'ERROR' })
  })

  it('passes hashed rate-limit buckets without raw user id, order id, or IP', async () => {
    const res = createMockResponse()
    const checkRateLimit = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: null })
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: CURRENT_USER_ID,
        emailConfirmed: true,
      }),
      resolveContextWithOrderId: vi.fn().mockResolvedValue({
        status: 'VALID',
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
      fetchEntitlement: vi.fn().mockResolvedValue(null),
      verifyEligibility: vi.fn().mockResolvedValue({ status: 'ELIGIBLE' }),
      claimEntitlement: vi.fn().mockResolvedValue('SUCCESS'),
      checkRateLimit,
      getClientIp: () => '203.0.113.10',
    })

    await handleActivationClaim(
      {
        method: 'POST',
        headers: {
          ...claimRequestHeaders,
          'x-vercel-forwarded-for': '203.0.113.10',
        },
      },
      res,
      deps,
    )

    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        ipBucketKey: expect.stringMatching(/^claim-ip:[a-f0-9]{64}$/),
        userBucketKey: expect.stringMatching(/^claim-uid:[a-f0-9]{64}$/),
        contextBucketKey: expect.stringMatching(/^claim-ctx:[a-f0-9]{64}$/),
      }),
    )
    const payload = JSON.stringify(checkRateLimit.mock.calls[0]?.[0])
    expect(payload).not.toContain(CURRENT_USER_ID)
    expect(payload).not.toContain(FIXTURE_ORDER_ID)
    expect(payload).not.toContain('203.0.113.10')
    expect(res.body).toEqual({ status: 'SUCCESS' })
    expect(JSON.stringify(res.body)).not.toContain(FIXTURE_ORDER_ID)
  })
})

describe('performActivationClaim', () => {
  it('checks ownership before treating ALREADY_CLAIMED as conflict', async () => {
    const deps = createDeps({
      fetchEntitlement: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'entitlement-1',
          amazon_order_id: FIXTURE_ORDER_ID,
          user_id: CURRENT_USER_ID,
          status: 'active',
        }),
      verifyEligibility: vi.fn().mockResolvedValue({ status: 'ALREADY_CLAIMED' }),
    })

    await expect(
      performActivationClaim({
        authenticatedUser: { id: CURRENT_USER_ID, emailConfirmed: true },
        amazonOrderId: FIXTURE_ORDER_ID,
        deps,
        supabaseClient: {},
      }),
    ).resolves.toBe('SUCCESS')
  })

  it('returns NOT_ELIGIBLE when race re-read shows same user with revoked status', async () => {
    const deps = createDeps({
      fetchEntitlement: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'entitlement-1',
          amazon_order_id: FIXTURE_ORDER_ID,
          user_id: CURRENT_USER_ID,
          status: 'revoked',
        }),
      verifyEligibility: vi.fn().mockResolvedValue({ status: 'ALREADY_CLAIMED' }),
    })

    await expect(
      performActivationClaim({
        authenticatedUser: { id: CURRENT_USER_ID, emailConfirmed: true },
        amazonOrderId: FIXTURE_ORDER_ID,
        deps,
        supabaseClient: {},
      }),
    ).resolves.toBe('NOT_ELIGIBLE')
  })
})

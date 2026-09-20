import { describe, expect, it, vi } from 'vitest'
import {
  ActivationVerificationError,
  type ActivationVerificationResult,
} from '../../../server/services/activationVerification.ts'
import { ActivationVerifyRateLimitError } from '../../../server/services/activationVerifyRateLimit.ts'
import {
  handleActivationVerify,
  parseActivationVerifyRequestBody,
  type VercelLikeResponse,
} from '../verify.ts'

const FIXTURE_ORDER_ID = '123-1234567-1234567'

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

function createPassingRateLimitDeps(overrides: Partial<Parameters<typeof handleActivationVerify>[2]> = {}) {
  return {
    createClient: vi.fn().mockReturnValue({ from: vi.fn() }),
    getTargetAsin: () => 'B0TEST12345',
    verifyEligibility: vi.fn(),
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: null }),
    getClientIp: () => '203.0.113.10',
    ...overrides,
  }
}

describe('parseActivationVerifyRequestBody', () => {
  it('accepts a valid order ID', () => {
    expect(
      parseActivationVerifyRequestBody({ orderId: FIXTURE_ORDER_ID }),
    ).toEqual({
      orderId: FIXTURE_ORDER_ID,
    })
  })

  it('rejects missing or malformed order IDs', () => {
    expect(parseActivationVerifyRequestBody({})).toBeNull()
    expect(parseActivationVerifyRequestBody({ orderId: '' })).toBeNull()
    expect(parseActivationVerifyRequestBody({ orderId: 'bad-id' })).toBeNull()
    expect(parseActivationVerifyRequestBody({ orderId: 123 })).toBeNull()
    expect(parseActivationVerifyRequestBody([])).toBeNull()
  })

  it('rejects unexpected JSON properties', () => {
    expect(
      parseActivationVerifyRequestBody({
        orderId: FIXTURE_ORDER_ID,
        extra: 'nope',
      }),
    ).toBeNull()
  })
})

describe('handleActivationVerify', () => {
  it('returns the expected business status for a valid POST request', async () => {
    const res = createMockResponse()
    const verifyEligibility = vi
      .fn()
      .mockResolvedValue({ status: 'ELIGIBLE' } satisfies ActivationVerificationResult)

    const mockClient = { from: vi.fn() }

    await handleActivationVerify(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
        headers: { 'content-length': '40' },
      },
      res,
      {
        ...createPassingRateLimitDeps(),
        createClient: vi.fn().mockReturnValue(mockClient),
        verifyEligibility,
      },
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'ELIGIBLE' })
    expect(verifyEligibility).toHaveBeenCalledWith(FIXTURE_ORDER_ID, {
      supabaseClient: mockClient,
      targetAsin: 'B0TEST12345',
    })
  })

  it('returns 400 when orderId is missing', async () => {
    const res = createMockResponse()

    await handleActivationVerify({ method: 'POST', body: {}, headers: {} }, res, {
      ...createPassingRateLimitDeps(),
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'INVALID_ORDER_ID' })
  })

  it('returns 400 when orderId is malformed', async () => {
    const res = createMockResponse()

    await handleActivationVerify(
      { method: 'POST', body: { orderId: 'bad-id' }, headers: {} },
      res,
      {
        ...createPassingRateLimitDeps(),
      },
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'INVALID_ORDER_ID' })
  })

  it('returns 413 for oversized bodies', async () => {
    const res = createMockResponse()

    await handleActivationVerify(
      {
        method: 'POST',
        headers: { 'content-length': '5000' },
        body: { orderId: FIXTURE_ORDER_ID },
      },
      res,
      {
        ...createPassingRateLimitDeps(),
      },
    )

    expect(res.statusCode).toBe(413)
    expect(res.body).toEqual({ error: 'REQUEST_TOO_LARGE' })
  })

  it('returns 429 when rate limited', async () => {
    const res = createMockResponse()

    await handleActivationVerify(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
        headers: {},
      },
      res,
      {
        ...createPassingRateLimitDeps({
          checkRateLimit: vi
            .fn()
            .mockResolvedValue({ allowed: false, retryAfterSeconds: 90 }),
        }),
      },
    )

    expect(res.statusCode).toBe(429)
    expect(res.body).toEqual({ error: 'RATE_LIMITED' })
    expect(res.headers['Retry-After']).toBe('90')
  })

  it('passes hashed bucket keys to the rate limiter without raw order IDs in keys', async () => {
    const res = createMockResponse()
    const checkRateLimit = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: null })

    await handleActivationVerify(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
        headers: { 'x-forwarded-for': '203.0.113.10' },
      },
      res,
      {
        ...createPassingRateLimitDeps({ checkRateLimit }),
        verifyEligibility: vi.fn().mockResolvedValue({ status: 'NOT_FOUND' }),
      },
    )

    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        ipBucketKey: expect.stringMatching(/^ip:[a-f0-9]{64}$/),
        orderBucketKey: expect.stringMatching(/^oid:[a-f0-9]{64}$/),
      }),
    )
    expect(JSON.stringify(checkRateLimit.mock.calls[0]?.[0])).not.toContain(FIXTURE_ORDER_ID)
    expect(JSON.stringify(checkRateLimit.mock.calls[0]?.[0])).not.toContain('203.0.113.10')
  })

  it('returns 503 when rate limit infrastructure fails', async () => {
    const res = createMockResponse()

    await handleActivationVerify(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
        headers: {},
      },
      res,
      {
        ...createPassingRateLimitDeps({
          checkRateLimit: vi.fn().mockRejectedValue(
            new ActivationVerifyRateLimitError('Activation verify rate limit check failed'),
          ),
        }),
      },
    )

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ status: 'ERROR' })
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createMockResponse()

    await handleActivationVerify({ method: 'GET' }, res, {
      ...createPassingRateLimitDeps(),
    })

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
    expect(res.body).toEqual({ error: 'METHOD_NOT_ALLOWED' })
  })

  it('returns 500 ERROR when the verification service fails unexpectedly', async () => {
    const res = createMockResponse()

    await handleActivationVerify(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
        headers: {},
      },
      res,
      {
        ...createPassingRateLimitDeps({
          verifyEligibility: vi.fn().mockRejectedValue(
            new ActivationVerificationError(
              'Failed to look up order for activation verification [42501]: permission denied',
              '42501',
            ),
          ),
        }),
      },
    )

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
  })

  it('does not expose raw database errors in the HTTP response', async () => {
    const res = createMockResponse()

    await handleActivationVerify(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
        headers: {},
      },
      res,
      {
        ...createPassingRateLimitDeps({
          verifyEligibility: vi.fn().mockRejectedValue(
            new ActivationVerificationError(
              'Failed to look up entitlement for activation verification [42501]: permission denied',
              '42501',
            ),
          ),
        }),
      },
    )

    expect(res.body).toEqual({ status: 'ERROR' })
    expect(JSON.stringify(res.body)).not.toContain('permission denied')
    expect(JSON.stringify(res.body)).not.toContain('42501')
  })

  it('still returns business statuses unchanged when allowed', async () => {
    const res = createMockResponse()

    await handleActivationVerify(
      {
        method: 'POST',
        body: { orderId: FIXTURE_ORDER_ID },
        headers: {},
      },
      res,
      {
        ...createPassingRateLimitDeps({
          verifyEligibility: vi.fn().mockResolvedValue({ status: 'ALREADY_CLAIMED' }),
        }),
      },
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'ALREADY_CLAIMED' })
  })
})

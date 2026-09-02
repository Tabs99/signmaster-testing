import { describe, expect, it, vi } from 'vitest'
import {
  ActivationVerificationError,
  type ActivationVerificationResult,
} from '../../../server/services/activationVerification.ts'
import {
  handleActivationVerify,
  parseActivationVerifyRequestBody,
  type VercelLikeResponse,
} from '../verify.ts'

const FIXTURE_ORDER_ID = '123-1234567-1234567'

function createMockResponse(): VercelLikeResponse & {
  statusCode: number | null
  body: unknown
  headers: Record<string, string>
} {
  const response = {
    statusCode: null as number | null,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
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
      },
      res,
      {
        createClient: vi.fn().mockReturnValue(mockClient),
        getTargetAsin: () => 'B0TEST12345',
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

    await handleActivationVerify({ method: 'POST', body: {} }, res, {
      createClient: vi.fn(),
      getTargetAsin: () => 'B0TEST12345',
      verifyEligibility: vi.fn(),
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'INVALID_ORDER_ID' })
  })

  it('returns 400 when orderId is malformed', async () => {
    const res = createMockResponse()

    await handleActivationVerify(
      { method: 'POST', body: { orderId: 'bad-id' } },
      res,
      {
        createClient: vi.fn(),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn(),
      },
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'INVALID_ORDER_ID' })
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createMockResponse()

    await handleActivationVerify({ method: 'GET' }, res, {
      createClient: vi.fn(),
      getTargetAsin: () => 'B0TEST12345',
      verifyEligibility: vi.fn(),
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
      },
      res,
      {
        createClient: vi.fn(),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn().mockRejectedValue(
          new ActivationVerificationError(
            'Failed to look up order for activation verification [42501]: permission denied',
            '42501',
          ),
        ),
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
      },
      res,
      {
        createClient: vi.fn(),
        getTargetAsin: () => 'B0TEST12345',
        verifyEligibility: vi.fn().mockRejectedValue(
          new ActivationVerificationError(
            'Failed to look up entitlement for activation verification [42501]: permission denied',
            '42501',
          ),
        ),
      },
    )

    expect(res.body).toEqual({ status: 'ERROR' })
    expect(JSON.stringify(res.body)).not.toContain('permission denied')
    expect(JSON.stringify(res.body)).not.toContain('42501')
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  handleActivationContinuationCreate,
  type ActivationContinuationCreateHandlerDeps,
  type VercelLikeResponse,
} from '../continuation.ts'

const CONTEXT_COOKIE_NAME = 'sm_activation_ctx'
const FIXTURE_TOKEN = 'fixture-opaque-token-123456789012345678901234567890'
const REFERENCE = 'cross-device-reference-abcdefghijklmnopqrstuvwxyz012345'

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
  overrides: Partial<ActivationContinuationCreateHandlerDeps> = {},
): ActivationContinuationCreateHandlerDeps {
  return {
    createClient: vi.fn().mockReturnValue({}),
    createContinuation: vi.fn(),
    ...overrides,
  }
}

const cookieHeaders = {
  cookie: `${CONTEXT_COOKIE_NAME}=${encodeURIComponent(FIXTURE_TOKEN)}`,
}

describe('handleActivationContinuationCreate', () => {
  it('rejects non-POST methods', async () => {
    const res = createMockResponse()
    await handleActivationContinuationCreate({ method: 'GET' }, res, createDeps())
    expect(res.statusCode).toBe(405)
    expect(res.headers['Allow']).toBe('POST')
  })

  it('rejects a request without an email', async () => {
    const res = createMockResponse()
    const createContinuation = vi.fn()
    await handleActivationContinuationCreate(
      { method: 'POST', headers: cookieHeaders, body: {} },
      res,
      createDeps({ createContinuation }),
    )
    expect(res.statusCode).toBe(400)
    expect(createContinuation).not.toHaveBeenCalled()
  })

  it('returns NO_CONTEXT when no activation cookie is present', async () => {
    const res = createMockResponse()
    const createContinuation = vi.fn()
    await handleActivationContinuationCreate(
      { method: 'POST', headers: {}, body: { email: 'owner@example.invalid' } },
      res,
      createDeps({ createContinuation }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'NO_CONTEXT' })
    expect(createContinuation).not.toHaveBeenCalled()
  })

  it('returns the opaque reference on success', async () => {
    const res = createMockResponse()
    const createContinuation = vi
      .fn()
      .mockResolvedValue({ status: 'CREATED', reference: REFERENCE })
    await handleActivationContinuationCreate(
      { method: 'POST', headers: cookieHeaders, body: { email: 'owner@example.invalid' } },
      res,
      createDeps({ createContinuation }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'CREATED', reference: REFERENCE })
    expect(createContinuation).toHaveBeenCalledWith(
      expect.objectContaining({ contextToken: FIXTURE_TOKEN, email: 'owner@example.invalid' }),
    )
  })

  it('returns NO_CONTEXT when the service finds no valid context', async () => {
    const res = createMockResponse()
    await handleActivationContinuationCreate(
      { method: 'POST', headers: cookieHeaders, body: { email: 'owner@example.invalid' } },
      res,
      createDeps({ createContinuation: vi.fn().mockResolvedValue({ status: 'NO_CONTEXT' }) }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'NO_CONTEXT' })
  })

  it('returns ERROR without leaking the context token when minting throws', async () => {
    const res = createMockResponse()
    await handleActivationContinuationCreate(
      { method: 'POST', headers: cookieHeaders, body: { email: 'owner@example.invalid' } },
      res,
      createDeps({
        createContinuation: vi.fn().mockRejectedValue(new Error(`boom ${FIXTURE_TOKEN}`)),
      }),
    )
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
    expect(JSON.stringify(res.body)).not.toContain(FIXTURE_TOKEN)
  })
})

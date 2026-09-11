import { describe, expect, it, vi } from 'vitest'
import { handleEntitlementMe, type VercelLikeResponse } from '../me.ts'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '205-1234567-1234567'

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
  overrides: Partial<Parameters<typeof handleEntitlementMe>[2]> = {},
) {
  return {
    createClient: vi.fn().mockReturnValue({}),
    getAuthenticatedUser: vi.fn(),
    checkEntitlement: vi.fn(),
    ...overrides,
  }
}

describe('handleEntitlementMe', () => {
  it('rejects non-GET methods', async () => {
    const res = createMockResponse()

    await handleEntitlementMe({ method: 'POST' }, res, createDeps())

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET')
  })

  it('returns UNAUTHENTICATED when there is no valid session', async () => {
    const res = createMockResponse()
    const checkEntitlement = vi.fn()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue(null),
      checkEntitlement,
    })

    await handleEntitlementMe({ method: 'GET' }, res, deps)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ status: 'UNAUTHENTICATED' })
    expect(checkEntitlement).not.toHaveBeenCalled()
  })

  it('returns ACTIVE using the server-derived user id (never the browser body)', async () => {
    const res = createMockResponse()
    const checkEntitlement = vi.fn().mockResolvedValue('ACTIVE')
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: USER_ID,
        email: 'a@example.invalid',
        emailConfirmed: true,
      }),
      checkEntitlement,
    })

    await handleEntitlementMe(
      {
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
        body: { userId: 'attacker-supplied-id' },
      },
      res,
      deps,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'ACTIVE' })
    expect(checkEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    )
  })

  it('returns NONE when the user has no active entitlement', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: USER_ID,
        email: 'a@example.invalid',
        emailConfirmed: true,
      }),
      checkEntitlement: vi.fn().mockResolvedValue('NONE'),
    })

    await handleEntitlementMe(
      { method: 'GET', headers: { authorization: 'Bearer valid-token' } },
      res,
      deps,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'NONE' })
  })

  it('fails closed with ERROR when the entitlement lookup throws, leaking no detail', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: USER_ID,
        email: 'a@example.invalid',
        emailConfirmed: true,
      }),
      checkEntitlement: vi
        .fn()
        .mockRejectedValue(new Error(`db down for order ${ORDER_ID} secret`)),
    })

    await handleEntitlementMe(
      { method: 'GET', headers: { authorization: 'Bearer valid-token' } },
      res,
      deps,
    )

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
    expect(JSON.stringify(res.body)).not.toContain(ORDER_ID)
    expect(JSON.stringify(res.body)).not.toContain('db down')
  })

  it('fails closed with ERROR when auth verification throws, never granting access', async () => {
    const res = createMockResponse()
    const checkEntitlement = vi.fn()
    const deps = createDeps({
      getAuthenticatedUser: vi
        .fn()
        .mockRejectedValue(new Error('Supabase auth.getUser outage: token-xyz')),
      checkEntitlement,
    })

    await handleEntitlementMe(
      { method: 'GET', headers: { authorization: 'Bearer token-xyz' } },
      res,
      deps,
    )

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
    expect(checkEntitlement).not.toHaveBeenCalled()
    expect(JSON.stringify(res.body)).not.toContain('token-xyz')
    expect(JSON.stringify(res.body)).not.toContain('Supabase')
  })

  it('never exposes entitlement/user identifiers in any successful response', async () => {
    const res = createMockResponse()
    const deps = createDeps({
      getAuthenticatedUser: vi.fn().mockResolvedValue({
        id: USER_ID,
        email: 'a@example.invalid',
        emailConfirmed: true,
      }),
      checkEntitlement: vi.fn().mockResolvedValue('ACTIVE'),
    })

    await handleEntitlementMe(
      { method: 'GET', headers: { authorization: 'Bearer valid-token' } },
      res,
      deps,
    )

    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain(USER_ID)
    expect(serialized).not.toContain('a@example.invalid')
  })
})

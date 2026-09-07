import { describe, expect, it, vi } from 'vitest'
import {
  createActivationContinuation,
  consumeActivationContinuation,
  type ActivationContinuationRow,
} from '../activationContinuationService.ts'
import {
  hashActivationContinuationReference,
} from '../../activation/continuationReference.ts'

const ORDER_ID = '205-1234567-1234567'
const EMAIL = 'Owner@Example.Invalid'
const NORMALISED_EMAIL = 'owner@example.invalid'
const REFERENCE = 'cross-device-reference-abcdefghijklmnopqrstuvwxyz012345'
const NOW = new Date('2026-09-07T10:00:00.000Z')

function makeRow(overrides: Partial<ActivationContinuationRow> = {}): ActivationContinuationRow {
  return {
    id: 'continuation-1',
    token_hash: hashActivationContinuationReference(REFERENCE),
    amazon_order_id: ORDER_ID,
    email: NORMALISED_EMAIL,
    created_at: '2026-09-07T09:50:00.000Z',
    expires_at: '2026-09-07T10:20:00.000Z',
    consumed_at: null,
    ...overrides,
  }
}

/**
 * Minimal fake of the Supabase query surface the service uses. Records inserts
 * and supports select().eq().maybeSingle() and update().eq().is().select().
 */
function makeClient(options: {
  row?: ActivationContinuationRow | null
  consumeAffects?: number
} = {}) {
  const inserted: Record<string, unknown>[] = []
  const contexts: string[] = []
  let consumeAffected = options.consumeAffects ?? 1

  const client = {
    inserted,
    contexts,
    from(table: string) {
      if (table === 'activation_continuations') {
        return {
          insert(values: Record<string, unknown>) {
            inserted.push(values)
            return Promise.resolve({ error: null })
          },
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({ data: options.row ?? null, error: null })
                  },
                }
              },
            }
          },
          update() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      select() {
                        const affected =
                          consumeAffected > 0 ? [{ id: 'continuation-1' }] : []
                        consumeAffected = 0
                        return Promise.resolve({ data: affected, error: null })
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  }

  return client
}

describe('createActivationContinuation', () => {
  it('mints an opaque reference bound to the order and normalised email', async () => {
    const client = makeClient()
    const resolveContextWithOrderId = vi
      .fn()
      .mockResolvedValue({ status: 'VALID', amazonOrderId: ORDER_ID })

    const result = await createActivationContinuation({
      supabaseClient: client as never,
      contextToken: 'ctx-token',
      email: EMAIL,
      now: NOW,
      deps: { resolveContextWithOrderId, generateReference: () => REFERENCE },
    })

    expect(result).toEqual({ status: 'CREATED', reference: REFERENCE })
    expect(resolveContextWithOrderId).toHaveBeenCalledWith(
      expect.objectContaining({ touchOnValid: false }),
    )
    const row = client.inserted[0]
    expect(row.amazon_order_id).toBe(ORDER_ID)
    expect(row.email).toBe(NORMALISED_EMAIL)
    expect(row.token_hash).toBe(hashActivationContinuationReference(REFERENCE))
    // The raw reference must never be persisted.
    expect(row.token_hash).not.toBe(REFERENCE)
    expect(JSON.stringify(row)).not.toContain(REFERENCE)
  })

  it('returns NO_CONTEXT when there is no valid context to hand off', async () => {
    const client = makeClient()
    const result = await createActivationContinuation({
      supabaseClient: client as never,
      contextToken: 'ctx-token',
      email: EMAIL,
      now: NOW,
      deps: {
        resolveContextWithOrderId: vi.fn().mockResolvedValue({ status: 'NONE' }),
        generateReference: () => REFERENCE,
      },
    })

    expect(result).toEqual({ status: 'NO_CONTEXT' })
    expect(client.inserted).toHaveLength(0)
  })
})

describe('consumeActivationContinuation', () => {
  function consume(client: unknown, overrides: Partial<Parameters<typeof consumeActivationContinuation>[0]> = {}) {
    const createContext = vi
      .fn()
      .mockResolvedValue({ token: 'fresh-context-token', expiresAt: NOW })
    return {
      createContext,
      promise: consumeActivationContinuation({
        supabaseClient: client as never,
        reference: REFERENCE,
        email: EMAIL,
        now: NOW,
        deps: { createContext },
        ...overrides,
      }),
    }
  }

  it('consumes a valid reference and mints a fresh context for the same order', async () => {
    const client = makeClient({ row: makeRow() })
    const { createContext, promise } = consume(client)

    await expect(promise).resolves.toEqual({
      status: 'CONTINUED',
      contextToken: 'fresh-context-token',
    })
    expect(createContext).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ supabaseClient: client }),
    )
  })

  it('rejects an unknown reference safely as INVALID', async () => {
    const client = makeClient({ row: null })
    const { createContext, promise } = consume(client)

    await expect(promise).resolves.toEqual({ status: 'INVALID' })
    expect(createContext).not.toHaveBeenCalled()
  })

  it('rejects a badly formatted reference as INVALID without a lookup', async () => {
    const client = makeClient({ row: makeRow() })
    const createContext = vi.fn()
    await expect(
      consumeActivationContinuation({
        supabaseClient: client as never,
        reference: 'short',
        email: EMAIL,
        now: NOW,
        deps: { createContext },
      }),
    ).resolves.toEqual({ status: 'INVALID' })
    expect(createContext).not.toHaveBeenCalled()
  })

  it('does not let a different authenticated user consume the reference', async () => {
    const client = makeClient({ row: makeRow() })
    const { createContext, promise } = consume(client, {
      email: 'someone-else@example.invalid',
    })

    await expect(promise).resolves.toEqual({ status: 'INVALID' })
    expect(createContext).not.toHaveBeenCalled()
  })

  it('rejects an already-consumed reference (replay)', async () => {
    const client = makeClient({ row: makeRow({ consumed_at: '2026-09-07T09:59:00.000Z' }) })
    const { createContext, promise } = consume(client)

    await expect(promise).resolves.toEqual({ status: 'ALREADY_CONSUMED' })
    expect(createContext).not.toHaveBeenCalled()
  })

  it('rejects an expired reference', async () => {
    const client = makeClient({
      row: makeRow({ expires_at: '2026-09-07T09:00:00.000Z' }),
    })
    const { createContext, promise } = consume(client)

    await expect(promise).resolves.toEqual({ status: 'EXPIRED' })
    expect(createContext).not.toHaveBeenCalled()
  })

  it('treats a lost single-use race as ALREADY_CONSUMED', async () => {
    const client = makeClient({ row: makeRow(), consumeAffects: 0 })
    const { createContext, promise } = consume(client)

    await expect(promise).resolves.toEqual({ status: 'ALREADY_CONSUMED' })
    expect(createContext).not.toHaveBeenCalled()
  })
})

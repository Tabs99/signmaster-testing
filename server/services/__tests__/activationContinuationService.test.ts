import { describe, expect, it, vi } from 'vitest'
import {
  createActivationContinuation,
  consumeActivationContinuation,
  CONSUME_ACTIVATION_CONTINUATION_FN,
  type ActivationContinuationRow,
} from '../activationContinuationService.ts'
import { hashActivationContinuationReference } from '../../activation/continuationReference.ts'
import { hashActivationContextToken } from '../../activation/contextToken.ts'

const ORDER_ID = '205-1234567-1234567'
const EMAIL = 'Owner@Example.Invalid'
const NORMALISED_EMAIL = 'owner@example.invalid'
const REFERENCE = 'cross-device-reference-abcdefghijklmnopqrstuvwxyz012345'
const NOW = new Date('2026-09-10T10:00:00.000Z')

function makeRow(overrides: Partial<ActivationContinuationRow> = {}): ActivationContinuationRow {
  return {
    id: 'continuation-1',
    token_hash: hashActivationContinuationReference(REFERENCE),
    amazon_order_id: ORDER_ID,
    email: NORMALISED_EMAIL,
    created_at: '2026-09-10T09:50:00.000Z',
    expires_at: '2026-09-10T10:20:00.000Z',
    consumed_at: null,
    ...overrides,
  }
}

// --- Create ---------------------------------------------------------------

function makeCreateClient() {
  const inserted: Record<string, unknown>[] = []
  return {
    inserted,
    from() {
      return {
        insert(values: Record<string, unknown>) {
          inserted.push(values)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

describe('createActivationContinuation', () => {
  it('mints an opaque reference bound to the order and normalised email', async () => {
    const client = makeCreateClient()
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
    const client = makeCreateClient()
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

// --- Consume (atomic RPC) -------------------------------------------------

interface FakeContextRow {
  token_hash: string
  amazon_order_id: string
  expires_at: string
}

/**
 * Stateful fake of the `consume_activation_continuation` Postgres function that
 * mirrors its transactional contract:
 *  - row lock + conditional consume (single-use, concurrency-safe)
 *  - all-or-nothing: on a context-insert failure nothing is consumed/created
 * Because the fake mutates state synchronously inside `rpc`, two overlapping
 * consumes serialise exactly as `SELECT ... FOR UPDATE` would in Postgres.
 */
function makeRpcDb(initialRow: ActivationContinuationRow | null) {
  const state = { row: initialRow ? { ...initialRow } : null }
  const contexts: FakeContextRow[] = []
  let failInsert = false
  let rpcCalls = 0

  return {
    contexts,
    get row() {
      return state.row
    },
    get rpcCalls() {
      return rpcCalls
    },
    failNextInserts(value: boolean) {
      failInsert = value
    },
    rpc(fn: string, args: Record<string, string>) {
      rpcCalls += 1
      expect(fn).toBe(CONSUME_ACTIVATION_CONTINUATION_FN)
      const row = state.row

      if (!row) {
        return Promise.resolve({ data: 'INVALID', error: null })
      }
      if (row.email !== args.p_email) {
        return Promise.resolve({ data: 'INVALID', error: null })
      }
      if (row.consumed_at) {
        return Promise.resolve({ data: 'ALREADY_CONSUMED', error: null })
      }
      if (Date.parse(row.expires_at) <= Date.parse(args.p_now)) {
        return Promise.resolve({ data: 'EXPIRED', error: null })
      }

      // Transaction body: consume + create context, or roll back on failure.
      if (failInsert) {
        return Promise.resolve({
          data: null,
          error: { code: 'XX000', message: 'context insert failed' },
        })
      }

      row.consumed_at = args.p_now
      contexts.push({
        token_hash: args.p_context_token_hash,
        amazon_order_id: row.amazon_order_id,
        expires_at: args.p_context_expires_at,
      })
      return Promise.resolve({ data: 'CONTINUED', error: null })
    },
  }
}

describe('consumeActivationContinuation (atomic)', () => {
  it('rejects a badly formatted reference without touching the database', async () => {
    const db = makeRpcDb(makeRow())
    await expect(
      consumeActivationContinuation({
        supabaseClient: db as never,
        reference: 'short',
        email: EMAIL,
        now: NOW,
      }),
    ).resolves.toEqual({ status: 'INVALID' })
    expect(db.rpcCalls).toBe(0)
    expect(db.contexts).toHaveLength(0)
  })

  it('consumes a valid reference and creates exactly one fresh context for the same order', async () => {
    const db = makeRpcDb(makeRow())

    const result = await consumeActivationContinuation({
      supabaseClient: db as never,
      reference: REFERENCE,
      email: EMAIL,
      now: NOW,
    })

    expect(result.status).toBe('CONTINUED')
    if (result.status !== 'CONTINUED') return

    expect(db.row?.consumed_at).toBe(NOW.toISOString())
    expect(db.contexts).toHaveLength(1)
    expect(db.contexts[0].amazon_order_id).toBe(ORDER_ID)
    // The DB stores only the hash of the returned raw context token.
    expect(db.contexts[0].token_hash).toBe(hashActivationContextToken(result.contextToken))
    expect(db.contexts[0].token_hash).not.toBe(result.contextToken)
  })

  it('rejects an unknown reference safely as INVALID and creates no context', async () => {
    const db = makeRpcDb(null)
    await expect(
      consumeActivationContinuation({
        supabaseClient: db as never,
        reference: REFERENCE,
        email: EMAIL,
        now: NOW,
      }),
    ).resolves.toEqual({ status: 'INVALID' })
    expect(db.contexts).toHaveLength(0)
  })

  it('does not let a different authenticated user consume the reference', async () => {
    const db = makeRpcDb(makeRow())
    await expect(
      consumeActivationContinuation({
        supabaseClient: db as never,
        reference: REFERENCE,
        email: 'someone-else@example.invalid',
        now: NOW,
      }),
    ).resolves.toEqual({ status: 'INVALID' })
    expect(db.row?.consumed_at).toBeNull()
    expect(db.contexts).toHaveLength(0)
  })

  it('rejects an already-consumed reference (replay) with no new context', async () => {
    const db = makeRpcDb(makeRow({ consumed_at: '2026-09-10T09:59:00.000Z' }))
    await expect(
      consumeActivationContinuation({
        supabaseClient: db as never,
        reference: REFERENCE,
        email: EMAIL,
        now: NOW,
      }),
    ).resolves.toEqual({ status: 'ALREADY_CONSUMED' })
    expect(db.contexts).toHaveLength(0)
  })

  it('rejects an expired reference with no consume/context', async () => {
    const db = makeRpcDb(makeRow({ expires_at: '2026-09-10T09:00:00.000Z' }))
    await expect(
      consumeActivationContinuation({
        supabaseClient: db as never,
        reference: REFERENCE,
        email: EMAIL,
        now: NOW,
      }),
    ).resolves.toEqual({ status: 'EXPIRED' })
    expect(db.row?.consumed_at).toBeNull()
    expect(db.contexts).toHaveLength(0)
  })

  it('rolls back on a context-creation failure: reference stays unconsumed and retry succeeds', async () => {
    const db = makeRpcDb(makeRow())
    db.failNextInserts(true)

    await expect(
      consumeActivationContinuation({
        supabaseClient: db as never,
        reference: REFERENCE,
        email: EMAIL,
        now: NOW,
      }),
    ).rejects.toThrow(/Failed to consume activation continuation/)

    // Nothing consumed, no context created — the exchange is still retryable.
    expect(db.row?.consumed_at).toBeNull()
    expect(db.contexts).toHaveLength(0)

    db.failNextInserts(false)
    const retry = await consumeActivationContinuation({
      supabaseClient: db as never,
      reference: REFERENCE,
      email: EMAIL,
      now: NOW,
    })

    expect(retry.status).toBe('CONTINUED')
    expect(db.row?.consumed_at).toBe(NOW.toISOString())
    expect(db.contexts).toHaveLength(1)
  })

  it('serialises concurrent consumes: exactly one CONTINUED, one ALREADY_CONSUMED, one context', async () => {
    const db = makeRpcDb(makeRow())

    const [a, b] = await Promise.all([
      consumeActivationContinuation({
        supabaseClient: db as never,
        reference: REFERENCE,
        email: EMAIL,
        now: NOW,
      }),
      consumeActivationContinuation({
        supabaseClient: db as never,
        reference: REFERENCE,
        email: EMAIL,
        now: NOW,
      }),
    ])

    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual(['ALREADY_CONSUMED', 'CONTINUED'])
    expect(db.contexts).toHaveLength(1)
    expect(db.contexts[0].amazon_order_id).toBe(ORDER_ID)
  })
})

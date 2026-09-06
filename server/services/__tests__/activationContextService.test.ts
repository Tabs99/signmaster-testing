import { describe, expect, it, vi } from 'vitest'
import { hashActivationContextToken } from '../../activation/contextToken.ts'
import {
  ACTIVATION_CONTEXT_LIFETIME_MS,
  ActivationContextError,
  createActivationContext,
  resolveActivationContext,
  type ActivationContextClient,
  type ActivationContextRow,
} from '../activationContextService.ts'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const FIXTURE_TOKEN = 'fixture-opaque-token-123456789012345678901234567890'
const FIXTURE_HASH = hashActivationContextToken(FIXTURE_TOKEN)

function createRow(overrides: Partial<ActivationContextRow> = {}): ActivationContextRow {
  const now = new Date('2026-09-06T12:00:00.000Z')

  return {
    id: 'ctx-1',
    token_hash: FIXTURE_HASH,
    amazon_order_id: FIXTURE_ORDER_ID,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ACTIVATION_CONTEXT_LIFETIME_MS).toISOString(),
    invalidated_at: null,
    ...overrides,
  }
}

function createMockClient(handlers: {
  insert?: () => Promise<{ data: { id: string; expires_at: string } | null; error: null | { code?: string } }>
  select?: () => Promise<{ data: ActivationContextRow | null; error: null | { code?: string } }>
  update?: () => Promise<{ error: null | { code?: string } }>
}): ActivationContextClient {
  return {
    from(table: 'activation_contexts') {
      expect(table).toBe('activation_contexts')

      return {
        insert(values: Record<string, unknown>) {
          expect(values.token_hash).toBe(FIXTURE_HASH)
          expect(values.amazon_order_id).toBe(FIXTURE_ORDER_ID)
          expect(values.token_hash).not.toBe(FIXTURE_TOKEN)

          return {
            select() {
              return {
                maybeSingle: handlers.insert ?? (async () => ({
                  data: {
                    id: 'ctx-1',
                    expires_at: values.expires_at as string,
                  },
                  error: null,
                })),
              }
            },
          }
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle: handlers.select ?? (async () => ({ data: null, error: null })),
              }
            },
          }
        },
        update(values: Record<string, unknown>) {
          return {
            eq: handlers.update
              ? async () => handlers.update!()
              : async () => {
                  expect(values.expires_at).toBeDefined()
                  return { error: null }
                },
          }
        },
      }
    },
  }
}

describe('activationContextService', () => {
  it('creates a context with hashed token storage only', async () => {
    const now = new Date('2026-09-06T12:00:00.000Z')
    const client = createMockClient({})

    const result = await createActivationContext(FIXTURE_ORDER_ID, {
      supabaseClient: client,
      now,
      generateToken: () => FIXTURE_TOKEN,
    })

    expect(result.token).toBe(FIXTURE_TOKEN)
    expect(result.expiresAt.toISOString()).toBe('2026-09-06T13:00:00.000Z')
  })

  it('resolves a valid context and refreshes sliding expiry', async () => {
    const now = new Date('2026-09-06T12:30:00.000Z')
    let updateCalled = false
    const client = createMockClient({
      select: async () => ({ data: createRow(), error: null }),
      update: async () => {
        updateCalled = true
        return { error: null }
      },
    })

    const status = await resolveActivationContext({
      supabaseClient: client,
      token: FIXTURE_TOKEN,
      now,
    })

    expect(status).toBe('VALID')
    expect(updateCalled).toBe(true)
  })

  it('returns NONE for missing contexts', async () => {
    const client = createMockClient({
      select: async () => ({ data: null, error: null }),
    })

    await expect(
      resolveActivationContext({
        supabaseClient: client,
        token: FIXTURE_TOKEN,
      }),
    ).resolves.toBe('NONE')
  })

  it('returns EXPIRED without touching expired contexts', async () => {
    const now = new Date('2026-09-06T14:00:00.000Z')
    const update = vi.fn(async () => ({ error: null }))
    const client = createMockClient({
      select: async () => ({
        data: createRow({
          expires_at: '2026-09-06T13:00:00.000Z',
        }),
        error: null,
      }),
      update,
    })

    await expect(
      resolveActivationContext({
        supabaseClient: client,
        token: FIXTURE_TOKEN,
        now,
      }),
    ).resolves.toBe('EXPIRED')
    expect(update).not.toHaveBeenCalled()
  })

  it('returns EXPIRED for invalidated contexts', async () => {
    const client = createMockClient({
      select: async () => ({
        data: createRow({
          invalidated_at: '2026-09-06T12:45:00.000Z',
        }),
        error: null,
      }),
    })

    await expect(
      resolveActivationContext({
        supabaseClient: client,
        token: FIXTURE_TOKEN,
      }),
    ).resolves.toBe('EXPIRED')
  })

  it('maps database errors safely', async () => {
    const client = createMockClient({
      select: async () => ({ data: null, error: { code: 'XX000' } }),
    })

    await expect(
      resolveActivationContext({
        supabaseClient: client,
        token: FIXTURE_TOKEN,
      }),
    ).rejects.toBeInstanceOf(ActivationContextError)
  })
})

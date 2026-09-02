import { describe, expect, it, vi } from 'vitest'
import {
  getOrdersCheckpoint,
  ORDERS_CHECKPOINT_KEY,
  parseOrdersCheckpointValue,
  saveOrdersCheckpoint,
  SyncStateError,
} from '../syncStateService.ts'

function createSyncStateClient(state: {
  readResult?: {
    data: { key: string; value: unknown } | null
    error: { code?: string; message?: string } | null
  }
  upsertResult?: { error: { code?: string; message?: string } | null }
  upsert?: ReturnType<typeof vi.fn>
}) {
  const upsert = state.upsert ?? vi.fn().mockResolvedValue(state.upsertResult ?? { error: null })

  return {
    from(table: 'sync_state') {
      if (table !== 'sync_state') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(
              state.readResult ?? { data: null, error: null },
            ),
          }),
        }),
        upsert,
      }
    },
  }
}

describe('syncStateService', () => {
  it('accepts a valid ISO UTC timestamp', () => {
    expect(
      parseOrdersCheckpointValue({
        lastSuccessfulSyncAt: '2026-09-02T22:29:29.891Z',
      }),
    ).toEqual({
      lastSuccessfulSyncAt: '2026-09-02T22:29:29.891Z',
    })
  })

  it('parses a valid orders checkpoint value', () => {
    expect(
      parseOrdersCheckpointValue({
        lastSuccessfulSyncAt: '2026-09-02T10:00:00.000Z',
      }),
    ).toEqual({
      lastSuccessfulSyncAt: '2026-09-02T10:00:00.000Z',
    })
  })

  it('rejects malformed checkpoint values', () => {
    expect(() => parseOrdersCheckpointValue({})).toThrow(SyncStateError)
    expect(() => parseOrdersCheckpointValue({ lastSuccessfulSyncAt: '' })).toThrow(
      'Invalid Amazon orders sync checkpoint',
    )
    expect(() =>
      parseOrdersCheckpointValue({ lastSuccessfulSyncAt: 'not-a-date' }),
    ).toThrow('Invalid Amazon orders sync checkpoint')
  })

  it('rejects non-ISO date strings that Date.parse would accept', () => {
    expect(() =>
      parseOrdersCheckpointValue({ lastSuccessfulSyncAt: '09/02/2026' }),
    ).toThrow('Invalid Amazon orders sync checkpoint')
  })

  it('returns null when no orders checkpoint exists', async () => {
    const client = createSyncStateClient({
      readResult: { data: null, error: null },
    })

    await expect(getOrdersCheckpoint(client)).resolves.toBeNull()
  })

  it('upserts orders_checkpoint using onConflict key', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const client = createSyncStateClient({ upsert })

    await saveOrdersCheckpoint(client, '2026-09-02T10:00:00.000Z')

    expect(upsert).toHaveBeenCalledWith(
      {
        key: ORDERS_CHECKPOINT_KEY,
        value: { lastSuccessfulSyncAt: '2026-09-02T10:00:00.000Z' },
        updated_at: expect.any(String),
      },
      { onConflict: 'key' },
    )
  })

  it('propagates safe read failure details from Supabase', async () => {
    const client = createSyncStateClient({
      readResult: {
        data: null,
        error: { code: '42501', message: 'permission denied' },
      },
    })

    await expect(getOrdersCheckpoint(client)).rejects.toMatchObject({
      name: 'SyncStateError',
      message:
        'Failed to read Amazon orders sync checkpoint [42501]: permission denied',
      supabaseCode: '42501',
    })
  })

  it('propagates safe write failure details from Supabase', async () => {
    const client = createSyncStateClient({
      upsertResult: {
        error: { code: '42501', message: 'permission denied' },
      },
    })

    await expect(
      saveOrdersCheckpoint(client, '2026-09-02T10:00:00.000Z'),
    ).rejects.toMatchObject({
      name: 'SyncStateError',
      message:
        'Failed to save Amazon orders sync checkpoint [42501]: permission denied',
      supabaseCode: '42501',
    })
  })
})

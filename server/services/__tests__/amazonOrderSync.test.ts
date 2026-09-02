import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedAmazonOrder } from '../../amazon/ordersTypes.ts'
import { SearchOrdersError } from '../../amazon/searchOrdersError.ts'
import { AmazonOrderPersistenceError } from '../amazonOrderPersistence.ts'
import {
  calculateLastUpdatedAfter,
  INITIAL_ORDER_SYNC_LOOKBACK_DAYS,
  ORDER_SYNC_OVERLAP_MINUTES,
  runAmazonOrderSync,
  type AmazonOrderSyncClient,
} from '../amazonOrderSync.ts'
import { SyncStateError } from '../syncStateService.ts'

const sampleOrder: NormalizedAmazonOrder = {
  amazonOrderId: '202-1234567-8901234',
  purchaseDate: '2026-01-01T10:00:00Z',
  fulfillmentStatus: 'SHIPPED',
  lastAmazonUpdate: '2026-01-02T12:00:00Z',
  items: [
    {
      orderItemId: '98765432109876',
      asin: 'B0FKBBN52C',
      sku: 'SM-FLASHCARDS',
      quantityOrdered: 1,
      quantityFulfilled: 1,
    },
  ],
}

const env = {
  SP_API_ENDPOINT: 'https://sellingpartnerapi-eu.amazon.com',
  SP_API_MARKETPLACE_ID: 'A1F83G8C2ARO7P',
  TARGET_ASIN: 'B0FKBBN52C',
  SP_API_CLIENT_ID: 'client-id',
  SP_API_CLIENT_SECRET: 'client-secret',
  SP_API_REFRESH_TOKEN: 'refresh-token',
}

function createSyncClient(options: {
  checkpoint?: { lastSuccessfulSyncAt: string } | null
  malformedCheckpoint?: boolean
  checkpointReadError?: { code?: string; message?: string } | null
  checkpointWriteError?: { code?: string; message?: string } | null
  orderUpsertError?: { code?: string; message?: string } | null
  itemUpsertError?: { code?: string; message?: string } | null
} = {}) {
  const checkpointUpsert = vi.fn().mockResolvedValue({
    error: options.checkpointWriteError ?? null,
  })
  const ordersUpsert = vi.fn().mockResolvedValue({
    error: options.orderUpsertError ?? null,
  })
  const itemsUpsert = vi.fn().mockResolvedValue({
    error: options.itemUpsertError ?? null,
  })

  let checkpointData: { key: string; value: unknown } | null = null

  if (options.malformedCheckpoint) {
    checkpointData = { key: 'orders_checkpoint', value: { invalid: true } }
  } else if (options.checkpoint) {
    checkpointData = {
      key: 'orders_checkpoint',
      value: options.checkpoint,
    }
  }

  const client: AmazonOrderSyncClient = {
    from(table) {
      if (table === 'sync_state') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: checkpointData,
                error: options.checkpointReadError ?? null,
              }),
            }),
          }),
          upsert: checkpointUpsert,
        }
      }

      if (table === 'amazon_orders') {
        return { upsert: ordersUpsert }
      }

      return { upsert: itemsUpsert }
    },
  }

  return { client, checkpointUpsert, ordersUpsert, itemsUpsert }
}

describe('calculateLastUpdatedAfter', () => {
  it('uses syncStartedAt minus 7 days on first run', () => {
    const syncStartedAt = new Date('2026-09-02T10:00:00.000Z')

    expect(calculateLastUpdatedAfter(syncStartedAt, null)).toEqual({
      lastUpdatedAfter: '2026-08-26T10:00:00.000Z',
      syncMode: 'initial',
    })
  })

  it('uses checkpoint minus 5 minute overlap on incremental runs', () => {
    const syncStartedAt = new Date('2026-09-02T11:00:00.000Z')

    expect(
      calculateLastUpdatedAfter(syncStartedAt, '2026-09-02T10:00:00.000Z'),
    ).toEqual({
      lastUpdatedAfter: '2026-09-02T09:55:00.000Z',
      syncMode: 'incremental',
    })
  })
})

describe('runAmazonOrderSync', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes checkpoint on first successful run using syncStartedAt', async () => {
    const { client, checkpointUpsert } = createSyncClient()
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ orders: [], pagination: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchFn as typeof fetch)

    const tokenResponse = new Response(
      JSON.stringify({
        access_token: 'Atza|test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
    fetchFn.mockResolvedValueOnce(tokenResponse)

    const result = await runAmazonOrderSync({
      env,
      supabaseClient: client,
      fetchFn: fetchFn as typeof fetch,
      now: new Date('2026-09-02T10:00:00.000Z'),
    })

    expect(result.syncMode).toBe('initial')
    expect(result.queryFrom).toBe('2026-08-26T10:00:00.000Z')
    expect(result.syncStartedAt).toBe('2026-09-02T10:00:00.000Z')
    expect(result.checkpointUpdated).toBe(true)
    expect(result.checkpointSavedAt).toBe('2026-09-02T10:00:00.000Z')
    expect(checkpointUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'orders_checkpoint',
        value: { lastSuccessfulSyncAt: '2026-09-02T10:00:00.000Z' },
      }),
      { onConflict: 'key' },
    )
  })

  it('does not save syncStartedAt as completion time when sync finishes later', async () => {
    const { client, checkpointUpsert } = createSyncClient()
    const fetchFn = vi.fn()

    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'Atza|test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    fetchFn.mockResolvedValueOnce(
      new Response(JSON.stringify({ orders: [], pagination: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await runAmazonOrderSync({
      env,
      supabaseClient: client,
      fetchFn: fetchFn as typeof fetch,
      now: new Date('2026-09-02T10:00:00.000Z'),
    })

    expect(checkpointUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        value: { lastSuccessfulSyncAt: '2026-09-02T10:00:00.000Z' },
      }),
      { onConflict: 'key' },
    )
    expect(checkpointUpsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        value: { lastSuccessfulSyncAt: '2026-09-02T10:30:00.000Z' },
      }),
      expect.anything(),
    )
  })

  it('does not advance checkpoint when Amazon fetch fails', async () => {
    const { client, checkpointUpsert } = createSyncClient()
    const fetchFn = vi.fn()

    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'Atza|test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    fetchFn.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'Rate limit exceeded' }] }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      runAmazonOrderSync({
        env,
        supabaseClient: client,
        fetchFn: fetchFn as typeof fetch,
        now: new Date('2026-09-02T10:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(SearchOrdersError)

    expect(checkpointUpsert).not.toHaveBeenCalled()
  })

  it('does not advance checkpoint when a later pagination page fails', async () => {
    const { client, checkpointUpsert } = createSyncClient()
    const fetchFn = vi.fn()

    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'Atza|test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          orders: [],
          pagination: { nextToken: 'page-2-token' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    fetchFn.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'Rate limit exceeded' }] }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      runAmazonOrderSync({
        env,
        supabaseClient: client,
        fetchFn: fetchFn as typeof fetch,
        now: new Date('2026-09-02T10:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(SearchOrdersError)

    expect(checkpointUpsert).not.toHaveBeenCalled()
  })

  it('does not advance checkpoint when order persistence fails', async () => {
    const { client, checkpointUpsert } = createSyncClient({
      orderUpsertError: { code: '42501', message: 'permission denied' },
    })
    const fetchFn = vi.fn()

    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'Atza|test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          orders: [
            {
              orderId: sampleOrder.amazonOrderId,
              createdTime: sampleOrder.purchaseDate,
              lastUpdatedTime: sampleOrder.lastAmazonUpdate,
              fulfillment: { fulfillmentStatus: sampleOrder.fulfillmentStatus },
              orderItems: [
                {
                  orderItemId: sampleOrder.items[0]!.orderItemId,
                  quantityOrdered: 1,
                  product: {
                    asin: sampleOrder.items[0]!.asin,
                    sellerSku: sampleOrder.items[0]!.sku,
                  },
                  fulfillment: { quantityFulfilled: 1 },
                },
              ],
            },
          ],
          pagination: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(
      runAmazonOrderSync({
        env,
        supabaseClient: client,
        fetchFn: fetchFn as typeof fetch,
        now: new Date('2026-09-02T10:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(AmazonOrderPersistenceError)

    expect(checkpointUpsert).not.toHaveBeenCalled()
  })

  it('does not advance checkpoint when item persistence fails', async () => {
    const { client, checkpointUpsert } = createSyncClient({
      itemUpsertError: { code: '42501', message: 'permission denied' },
    })
    const fetchFn = vi.fn()

    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'Atza|test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          orders: [
            {
              orderId: sampleOrder.amazonOrderId,
              createdTime: sampleOrder.purchaseDate,
              lastUpdatedTime: sampleOrder.lastAmazonUpdate,
              fulfillment: { fulfillmentStatus: sampleOrder.fulfillmentStatus },
              orderItems: [
                {
                  orderItemId: sampleOrder.items[0]!.orderItemId,
                  quantityOrdered: 1,
                  product: {
                    asin: sampleOrder.items[0]!.asin,
                    sellerSku: sampleOrder.items[0]!.sku,
                  },
                  fulfillment: { quantityFulfilled: 1 },
                },
              ],
            },
          ],
          pagination: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(
      runAmazonOrderSync({
        env,
        supabaseClient: client,
        fetchFn: fetchFn as typeof fetch,
        now: new Date('2026-09-02T10:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(AmazonOrderPersistenceError)

    expect(checkpointUpsert).not.toHaveBeenCalled()
  })

  it('advances checkpoint when Amazon succeeds with zero matching orders', async () => {
    const { client, checkpointUpsert } = createSyncClient()
    const fetchFn = vi.fn()

    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'Atza|test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    fetchFn.mockResolvedValueOnce(
      new Response(JSON.stringify({ orders: [], pagination: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await runAmazonOrderSync({
      env,
      supabaseClient: client,
      fetchFn: fetchFn as typeof fetch,
      now: new Date('2026-09-02T10:00:00.000Z'),
    })

    expect(result.matchingOrders).toBe(0)
    expect(result.ordersUpserted).toBe(0)
    expect(result.itemsUpserted).toBe(0)
    expect(checkpointUpsert).toHaveBeenCalledOnce()
  })

  it('rejects clearly when checkpoint write fails after successful fetch and persistence', async () => {
    const { client } = createSyncClient({
      checkpointWriteError: { code: '42501', message: 'permission denied' },
    })
    const fetchFn = vi.fn()

    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'Atza|test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    fetchFn.mockResolvedValueOnce(
      new Response(JSON.stringify({ orders: [], pagination: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      runAmazonOrderSync({
        env,
        supabaseClient: client,
        fetchFn: fetchFn as typeof fetch,
        now: new Date('2026-09-02T10:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      name: 'SyncStateError',
      message: expect.stringContaining('Failed to save Amazon orders sync checkpoint'),
    })
  })

  it('fails on malformed checkpoint without calling Amazon', async () => {
    const { client } = createSyncClient({ malformedCheckpoint: true })
    const fetchFn = vi.fn()

    await expect(
      runAmazonOrderSync({
        env,
        supabaseClient: client,
        fetchFn: fetchFn as typeof fetch,
        now: new Date('2026-09-02T10:00:00.000Z'),
      }),
    ).rejects.toThrow('Invalid Amazon orders sync checkpoint')

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('uses incremental query window when checkpoint exists', async () => {
    const { client } = createSyncClient({
      checkpoint: { lastSuccessfulSyncAt: '2026-09-02T10:00:00.000Z' },
    })
    const fetchFn = vi.fn()

    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'Atza|test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    fetchFn.mockResolvedValueOnce(
      new Response(JSON.stringify({ orders: [], pagination: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await runAmazonOrderSync({
      env,
      supabaseClient: client,
      fetchFn: fetchFn as typeof fetch,
      now: new Date('2026-09-02T11:00:00.000Z'),
    })

    expect(result.syncMode).toBe('incremental')
    expect(result.queryFrom).toBe('2026-09-02T09:55:00.000Z')

    const searchUrl = String(fetchFn.mock.calls[1]?.[0])
    expect(searchUrl).toContain(
      `lastUpdatedAfter=${encodeURIComponent('2026-09-02T09:55:00.000Z')}`,
    )
  })
})

describe('sync constants', () => {
  it('documents the configured lookback and overlap values', () => {
    expect(INITIAL_ORDER_SYNC_LOOKBACK_DAYS).toBe(7)
    expect(ORDER_SYNC_OVERLAP_MINUTES).toBe(5)
  })
})

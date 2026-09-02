import { describe, expect, it, vi } from 'vitest'
import type { NormalizedAmazonOrder } from '../../amazon/ordersTypes.ts'
import {
  AmazonOrderPersistenceError,
  mapItemToRow,
  mapOrderToRow,
  persistAmazonOrders,
  type SupabaseUpsertClient,
} from '../amazonOrderPersistence.ts'

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
      quantityOrdered: 2,
      quantityFulfilled: 2,
    },
  ],
}

function createMockClient(handlers: {
  orders?: () => Promise<{ error: { code?: string; message?: string } | null }>
  items?: () => Promise<{ error: { code?: string; message?: string } | null }>
}): SupabaseUpsertClient {
  const ordersUpsert = vi.fn().mockImplementation(
    handlers.orders ?? (async () => ({ error: null })),
  )
  const itemsUpsert = vi.fn().mockImplementation(
    handlers.items ?? (async () => ({ error: null })),
  )

  return {
    from(table) {
      if (table === 'amazon_orders') {
        return { upsert: ordersUpsert }
      }

      return { upsert: itemsUpsert }
    },
  }
}

describe('amazonOrderPersistence', () => {
  it('maps normalized orders to amazon_orders rows', () => {
    expect(mapOrderToRow(sampleOrder)).toEqual({
      amazon_order_id: '202-1234567-8901234',
      purchase_date: '2026-01-01T10:00:00Z',
      fulfillment_status: 'SHIPPED',
      last_amazon_update: '2026-01-02T12:00:00Z',
    })
  })

  it('maps normalized items to amazon_order_items rows', () => {
    expect(mapItemToRow(sampleOrder, sampleOrder.items[0]!)).toEqual({
      order_item_id: '98765432109876',
      amazon_order_id: '202-1234567-8901234',
      asin: 'B0FKBBN52C',
      sku: 'SM-FLASHCARDS',
      quantity_ordered: 2,
      quantity_fulfilled: 2,
      quantity_returned: 0,
    })
  })

  it('upserts orders before items and uses conflict keys', async () => {
    const callOrder: string[] = []
    const client = createMockClient({
      orders: async () => {
        callOrder.push('orders')
        return { error: null }
      },
      items: async () => {
        callOrder.push('items')
        return { error: null }
      },
    })

    const ordersUpsert = client.from('amazon_orders').upsert as ReturnType<
      typeof vi.fn
    >
    const itemsUpsert = client.from('amazon_order_items').upsert as ReturnType<
      typeof vi.fn
    >

    const result = await persistAmazonOrders([sampleOrder], client)

    expect(callOrder).toEqual(['orders', 'items'])
    expect(ordersUpsert).toHaveBeenCalledWith(
      [
        {
          amazon_order_id: '202-1234567-8901234',
          purchase_date: '2026-01-01T10:00:00Z',
          fulfillment_status: 'SHIPPED',
          last_amazon_update: '2026-01-02T12:00:00Z',
        },
      ],
      { onConflict: 'amazon_order_id' },
    )
    expect(itemsUpsert).toHaveBeenCalledWith(
      [
        {
          order_item_id: '98765432109876',
          amazon_order_id: '202-1234567-8901234',
          asin: 'B0FKBBN52C',
          sku: 'SM-FLASHCARDS',
          quantity_ordered: 2,
          quantity_fulfilled: 2,
          quantity_returned: 0,
        },
      ],
      { onConflict: 'order_item_id' },
    )
    expect(result).toEqual({
      ordersUpserted: 1,
      itemsUpserted: 1,
    })
  })

  it('does not attempt item upsert when order upsert fails', async () => {
    const client = createMockClient({
      orders: async () => ({
        error: {
          code: 'PGRST301',
          message: 'Expected 3 parts in JWT; got 1',
        },
      }),
      items: async () => ({ error: null }),
    })

    const itemsUpsert = client.from('amazon_order_items').upsert as ReturnType<
      typeof vi.fn
    >

    await expect(persistAmazonOrders([sampleOrder], client)).rejects.toMatchObject({
      name: 'AmazonOrderPersistenceError',
      message:
        'Amazon order upsert failed [PGRST301]: Expected 3 parts in JWT; got 1',
      supabaseCode: 'PGRST301',
    })
    expect(itemsUpsert).not.toHaveBeenCalled()
  })

  it('propagates safe Supabase error code and message for item upsert failures', async () => {
    const client = createMockClient({
      orders: async () => ({ error: null }),
      items: async () => ({
        error: {
          code: '42501',
          message: 'permission denied for table amazon_order_items',
        },
      }),
    })

    await expect(persistAmazonOrders([sampleOrder], client)).rejects.toMatchObject({
      name: 'AmazonOrderPersistenceError',
      message:
        'Amazon order item upsert failed [42501]: permission denied for table amazon_order_items',
      supabaseCode: '42501',
    })
  })

  it('does not include supplied order or row data in upsert failure messages', async () => {
    const client = createMockClient({
      orders: async () => ({
        error: {
          code: '23505',
          message: `duplicate key value violates unique constraint for order ${sampleOrder.amazonOrderId}`,
        },
      }),
      items: async () => ({ error: null }),
    })

    try {
      await persistAmazonOrders([sampleOrder], client)
      expect.unreachable('Expected persistAmazonOrders to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AmazonOrderPersistenceError)
      const message = (error as AmazonOrderPersistenceError).message

      expect(message).toContain('[23505]')
      expect(message).not.toContain(sampleOrder.amazonOrderId)
      expect(message).not.toContain(sampleOrder.items[0]!.orderItemId)
      expect(message).not.toContain(sampleOrder.items[0]!.asin)
      expect(message).not.toContain(sampleOrder.items[0]!.sku)
    }
  })

  it('rejects clearly when item upsert fails without a Supabase code', async () => {
    const client = createMockClient({
      orders: async () => ({ error: null }),
      items: async () => ({ error: { message: 'item upsert failed' } }),
    })

    await expect(persistAmazonOrders([sampleOrder], client)).rejects.toThrow(
      AmazonOrderPersistenceError,
    )
    await expect(persistAmazonOrders([sampleOrder], client)).rejects.toThrow(
      'Amazon order item upsert failed: item upsert failed',
    )
  })

  it('returns zero counts for an empty matching order list', async () => {
    const client = createMockClient({})

    await expect(persistAmazonOrders([], client)).resolves.toEqual({
      ordersUpserted: 0,
      itemsUpserted: 0,
    })
  })
})

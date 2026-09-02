import { describe, expect, it } from 'vitest'
import {
  countMatchingItems,
  filterOrdersByTargetAsin,
} from '../orderFilter.ts'
import {
  mapAmazonOrder,
  mapAmazonOrderItem,
  validateOrderForNormalization,
} from '../orderMapper.ts'
import { SearchOrdersError } from '../searchOrdersError.ts'
import type { AmazonSearchOrder } from '../ordersTypes.ts'

const TARGET_ASIN = 'B0FKBBN52C'

function createOrder(
  orderId: string,
  items: AmazonSearchOrder['orderItems'],
  overrides: Partial<AmazonSearchOrder> = {},
): AmazonSearchOrder {
  return {
    orderId,
    createdTime: '2026-01-01T10:00:00Z',
    lastUpdatedTime: '2026-01-02T12:00:00Z',
    fulfillment: {
      fulfillmentStatus: 'SHIPPED',
      fulfilledBy: 'AMAZON',
    },
    orderItems: items,
    ...overrides,
  }
}

describe('orderFilter', () => {
  it('keeps only TARGET_ASIN items when an order contains mixed ASINs', () => {
    const orders = [
      createOrder('order-1', [
        {
          orderItemId: 'item-target',
          quantityOrdered: 1,
          product: { asin: TARGET_ASIN, sellerSku: 'TARGET-SKU' },
          fulfillment: { quantityFulfilled: 1 },
        },
        {
          orderItemId: 'item-other',
          quantityOrdered: 2,
          product: { asin: 'OTHER-ASIN', sellerSku: 'OTHER-SKU' },
          fulfillment: { quantityFulfilled: 2 },
        },
      ]),
    ]

    const result = filterOrdersByTargetAsin(orders, TARGET_ASIN)

    expect(result).toHaveLength(1)
    expect(result[0]?.items).toHaveLength(1)
    expect(result[0]?.items[0]?.asin).toBe(TARGET_ASIN)
    expect(result[0]?.items[0]?.orderItemId).toBe('item-target')
  })

  it('ignores orders that contain only non-matching ASINs', () => {
    const orders = [
      createOrder('order-other-only', [
        {
          orderItemId: 'item-other',
          quantityOrdered: 1,
          product: { asin: 'OTHER-ASIN', sellerSku: 'OTHER-SKU' },
          fulfillment: { quantityFulfilled: 1 },
        },
      ]),
    ]

    expect(filterOrdersByTargetAsin(orders, TARGET_ASIN)).toEqual([])
  })

  it('retains multiple matching items from the same order', () => {
    const orders = [
      createOrder('order-multi', [
        {
          orderItemId: 'item-target-1',
          quantityOrdered: 1,
          product: { asin: TARGET_ASIN, sellerSku: 'TARGET-SKU-1' },
          fulfillment: { quantityFulfilled: 1 },
        },
        {
          orderItemId: 'item-target-2',
          quantityOrdered: 3,
          product: { asin: TARGET_ASIN, sellerSku: 'TARGET-SKU-2' },
          fulfillment: { quantityFulfilled: 2 },
        },
      ]),
    ]

    const result = filterOrdersByTargetAsin(orders, TARGET_ASIN)

    expect(result).toHaveLength(1)
    expect(result[0]?.items).toHaveLength(2)
    expect(countMatchingItems(result)).toBe(2)
  })
})

describe('orderMapper', () => {
  it('maps order and item fields into the normalised structure', () => {
    const order = createOrder('202-1234567-8901234', [
      {
        orderItemId: '98765432109876',
        quantityOrdered: 2,
        product: { asin: TARGET_ASIN, sellerSku: 'SM-FLASHCARDS' },
        fulfillment: { quantityFulfilled: 2 },
      },
    ])

    const mapped = mapAmazonOrder(order, order.orderItems ?? [])

    expect(mapped).toEqual({
      amazonOrderId: '202-1234567-8901234',
      purchaseDate: '2026-01-01T10:00:00Z',
      fulfillmentStatus: 'SHIPPED',
      lastAmazonUpdate: '2026-01-02T12:00:00Z',
      items: [
        {
          orderItemId: '98765432109876',
          asin: TARGET_ASIN,
          sku: 'SM-FLASHCARDS',
          quantityOrdered: 2,
          quantityFulfilled: 2,
        },
      ],
    })

    expect(mapAmazonOrderItem(order.orderItems![0]!)).toEqual(mapped.items[0])
  })

  it('rejects orders with a missing order identifier', () => {
    const order = createOrder('', [
      {
        orderItemId: 'item-target',
        quantityOrdered: 1,
        product: { asin: TARGET_ASIN, sellerSku: 'TARGET-SKU' },
        fulfillment: { quantityFulfilled: 1 },
      },
    ])

    expect(() => mapAmazonOrder(order, order.orderItems ?? [])).toThrow(
      SearchOrdersError,
    )
    expect(() => mapAmazonOrder(order, order.orderItems ?? [])).toThrow(
      'Amazon searchOrders returned an invalid order structure',
    )
  })

  it('rejects retained items with a missing item identifier', () => {
    const order = createOrder('order-1', [
      {
        orderItemId: '',
        quantityOrdered: 1,
        product: { asin: TARGET_ASIN, sellerSku: 'TARGET-SKU' },
        fulfillment: { quantityFulfilled: 1 },
      },
    ])

    expect(() => validateOrderForNormalization(order, order.orderItems ?? [])).toThrow(
      'Amazon searchOrders returned an invalid order structure',
    )
  })

  it('rejects filtering when a matching order has invalid required fields', () => {
    const orders = [
      createOrder(
        'order-invalid',
        [
          {
            orderItemId: 'item-target',
            quantityOrdered: 1,
            product: { asin: TARGET_ASIN, sellerSku: 'TARGET-SKU' },
            fulfillment: { quantityFulfilled: 1 },
          },
        ],
        { lastUpdatedTime: '' },
      ),
    ]

    expect(() => filterOrdersByTargetAsin(orders, TARGET_ASIN)).toThrow(
      'Amazon searchOrders returned an invalid order structure',
    )
  })

  it('rejects filtering when a retained item has a missing item identifier', () => {
    const orders = [
      createOrder('order-1', [
        {
          orderItemId: '',
          quantityOrdered: 1,
          product: { asin: TARGET_ASIN, sellerSku: 'TARGET-SKU' },
          fulfillment: { quantityFulfilled: 1 },
        },
      ]),
    ]

    expect(() => filterOrdersByTargetAsin(orders, TARGET_ASIN)).toThrow(
      'Amazon searchOrders returned an invalid order structure',
    )
  })
})

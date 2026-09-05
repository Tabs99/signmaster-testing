import { describe, expect, it, vi } from 'vitest'
import type { AmazonOrderItemRow } from '../amazonOrderPersistence.ts'
import {
  ActivationVerificationError,
  calculateTargetItemTotals,
  isCancelledFulfillmentStatus,
  verifyActivationEligibility,
  type ActivationVerificationClient,
} from '../activationVerification.ts'

const TARGET_ASIN = 'B0TEST12345'
const FIXTURE_ORDER_ID = '123-1234567-1234567'

function createTargetItem(
  overrides: Partial<AmazonOrderItemRow> = {},
): AmazonOrderItemRow {
  return {
    order_item_id: 'item-1',
    amazon_order_id: FIXTURE_ORDER_ID,
    asin: TARGET_ASIN,
    sku: 'SM-FLASHCARDS',
    quantity_ordered: 1,
    quantity_fulfilled: 1,
    quantity_returned: 0,
    ...overrides,
  }
}

function createVerificationClient(state: {
  order?: { amazon_order_id: string; fulfillment_status: string } | null
  orderError?: { code?: string; message?: string } | null
  items?: AmazonOrderItemRow[]
  itemsError?: { code?: string; message?: string } | null
  entitlement?: { id: string } | null
  entitlementError?: { code?: string; message?: string } | null
}): ActivationVerificationClient {
  return {
    from(table) {
      if (table === 'amazon_orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: state.order ?? null,
                error: state.orderError ?? null,
              }),
            }),
          }),
        }
      }

      if (table === 'amazon_order_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_column: string, value: string) => {
              if (value === FIXTURE_ORDER_ID) {
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: state.items ?? [],
                    error: state.itemsError ?? null,
                  }),
                }
              }

              return {
                eq: vi.fn().mockResolvedValue({
                  data: [],
                  error: state.itemsError ?? null,
                }),
              }
            }),
          }),
        }
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: state.entitlement ?? null,
              error: state.entitlementError ?? null,
            }),
          }),
        }),
      }
    },
  }
}

describe('activationVerification', () => {
  it('returns ELIGIBLE for a matching fulfilled order', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'SHIPPED',
      },
      items: [createTargetItem()],
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).resolves.toEqual({ status: 'ELIGIBLE' })
  })

  it('returns NOT_FOUND when the order does not exist', async () => {
    const client = createVerificationClient({ order: null })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).resolves.toEqual({ status: 'NOT_FOUND' })
  })

  it('returns NOT_FOUND when the order exists without TARGET_ASIN items', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'SHIPPED',
      },
      items: [],
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).resolves.toEqual({ status: 'NOT_FOUND' })
  })

  it('returns NOT_SHIPPED when quantity_fulfilled is zero', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'SHIPPED',
      },
      items: [createTargetItem({ quantity_fulfilled: 0 })],
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).resolves.toEqual({ status: 'NOT_SHIPPED' })
  })

  it('returns ALREADY_CLAIMED when an entitlement exists', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'SHIPPED',
      },
      items: [createTargetItem()],
      entitlement: { id: 'entitlement-1' },
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).resolves.toEqual({ status: 'ALREADY_CLAIMED' })
  })

  it('returns CANCELLED for cancelled fulfillment status', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'CANCELLED',
      },
      items: [createTargetItem()],
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).resolves.toEqual({ status: 'CANCELLED' })
  })

  it('returns RETURNED when fulfilled units are fully returned', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'SHIPPED',
      },
      items: [createTargetItem({ quantity_fulfilled: 1, quantity_returned: 1 })],
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).resolves.toEqual({ status: 'RETURNED' })
  })

  it('returns ELIGIBLE when one fulfilled unit remains after a partial return', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'SHIPPED',
      },
      items: [createTargetItem({ quantity_fulfilled: 2, quantity_returned: 1 })],
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).resolves.toEqual({ status: 'ELIGIBLE' })
  })

  it('aggregates retained quantity across multiple matching items', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'SHIPPED',
      },
      items: [
        createTargetItem({
          order_item_id: 'item-1',
          quantity_fulfilled: 2,
          quantity_returned: 1,
        }),
        createTargetItem({
          order_item_id: 'item-2',
          quantity_fulfilled: 1,
          quantity_returned: 1,
        }),
      ],
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).resolves.toEqual({ status: 'ELIGIBLE' })

    expect(
      calculateTargetItemTotals([
        createTargetItem({
          order_item_id: 'item-1',
          quantity_fulfilled: 2,
          quantity_returned: 1,
        }),
        createTargetItem({
          order_item_id: 'item-2',
          quantity_fulfilled: 1,
          quantity_returned: 1,
        }),
      ]),
    ).toEqual({
      totalFulfilled: 3,
      totalRetained: 1,
    })
  })

  it('throws a safe service error when order lookup fails', async () => {
    const client = createVerificationClient({
      orderError: { code: '42501', message: 'permission denied' },
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).rejects.toMatchObject({
      name: 'ActivationVerificationError',
      message:
        'Failed to look up order for activation verification [42501]: permission denied',
      supabaseCode: '42501',
    })
  })

  it('throws a safe service error when item lookup fails', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'SHIPPED',
      },
      itemsError: { code: '42501', message: 'permission denied' },
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).rejects.toMatchObject({
      name: 'ActivationVerificationError',
      message:
        'Failed to look up order items for activation verification [42501]: permission denied',
      supabaseCode: '42501',
    })
  })

  it('throws a safe service error when entitlement lookup fails', async () => {
    const client = createVerificationClient({
      order: {
        amazon_order_id: FIXTURE_ORDER_ID,
        fulfillment_status: 'SHIPPED',
      },
      items: [createTargetItem()],
      entitlementError: { code: '42501', message: 'permission denied' },
    })

    await expect(
      verifyActivationEligibility(FIXTURE_ORDER_ID, {
        supabaseClient: client,
        targetAsin: TARGET_ASIN,
      }),
    ).rejects.toMatchObject({
      name: 'ActivationVerificationError',
      message:
        'Failed to look up entitlement for activation verification [42501]: permission denied',
      supabaseCode: '42501',
    })
  })
})

describe('calculateTargetItemTotals', () => {
  it('clamps retained quantity to zero when returns exceed fulfilled units', () => {
    expect(
      calculateTargetItemTotals([
        createTargetItem({ quantity_fulfilled: 1, quantity_returned: 5 }),
      ]),
    ).toEqual({
      totalFulfilled: 1,
      totalRetained: 0,
    })
  })
})

describe('isCancelledFulfillmentStatus', () => {
  it('recognises cancelled and canceled spellings case-insensitively', () => {
    expect(isCancelledFulfillmentStatus('CANCELLED')).toBe(true)
    expect(isCancelledFulfillmentStatus('cancelled')).toBe(true)
    expect(isCancelledFulfillmentStatus('CANCELED')).toBe(true)
    expect(isCancelledFulfillmentStatus('SHIPPED')).toBe(false)
  })
})

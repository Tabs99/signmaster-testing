import type { ActivationVerificationStatus } from '../services/activationVerification.ts'

export const ACTIVATION_TEST_FIXTURE_AUTH_EMAIL =
  'activation-fixture@example.invalid'

/** Dedicated hosted-smoke auth user for ALREADY_CLAIMED (333…) — not a real customer. */
export const ACTIVATION_TEST_FIXTURE_HOSTED_AUTH_EMAIL =
  'activation-fixture-hosted@example.invalid'

export const ACTIVATION_TEST_FIXTURE_SKU_PREFIX = 'FIXTURE-'
export const ACTIVATION_TEST_FIXTURE_ORDER_ITEM_ID_PREFIX = 'fixture-item-'

export const ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID =
  '111-1111111-1111111'

export const ACTIVATION_TEST_RESET_ORDER_IDS = [
  '000-0000000-0000000',
  ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID,
  '222-2222222-2222222',
  '333-3333333-3333333',
  '444-4444444-4444444',
  '555-5555555-5555555',
  '666-6666666-6666666',
  '777-7777777-7777777',
  '888-8888888-8888888',
] as const

export type ActivationTestResetOrderId =
  (typeof ACTIVATION_TEST_RESET_ORDER_IDS)[number]

export const ACTIVATION_TEST_SEED_ORDER_IDS = ACTIVATION_TEST_RESET_ORDER_IDS.filter(
  (orderId) => orderId !== ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID,
)

export const ACTIVATION_TEST_FIXTURE_LAST_AMAZON_UPDATE =
  '2026-01-01T00:00:00.000Z'

/** Stable marker timestamp for all synthetic fixture orders (not Amazon sync time). */
export const ACTIVATION_TEST_FIXTURE_MARKER_LAST_AMAZON_UPDATE =
  ACTIVATION_TEST_FIXTURE_LAST_AMAZON_UPDATE

export interface ActivationTestFixtureExpectation {
  orderId: string
  expectedStatus: ActivationVerificationStatus
  seedable: boolean
  cheatSheetNote?: string
}

export interface ActivationTestOrderItemSeed {
  orderItemId: string
  asin: string
  quantityOrdered: number
  quantityFulfilled: number
  quantityReturned: number
  sku: string
}

export interface ActivationTestOrderSeed {
  orderId: string
  fulfillmentStatus: string
  items: ActivationTestOrderItemSeed[]
  createEntitlement: boolean
}

const WRONG_PRODUCT_ASIN_CANDIDATES = [
  'B0FIXTUREWRONG1',
  'B0FIXTUREWRONG2',
  'B0FIXTUREWRONG3',
] as const

export function isActivationTestResetOrderId(value: string): value is ActivationTestResetOrderId {
  return (ACTIVATION_TEST_RESET_ORDER_IDS as readonly string[]).includes(value)
}

export function assertOnlyActivationTestResetOrderIds(orderIds: readonly string[]): void {
  for (const orderId of orderIds) {
    if (!isActivationTestResetOrderId(orderId)) {
      throw new Error(
        `Refusing fixture cleanup/reset for non-reserved order ID: ${orderId}`,
      )
    }
  }
}

export function getWrongProductFixtureAsin(targetAsin: string): string {
  for (const candidate of WRONG_PRODUCT_ASIN_CANDIDATES) {
    if (candidate !== targetAsin) {
      return candidate
    }
  }

  throw new Error('Could not derive a wrong-product fixture ASIN')
}

export function getPartialReturnRetainedQuantity(
  quantityFulfilled: number,
  quantityReturned: number,
): number {
  return Math.max(quantityFulfilled - quantityReturned, 0)
}

export function getActivationTestFixtureExpectations(): ActivationTestFixtureExpectation[] {
  return [
    {
      orderId: '000-0000000-0000000',
      expectedStatus: 'ELIGIBLE',
      seedable: true,
    },
    {
      orderId: '888-8888888-8888888',
      expectedStatus: 'ELIGIBLE',
      seedable: true,
    },
    {
      orderId: ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID,
      expectedStatus: 'NOT_FOUND',
      seedable: false,
    },
    {
      orderId: '222-2222222-2222222',
      expectedStatus: 'NOT_SHIPPED',
      seedable: true,
    },
    {
      orderId: '333-3333333-3333333',
      expectedStatus: 'ALREADY_CLAIMED',
      seedable: true,
    },
    {
      orderId: '444-4444444-4444444',
      expectedStatus: 'CANCELLED',
      seedable: true,
    },
    {
      orderId: '555-5555555-5555555',
      expectedStatus: 'RETURNED',
      seedable: true,
    },
    {
      orderId: '666-6666666-6666666',
      expectedStatus: 'NOT_FOUND',
      seedable: true,
      cheatSheetNote: 'wrong product',
    },
    {
      orderId: '777-7777777-7777777',
      expectedStatus: 'ELIGIBLE',
      seedable: true,
      cheatSheetNote: 'partial return',
    },
  ]
}

export function buildActivationTestOrderSeeds(
  targetAsin: string,
): ActivationTestOrderSeed[] {
  const wrongProductAsin = getWrongProductFixtureAsin(targetAsin)

  return [
    {
      orderId: '000-0000000-0000000',
      fulfillmentStatus: 'SHIPPED',
      createEntitlement: false,
      items: [
        {
          orderItemId: 'fixture-item-000',
          asin: targetAsin,
          quantityOrdered: 1,
          quantityFulfilled: 1,
          quantityReturned: 0,
          sku: 'FIXTURE-000-ELIGIBLE',
        },
      ],
    },
    {
      orderId: '888-8888888-8888888',
      fulfillmentStatus: 'SHIPPED',
      createEntitlement: false,
      items: [
        {
          orderItemId: 'fixture-item-888',
          asin: targetAsin,
          quantityOrdered: 1,
          quantityFulfilled: 1,
          quantityReturned: 0,
          sku: 'FIXTURE-888-ELIGIBLE',
        },
      ],
    },
    {
      orderId: '222-2222222-2222222',
      fulfillmentStatus: 'Pending',
      createEntitlement: false,
      items: [
        {
          orderItemId: 'fixture-item-222',
          asin: targetAsin,
          quantityOrdered: 1,
          quantityFulfilled: 0,
          quantityReturned: 0,
          sku: 'FIXTURE-222-NOT-SHIPPED',
        },
      ],
    },
    {
      orderId: '333-3333333-3333333',
      fulfillmentStatus: 'SHIPPED',
      createEntitlement: true,
      items: [
        {
          orderItemId: 'fixture-item-333',
          asin: targetAsin,
          quantityOrdered: 1,
          quantityFulfilled: 1,
          quantityReturned: 0,
          sku: 'FIXTURE-333-CLAIMED',
        },
      ],
    },
    {
      orderId: '444-4444444-4444444',
      fulfillmentStatus: 'CANCELLED',
      createEntitlement: false,
      items: [
        {
          orderItemId: 'fixture-item-444',
          asin: targetAsin,
          quantityOrdered: 1,
          quantityFulfilled: 1,
          quantityReturned: 0,
          sku: 'FIXTURE-444-CANCELLED',
        },
      ],
    },
    {
      orderId: '555-5555555-5555555',
      fulfillmentStatus: 'SHIPPED',
      createEntitlement: false,
      items: [
        {
          orderItemId: 'fixture-item-555',
          asin: targetAsin,
          quantityOrdered: 1,
          quantityFulfilled: 1,
          quantityReturned: 1,
          sku: 'FIXTURE-555-RETURNED',
        },
      ],
    },
    {
      orderId: '666-6666666-6666666',
      fulfillmentStatus: 'SHIPPED',
      createEntitlement: false,
      items: [
        {
          orderItemId: 'fixture-item-666-wrong-product',
          asin: wrongProductAsin,
          quantityOrdered: 1,
          quantityFulfilled: 1,
          quantityReturned: 0,
          sku: 'FIXTURE-666-WRONG-PRODUCT',
        },
      ],
    },
    {
      orderId: '777-7777777-7777777',
      fulfillmentStatus: 'SHIPPED',
      createEntitlement: false,
      items: [
        {
          orderItemId: 'fixture-item-777-a',
          asin: targetAsin,
          quantityOrdered: 2,
          quantityFulfilled: 2,
          quantityReturned: 1,
          sku: 'FIXTURE-777-PARTIAL-RETURN',
        },
      ],
    },
  ]
}

export function buildFixtureCleanupSqlStatements(
  orderIds: readonly ActivationTestResetOrderId[] = ACTIVATION_TEST_RESET_ORDER_IDS,
): string[] {
  assertOnlyActivationTestResetOrderIds(orderIds)

  const inList = orderIds.map((orderId) => `'${orderId}'`).join(', ')

  return [
    `delete from public.activation_continuations where amazon_order_id in (${inList});`,
    `delete from public.activation_contexts where amazon_order_id in (${inList});`,
    `delete from public.app_entitlements where amazon_order_id in (${inList});`,
    `delete from public.amazon_order_items where amazon_order_id in (${inList});`,
    `delete from public.amazon_orders where amazon_order_id in (${inList});`,
  ]
}

export function formatActivationTestCheatSheet(targetAsin: string): string[] {
  const lines = ['Activation test fixtures created successfully.', '']

  for (const fixture of getActivationTestFixtureExpectations()) {
    const note = fixture.cheatSheetNote ? ` (${fixture.cheatSheetNote})` : ''
    lines.push(
      `${fixture.orderId} → ${fixture.expectedStatus}${note}`,
    )
  }

  lines.push('')
  lines.push('Database: LOCAL ONLY')
  lines.push(`TARGET_ASIN: ${targetAsin}`)

  return lines
}

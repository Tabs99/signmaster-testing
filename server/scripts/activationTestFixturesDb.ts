import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyActivationEligibility } from '../services/activationVerification.ts'
import {
  ACTIVATION_TEST_FIXTURE_LAST_AMAZON_UPDATE,
  ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID,
  ACTIVATION_TEST_RESET_ORDER_IDS,
  ACTIVATION_TEST_SEED_ORDER_IDS,
  assertOnlyActivationTestResetOrderIds,
  buildActivationTestOrderSeeds,
  getActivationTestFixtureExpectations,
  type ActivationTestOrderSeed,
  type ActivationTestResetOrderId,
} from './activationTestFixturesLocalHelpers.ts'

export const FIXTURE_DELETE_TABLES_IN_ORDER = [
  'activation_continuations',
  'activation_contexts',
  'app_entitlements',
  'amazon_order_items',
  'amazon_orders',
] as const

export type FixtureDeleteTable = (typeof FIXTURE_DELETE_TABLES_IN_ORDER)[number]

export function fixtureCleanupOrderIds(
  orderIds: readonly ActivationTestResetOrderId[] = ACTIVATION_TEST_RESET_ORDER_IDS,
): readonly ActivationTestResetOrderId[] {
  assertOnlyActivationTestResetOrderIds(orderIds)
  return orderIds
}

export async function deleteActivationTestFixtures(
  client: SupabaseClient,
  orderIds: readonly ActivationTestResetOrderId[] = ACTIVATION_TEST_RESET_ORDER_IDS,
): Promise<void> {
  const safeOrderIds = [...fixtureCleanupOrderIds(orderIds)]

  if (safeOrderIds.length !== ACTIVATION_TEST_RESET_ORDER_IDS.length) {
    throw new Error(
      `Refusing fixture cleanup: expected ${ACTIVATION_TEST_RESET_ORDER_IDS.length} reserved order IDs, got ${safeOrderIds.length}`,
    )
  }

  for (const table of FIXTURE_DELETE_TABLES_IN_ORDER) {
    const result = await client
      .from(table)
      .delete()
      .in('amazon_order_id', safeOrderIds)

    if (result.error) {
      throw new Error(
        `Failed to delete fixture rows from ${table}: ${result.error.message}`,
      )
    }
  }
}

async function upsertOrderSeed(
  client: SupabaseClient,
  seed: ActivationTestOrderSeed,
  claimOwnerUserId: string | null,
): Promise<void> {
  const orderResult = await client.from('amazon_orders').upsert({
    amazon_order_id: seed.orderId,
    purchase_date: null,
    fulfillment_status: seed.fulfillmentStatus,
    last_amazon_update: ACTIVATION_TEST_FIXTURE_LAST_AMAZON_UPDATE,
  })

  if (orderResult.error) {
    throw new Error(
      `Failed to upsert fixture order ${seed.orderId}: ${orderResult.error.message}`,
    )
  }

  for (const item of seed.items) {
    const itemResult = await client.from('amazon_order_items').upsert({
      order_item_id: item.orderItemId,
      amazon_order_id: seed.orderId,
      asin: item.asin,
      sku: item.sku,
      quantity_ordered: item.quantityOrdered,
      quantity_fulfilled: item.quantityFulfilled,
      quantity_returned: item.quantityReturned,
    })

    if (itemResult.error) {
      throw new Error(
        `Failed to upsert fixture item ${item.orderItemId}: ${itemResult.error.message}`,
      )
    }
  }

  if (seed.createEntitlement) {
    if (!claimOwnerUserId) {
      throw new Error('Claim owner user id is required for ALREADY_CLAIMED seed')
    }

    const entitlementResult = await client.from('app_entitlements').upsert(
      {
        amazon_order_id: seed.orderId,
        user_id: claimOwnerUserId,
        status: 'active',
      },
      { onConflict: 'amazon_order_id' },
    )

    if (entitlementResult.error) {
      throw new Error(
        `Failed to upsert fixture entitlement for ${seed.orderId}: ${entitlementResult.error.message}`,
      )
    }
  } else {
    const removeEntitlement = await client
      .from('app_entitlements')
      .delete()
      .eq('amazon_order_id', seed.orderId)

    if (removeEntitlement.error) {
      throw new Error(
        `Failed to clear fixture entitlement for ${seed.orderId}: ${removeEntitlement.error.message}`,
      )
    }
  }
}

export async function upsertActivationTestFixtures(
  client: SupabaseClient,
  targetAsin: string,
  claimOwnerUserId: string | null,
): Promise<void> {
  const seeds = buildActivationTestOrderSeeds(targetAsin)

  for (const seed of seeds) {
    await upsertOrderSeed(
      client,
      seed,
      seed.createEntitlement ? claimOwnerUserId : null,
    )
  }
}

export async function countNonFixtureAmazonOrders(
  client: SupabaseClient,
): Promise<number> {
  const totalResult = await client
    .from('amazon_orders')
    .select('amazon_order_id', { count: 'exact', head: true })

  if (totalResult.error) {
    throw new Error(
      `Failed to count amazon_orders rows: ${totalResult.error.message}`,
    )
  }

  const fixtureResult = await client
    .from('amazon_orders')
    .select('amazon_order_id', { count: 'exact', head: true })
    .in('amazon_order_id', [...ACTIVATION_TEST_RESET_ORDER_IDS])

  if (fixtureResult.error) {
    throw new Error(
      `Failed to count fixture amazon_orders rows: ${fixtureResult.error.message}`,
    )
  }

  return (totalResult.count ?? 0) - (fixtureResult.count ?? 0)
}

export async function verifyActivationTestFixturesViaService(
  targetAsin: string,
  client: SupabaseClient,
): Promise<void> {
  for (const fixture of getActivationTestFixtureExpectations()) {
    const result = await verifyActivationEligibility(fixture.orderId, {
      supabaseClient: client,
      targetAsin,
    })

    if (result.status !== fixture.expectedStatus) {
      throw new Error(
        `Fixture ${fixture.orderId} expected ${fixture.expectedStatus}, got ${result.status}`,
      )
    }
  }
}

export async function verifyReservedFixtureOrdersPresent(
  client: SupabaseClient,
): Promise<void> {
  for (const orderId of ACTIVATION_TEST_SEED_ORDER_IDS) {
    const result = await client
      .from('amazon_orders')
      .select('amazon_order_id')
      .eq('amazon_order_id', orderId)
      .maybeSingle()

    if (result.error) {
      throw new Error(
        `Failed to verify seeded fixture order ${orderId}: ${result.error.message}`,
      )
    }

    if (!result.data) {
      throw new Error(`Expected seeded fixture order ${orderId} to exist`)
    }
  }
}

export async function verifyAbsentNotFoundFixtureOrder(
  client: SupabaseClient,
): Promise<void> {
  const absentOrderResult = await client
    .from('amazon_orders')
    .select('amazon_order_id')
    .eq('amazon_order_id', ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID)
    .maybeSingle()

  if (absentOrderResult.error) {
    throw new Error(
      `Failed to verify absent NOT_FOUND fixture: ${absentOrderResult.error.message}`,
    )
  }

  if (absentOrderResult.data) {
    throw new Error(
      `Expected ${ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID} to remain absent`,
    )
  }
}

export async function seedActivationTestFixtures(
  client: SupabaseClient,
  targetAsin: string,
  claimOwnerUserId: string,
): Promise<{ nonFixtureOrderCount: number }> {
  const nonFixtureOrderCountBefore = await countNonFixtureAmazonOrders(client)

  await deleteActivationTestFixtures(client)
  await verifyAbsentNotFoundFixtureOrder(client)

  await upsertActivationTestFixtures(client, targetAsin, claimOwnerUserId)
  await verifyActivationTestFixturesViaService(targetAsin, client)

  const nonFixtureOrderCountAfter = await countNonFixtureAmazonOrders(client)

  if (nonFixtureOrderCountBefore !== nonFixtureOrderCountAfter) {
    throw new Error(
      `Non-fixture amazon_orders count changed (${nonFixtureOrderCountBefore} → ${nonFixtureOrderCountAfter})`,
    )
  }

  return { nonFixtureOrderCount: nonFixtureOrderCountAfter }
}

export async function cleanupActivationTestFixtures(
  client: SupabaseClient,
): Promise<{ nonFixtureOrderCount: number }> {
  const nonFixtureOrderCountBefore = await countNonFixtureAmazonOrders(client)

  await deleteActivationTestFixtures(client)
  await verifyAbsentNotFoundFixtureOrder(client)

  const nonFixtureOrderCountAfter = await countNonFixtureAmazonOrders(client)

  if (nonFixtureOrderCountBefore !== nonFixtureOrderCountAfter) {
    throw new Error(
      `Non-fixture amazon_orders count changed during cleanup (${nonFixtureOrderCountBefore} → ${nonFixtureOrderCountAfter})`,
    )
  }

  return { nonFixtureOrderCount: nonFixtureOrderCountAfter }
}

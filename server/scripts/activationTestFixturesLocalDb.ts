import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActivationTargetAsin } from '../activation/config.ts'
import { verifyActivationEligibility } from '../services/activationVerification.ts'
import {
  assertLocalSupabaseUrl,
  getSupabaseConfig,
} from '../supabase/config.ts'
import { createServiceRoleClientFromEnv } from '../supabase/client.ts'
import {
  ACTIVATION_TEST_FIXTURE_AUTH_EMAIL,
  ACTIVATION_TEST_FIXTURE_LAST_AMAZON_UPDATE,
  ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID,
  ACTIVATION_TEST_RESET_ORDER_IDS,
  ACTIVATION_TEST_SEED_ORDER_IDS,
  buildActivationTestOrderSeeds,
  buildFixtureCleanupSqlStatements,
  getActivationTestFixtureExpectations,
  type ActivationTestOrderSeed,
} from './activationTestFixturesLocalHelpers.ts'

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export function assertLocalActivationFixtureEnvironment(): {
  supabaseUrl: string
  targetAsin: string
} {
  const supabaseConfig = getSupabaseConfig()
  assertLocalSupabaseUrl(supabaseConfig.url)

  return {
    supabaseUrl: supabaseConfig.url,
    targetAsin: getActivationTargetAsin(),
  }
}

export function runLocalSupabaseSql(sql: string): void {
  execSync(`npx supabase db query --local ${JSON.stringify(sql)}`, {
    stdio: 'pipe',
    cwd: PROJECT_ROOT,
  })
}

export async function getOrCreateActivationFixtureAuthUserId(
  client: SupabaseClient,
): Promise<string> {
  const listResult = await client.auth.admin.listUsers({ page: 1, perPage: 1000 })

  if (listResult.error) {
    throw new Error(
      `Failed to list local fixture auth users: ${listResult.error.message}`,
    )
  }

  const existingUser = listResult.data.users.find(
    (user) => user.email?.toLowerCase() === ACTIVATION_TEST_FIXTURE_AUTH_EMAIL,
  )

  if (existingUser?.id) {
    return existingUser.id
  }

  const createResult = await client.auth.admin.createUser({
    email: ACTIVATION_TEST_FIXTURE_AUTH_EMAIL,
    email_confirm: true,
    user_metadata: {
      signmaster_fixture: 'activation-test-local',
    },
  })

  if (createResult.error || !createResult.data.user?.id) {
    throw new Error(
      `Failed to create local fixture auth user: ${createResult.error?.message ?? 'missing user id'}`,
    )
  }

  return createResult.data.user.id
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

export function cleanupActivationTestFixturesLocal(): void {
  for (const sql of buildFixtureCleanupSqlStatements()) {
    runLocalSupabaseSql(sql)
  }
}

async function upsertOrderSeed(
  client: SupabaseClient,
  seed: ActivationTestOrderSeed,
  fixtureAuthUserId: string | null,
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
    if (!fixtureAuthUserId) {
      throw new Error('Fixture auth user is required for ALREADY_CLAIMED seed')
    }

    const entitlementResult = await client.from('app_entitlements').upsert(
      {
        amazon_order_id: seed.orderId,
        user_id: fixtureAuthUserId,
        status: 'active',
      },
      { onConflict: 'amazon_order_id' },
    )

    if (entitlementResult.error) {
      throw new Error(
        `Failed to upsert fixture entitlement for ${seed.orderId}: ${entitlementResult.error.message}`,
      )
    }
  }
}

export async function seedActivationTestFixturesLocal(): Promise<{
  targetAsin: string
  nonFixtureOrderCount: number
}> {
  const { targetAsin } = assertLocalActivationFixtureEnvironment()
  const client = createServiceRoleClientFromEnv()

  const nonFixtureOrderCountBefore = await countNonFixtureAmazonOrders(client)

  cleanupActivationTestFixturesLocal()

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
      `Expected ${ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID} to remain absent after cleanup`,
    )
  }

  const fixtureAuthUserId = await getOrCreateActivationFixtureAuthUserId(client)
  const seeds = buildActivationTestOrderSeeds(targetAsin)

  for (const seed of seeds) {
    await upsertOrderSeed(
      client,
      seed,
      seed.createEntitlement ? fixtureAuthUserId : null,
    )
  }

  await verifyActivationTestFixturesViaService(targetAsin)

  const nonFixtureOrderCountAfter = await countNonFixtureAmazonOrders(client)

  if (nonFixtureOrderCountBefore !== nonFixtureOrderCountAfter) {
    throw new Error(
      `Non-fixture amazon_orders count changed (${nonFixtureOrderCountBefore} → ${nonFixtureOrderCountAfter})`,
    )
  }

  return {
    targetAsin,
    nonFixtureOrderCount: nonFixtureOrderCountAfter,
  }
}

export async function verifyActivationTestFixturesViaService(
  targetAsin: string,
): Promise<void> {
  const client = createServiceRoleClientFromEnv()

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

export async function verifyReservedFixtureOrdersPresent(): Promise<void> {
  const client = createServiceRoleClientFromEnv()

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

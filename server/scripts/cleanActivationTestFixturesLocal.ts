import {
  ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID,
  ACTIVATION_TEST_SEED_ORDER_IDS,
} from './activationTestFixturesLocalHelpers.ts'
import {
  assertLocalActivationFixtureEnvironment,
  cleanupActivationTestFixturesLocal,
} from './activationTestFixturesLocalDb.ts'
import { createServiceRoleClientFromEnv } from '../supabase/client.ts'

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'unknown error'
}

async function main(): Promise<void> {
  assertLocalActivationFixtureEnvironment()

  cleanupActivationTestFixturesLocal()

  const client = createServiceRoleClientFromEnv()
  const absentOrderResult = await client
    .from('amazon_orders')
    .select('amazon_order_id')
    .eq('amazon_order_id', ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID)
    .maybeSingle()

  if (absentOrderResult.error) {
    throw new Error(
      `Failed to verify fixture cleanup: ${absentOrderResult.error.message}`,
    )
  }

  if (absentOrderResult.data) {
    throw new Error(
      `Expected reserved fixture orders to be removed, but ${ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID} still exists`,
    )
  }

  for (const orderId of ACTIVATION_TEST_SEED_ORDER_IDS) {
    const result = await client
      .from('amazon_orders')
      .select('amazon_order_id')
      .eq('amazon_order_id', orderId)
      .maybeSingle()

    if (result.error) {
      throw new Error(
        `Failed to verify fixture cleanup for ${orderId}: ${result.error.message}`,
      )
    }

    if (result.data) {
      throw new Error(`Expected fixture order ${orderId} to be removed`)
    }
  }

  console.log('Activation test fixture cleanup completed')
  console.log(
    'Dedicated local fixture auth user (if created) was left in place for idempotent reuse',
  )
}

main().catch((error: unknown) => {
  console.error(formatError(error))
  process.exitCode = 1
})

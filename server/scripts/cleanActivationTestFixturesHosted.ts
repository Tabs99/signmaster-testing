import { createServiceRoleClientFromEnv } from '../supabase/client.ts'
import { cleanupActivationTestFixtures } from './activationTestFixturesDb.ts'
import { assertHostedActivationFixtureEnvironment } from './activationTestFixturesHostedGuards.ts'
import { logHostedFixtureOperationIntent } from './activationTestFixturesHostedLogging.ts'
import {
  ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID,
  ACTIVATION_TEST_SEED_ORDER_IDS,
} from './activationTestFixturesLocalHelpers.ts'

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'unknown error'
}

async function main(): Promise<void> {
  const { projectRef, targetAsin } = assertHostedActivationFixtureEnvironment()
  logHostedFixtureOperationIntent({ operation: 'clean', projectRef, targetAsin })

  const client = createServiceRoleClientFromEnv()

  const { nonFixtureOrderCount } = await cleanupActivationTestFixtures(client)

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

  console.log('Hosted activation test fixture cleanup completed')
  console.log(`Supabase project: ${projectRef}`)
  console.log(
    `Non-fixture amazon_orders preserved: ${nonFixtureOrderCount} row(s) unchanged`,
  )
  console.log(
    `Reserved absent NOT_FOUND order ${ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID} remains absent`,
  )
  console.log(
    'Fixture auth user: NOT removed (entitlements for 333 are deleted; auth.users row is kept for idempotent re-seed).',
  )
  console.log(
    `To remove the dedicated hosted fixture user later: delete auth user with email activation-fixture-hosted@example.invalid via Supabase Dashboard, or set SIGNMASTER_ACTIVATION_FIXTURE_CLAIM_OWNER_USER_ID to your own smoke UUID.`,
  )
}

main().catch((error: unknown) => {
  console.error(formatError(error))
  process.exitCode = 1
})

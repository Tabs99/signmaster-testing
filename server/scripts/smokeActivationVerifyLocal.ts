import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getActivationTargetAsin } from '../activation/config.ts'
import {
  assertLocalSupabaseUrl,
  getSupabaseConfig,
} from '../supabase/config.ts'
import { createServiceRoleClientFromEnv } from '../supabase/client.ts'
import {
  resolveSmokeApiBase,
  shouldAttemptFixtureCleanup,
  type SmokeFixtureState,
} from './smokeActivationVerifyLocalHelpers.ts'

const FAKE_ORDER_ID = '888-8888888-8888888'
const FAKE_ITEM_ID = 'smoke-task2-eligible-item'

function createEmptyFixtureState(): SmokeFixtureState {
  return { orderCreated: false, itemCreated: false }
}

async function assertEligibleSmoke(apiBase: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/activation/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: FAKE_ORDER_ID }),
  })

  const body = (await response.json()) as { status?: string }

  console.log('ELIGIBLE smoke:', response.status, body)

  if (response.status !== 200 || body.status !== 'ELIGIBLE') {
    throw new Error(
      `Expected 200 ELIGIBLE for ${FAKE_ORDER_ID}, got ${response.status} ${JSON.stringify(body)}`,
    )
  }
}

async function assertInvalidOrderIdSmoke(apiBase: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/activation/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'not-valid' }),
  })

  const body = (await response.json()) as { error?: string }

  console.log('INVALID_ORDER_ID smoke:', response.status, body)

  if (response.status !== 400 || body.error !== 'INVALID_ORDER_ID') {
    throw new Error(
      `Expected 400 INVALID_ORDER_ID, got ${response.status} ${JSON.stringify(body)}`,
    )
  }
}

async function insertFixture(
  targetAsin: string,
  fixtureState: SmokeFixtureState,
): Promise<void> {
  const client = createServiceRoleClientFromEnv()
  const now = new Date().toISOString()

  const orderResult = await client.from('amazon_orders').upsert({
    amazon_order_id: FAKE_ORDER_ID,
    purchase_date: null,
    fulfillment_status: 'SHIPPED',
    last_amazon_update: now,
  })

  if (orderResult.error) {
    throw new Error(
      `Failed to insert smoke amazon_orders row: ${orderResult.error.message}`,
    )
  }

  fixtureState.orderCreated = true

  const itemResult = await client.from('amazon_order_items').upsert({
    order_item_id: FAKE_ITEM_ID,
    amazon_order_id: FAKE_ORDER_ID,
    asin: targetAsin,
    sku: 'SMOKE-TASK2-FIXTURE',
    quantity_ordered: 1,
    quantity_fulfilled: 1,
    quantity_returned: 0,
  })

  if (itemResult.error) {
    throw new Error(
      `Failed to insert smoke amazon_order_items row: ${itemResult.error.message}`,
    )
  }

  fixtureState.itemCreated = true
}

async function deleteFixtureViaLocalPostgres(): Promise<void> {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
  const runLocalQuery = (sql: string): void => {
    execSync(`npx supabase db query --local ${JSON.stringify(sql)}`, {
      stdio: 'pipe',
      cwd: projectRoot,
    })
  }

  runLocalQuery(
    `delete from public.app_entitlements where amazon_order_id = '${FAKE_ORDER_ID}';`,
  )
  runLocalQuery(
    `delete from public.amazon_order_items where order_item_id = '${FAKE_ITEM_ID}';`,
  )
  runLocalQuery(
    `delete from public.amazon_orders where amazon_order_id = '${FAKE_ORDER_ID}';`,
  )

  const client = createServiceRoleClientFromEnv()
  const verifyResult = await client
    .from('amazon_orders')
    .select('amazon_order_id')
    .eq('amazon_order_id', FAKE_ORDER_ID)
    .maybeSingle()

  if (verifyResult.error) {
    throw new Error(
      `Failed to verify smoke fixture cleanup: ${verifyResult.error.message}`,
    )
  }

  if (verifyResult.data) {
    throw new Error(`Smoke fixture order ${FAKE_ORDER_ID} still exists after cleanup`)
  }

  console.log('Fixture cleanup confirmed')
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'unknown error'
}

async function main(): Promise<void> {
  const supabaseConfig = getSupabaseConfig()
  assertLocalSupabaseUrl(supabaseConfig.url)
  console.log('Using local Supabase at', supabaseConfig.url)

  const apiBase = resolveSmokeApiBase(process.env.SMOKE_API_BASE)
  console.log('Using local API base', apiBase)

  const targetAsin = getActivationTargetAsin()
  console.log('Using TARGET_ASIN', targetAsin)

  const fixtureState = createEmptyFixtureState()
  let smokeError: unknown

  try {
    await deleteFixtureViaLocalPostgres()
    await insertFixture(targetAsin, fixtureState)
    await assertEligibleSmoke(apiBase)
    await assertInvalidOrderIdSmoke(apiBase)
  } catch (error) {
    smokeError = error
  } finally {
    if (shouldAttemptFixtureCleanup(fixtureState)) {
      try {
        await deleteFixtureViaLocalPostgres()
      } catch (cleanupError) {
        const cleanupMessage = formatError(cleanupError)

        if (smokeError) {
          smokeError = new Error(
            `${formatError(smokeError)}; fixture cleanup also failed: ${cleanupMessage}`,
          )
        } else {
          smokeError = new Error(`Fixture cleanup failed: ${cleanupMessage}`)
        }
      }
    }
  }

  if (smokeError) {
    throw smokeError
  }

  console.log('Local activation verify smoke passed')
}

main().catch((error: unknown) => {
  console.error(formatError(error))
  process.exitCode = 1
})

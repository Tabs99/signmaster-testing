import { hasLwaCredentials } from '../amazon/lwaConfig.ts'
import { getSpApiConfig, hasSpApiSearchConfig } from '../amazon/spApiConfig.ts'
import { SearchOrdersError } from '../amazon/searchOrdersError.ts'
import { LwaAuthError } from '../amazon/lwaAuth.ts'
import { runAmazonOrderSync } from '../services/amazonOrderSync.ts'
import { AmazonOrderPersistenceError } from '../services/amazonOrderPersistence.ts'
import { SyncStateError } from '../services/syncStateService.ts'
import { getOrdersCheckpoint } from '../services/syncStateService.ts'
import {
  assertLocalSupabaseUrl,
  getSupabaseConfig,
  hasSupabaseConfig,
  LOCAL_TASK3_REFUSAL_MESSAGE,
} from '../supabase/config.ts'
import { createServiceRoleClientFromEnv } from '../supabase/client.ts'

async function getLocalDatabaseSummary(targetAsin: string): Promise<{
  amazonOrders: number
  amazonOrderItems: number
  targetAsinItems: number
  checkpointExists: boolean
  checkpointTimestamp: string | null
}> {
  const client = createServiceRoleClientFromEnv()

  const [ordersResult, itemsResult, targetAsinResult] = await Promise.all([
    client.from('amazon_orders').select('*', { count: 'exact', head: true }),
    client.from('amazon_order_items').select('*', { count: 'exact', head: true }),
    client
      .from('amazon_order_items')
      .select('*', { count: 'exact', head: true })
      .eq('asin', targetAsin),
  ])

  if (ordersResult.error || itemsResult.error || targetAsinResult.error) {
    throw new AmazonOrderPersistenceError(
      'Failed to read local Supabase table counts',
    )
  }

  const checkpoint = await getOrdersCheckpoint(client)

  return {
    amazonOrders: ordersResult.count ?? 0,
    amazonOrderItems: itemsResult.count ?? 0,
    targetAsinItems: targetAsinResult.count ?? 0,
    checkpointExists: checkpoint !== null,
    checkpointTimestamp: checkpoint?.lastSuccessfulSyncAt ?? null,
  }
}

async function main(): Promise<void> {
  if (!hasLwaCredentials() || !hasSpApiSearchConfig()) {
    console.log(
      'Skipping Amazon incremental sync: Amazon credentials not configured in .env.local',
    )
    return
  }

  if (!hasSupabaseConfig()) {
    console.log(
      'Skipping Amazon incremental sync: Supabase credentials not configured in .env.local',
    )
    return
  }

  const supabaseConfig = getSupabaseConfig()

  try {
    assertLocalSupabaseUrl(supabaseConfig.url)
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
    } else {
      console.error(LOCAL_TASK3_REFUSAL_MESSAGE)
    }
    process.exitCode = 1
    return
  }

  const spApiConfig = getSpApiConfig()
  const client = createServiceRoleClientFromEnv()

  try {
    const result = await runAmazonOrderSync({
      env: process.env,
      supabaseClient: client,
      fetchFn: fetch,
    })

    console.log('Amazon incremental sync successful')
    console.log('')
    console.log(`Target ASIN: ${spApiConfig.targetAsin}`)
    console.log('')
    console.log(`Sync mode: ${result.syncMode}`)
    console.log(`Query from: ${result.queryFrom}`)
    console.log(`Sync started at: ${result.syncStartedAt}`)
    console.log('')
    console.log(`Pages fetched: ${result.pagesFetched}`)
    console.log(`Orders inspected: ${result.ordersInspected}`)
    console.log(`Matching orders: ${result.matchingOrders}`)
    console.log(`Matching items: ${result.matchingItems}`)
    console.log('')
    console.log(`Orders upserted: ${result.ordersUpserted}`)
    console.log(`Items upserted: ${result.itemsUpserted}`)
    console.log('')
    console.log(
      `Checkpoint updated: ${result.checkpointUpdated ? 'yes' : 'no'}`,
    )

    const summary = await getLocalDatabaseSummary(spApiConfig.targetAsin)
    console.log('')
    console.log(`Local amazon_orders rows: ${summary.amazonOrders}`)
    console.log(`Local amazon_order_items rows: ${summary.amazonOrderItems}`)
    console.log(
      `Local amazon_order_items rows for target ASIN: ${summary.targetAsinItems}`,
    )
    console.log(
      `orders_checkpoint exists: ${summary.checkpointExists ? 'yes' : 'no'}`,
    )
    if (summary.checkpointTimestamp) {
      console.log(`orders_checkpoint timestamp: ${summary.checkpointTimestamp}`)
    }
  } catch (error) {
    if (
      error instanceof SearchOrdersError ||
      error instanceof LwaAuthError ||
      error instanceof AmazonOrderPersistenceError ||
      error instanceof SyncStateError
    ) {
      console.error(error.message)
    } else if (error instanceof Error) {
      console.error(`Amazon incremental sync failed: ${error.message}`)
    } else {
      console.error('Amazon incremental sync failed: unexpected error')
    }

    process.exitCode = 1
  }
}

void main()

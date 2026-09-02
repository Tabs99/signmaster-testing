import { hasLwaCredentials } from '../amazon/lwaConfig.ts'
import { countMatchingItems, filterOrdersByTargetAsin } from '../amazon/orderFilter.ts'
import { getSpApiConfig, hasSpApiSearchConfig } from '../amazon/spApiConfig.ts'
import {
  getDefaultLastUpdatedAfter,
  searchRecentFbaOrders,
} from '../amazon/searchOrders.ts'
import { SearchOrdersError } from '../amazon/searchOrdersError.ts'
import { LwaAuthError } from '../amazon/lwaAuth.ts'
import {
  AmazonOrderPersistenceError,
  persistAmazonOrders,
} from '../services/amazonOrderPersistence.ts'
import {
  assertLocalSupabaseUrl,
  getSupabaseConfig,
  hasSupabaseConfig,
  LOCAL_TASK3_REFUSAL_MESSAGE,
} from '../supabase/config.ts'
import { createServiceRoleClientFromEnv } from '../supabase/client.ts'

async function getLocalTableCounts(targetAsin: string): Promise<{
  amazonOrders: number
  amazonOrderItems: number
  targetAsinItems: number
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

  return {
    amazonOrders: ordersResult.count ?? 0,
    amazonOrderItems: itemsResult.count ?? 0,
    targetAsinItems: targetAsinResult.count ?? 0,
  }
}

async function main(): Promise<void> {
  if (!hasLwaCredentials() || !hasSpApiSearchConfig()) {
    console.log(
      'Skipping Amazon → local Supabase sync: Amazon credentials not configured in .env.local',
    )
    return
  }

  if (!hasSupabaseConfig()) {
    console.log(
      'Skipping Amazon → local Supabase sync: Supabase credentials not configured in .env.local',
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

  try {
    const fetchResult = await searchRecentFbaOrders(
      process.env,
      fetch,
      getDefaultLastUpdatedAfter(),
    )
    const matchingOrders = filterOrdersByTargetAsin(
      fetchResult.orders,
      spApiConfig.targetAsin,
    )
    const matchingItems = countMatchingItems(matchingOrders)
    const supabaseClient = createServiceRoleClientFromEnv()
    const persistResult = await persistAmazonOrders(matchingOrders, supabaseClient)

    console.log('Amazon → local Supabase sync successful')
    console.log('')
    console.log(`Target ASIN: ${spApiConfig.targetAsin}`)
    console.log('')
    console.log(`Pages fetched: ${fetchResult.pagesFetched}`)
    console.log(`Orders inspected: ${fetchResult.ordersInspected}`)
    console.log(`Matching orders: ${matchingOrders.length}`)
    console.log(`Matching items: ${matchingItems}`)
    console.log('')
    console.log(`Orders upserted: ${persistResult.ordersUpserted}`)
    console.log(`Items upserted: ${persistResult.itemsUpserted}`)

    const counts = await getLocalTableCounts(spApiConfig.targetAsin)
    console.log('')
    console.log(`Local amazon_orders rows: ${counts.amazonOrders}`)
    console.log(`Local amazon_order_items rows: ${counts.amazonOrderItems}`)
    console.log(
      `Local amazon_order_items rows for target ASIN: ${counts.targetAsinItems}`,
    )
  } catch (error) {
    if (
      error instanceof SearchOrdersError ||
      error instanceof LwaAuthError ||
      error instanceof AmazonOrderPersistenceError
    ) {
      console.error(error.message)
    } else if (error instanceof Error) {
      console.error(`Amazon → local Supabase sync failed: ${error.message}`)
    } else {
      console.error('Amazon → local Supabase sync failed: unexpected error')
    }

    process.exitCode = 1
  }
}

void main()

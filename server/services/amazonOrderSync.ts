import {
  countMatchingItems,
  filterOrdersByTargetAsin,
} from '../amazon/orderFilter.ts'
import { getSpApiConfig } from '../amazon/spApiConfig.ts'
import { searchRecentFbaOrders } from '../amazon/searchOrders.ts'
import {
  persistAmazonOrders,
  type SupabaseUpsertClient,
} from './amazonOrderPersistence.ts'
import {
  getOrdersCheckpoint,
  saveOrdersCheckpoint,
  type SyncStateWriteClient,
} from './syncStateService.ts'

export const INITIAL_ORDER_SYNC_LOOKBACK_DAYS = 7
export const ORDER_SYNC_OVERLAP_MINUTES = 5

export type AmazonOrderSyncMode = 'initial' | 'incremental'

export interface AmazonOrderSyncResult {
  syncMode: AmazonOrderSyncMode
  queryFrom: string
  syncStartedAt: string
  pagesFetched: number
  ordersInspected: number
  matchingOrders: number
  matchingItems: number
  ordersUpserted: number
  itemsUpserted: number
  checkpointUpdated: boolean
  checkpointSavedAt: string | null
}

export interface AmazonOrderSyncClient
  extends SupabaseUpsertClient,
    SyncStateWriteClient {}

export interface RunAmazonOrderSyncOptions {
  env?: NodeJS.ProcessEnv
  supabaseClient: AmazonOrderSyncClient
  fetchFn?: typeof fetch
  now?: Date
}

export function calculateLastUpdatedAfter(
  syncStartedAt: Date,
  checkpointLastSuccessfulSyncAt: string | null,
): { lastUpdatedAfter: string; syncMode: AmazonOrderSyncMode } {
  if (!checkpointLastSuccessfulSyncAt) {
    const queryFrom = new Date(syncStartedAt)
    queryFrom.setUTCDate(
      queryFrom.getUTCDate() - INITIAL_ORDER_SYNC_LOOKBACK_DAYS,
    )

    return {
      lastUpdatedAfter: queryFrom.toISOString(),
      syncMode: 'initial',
    }
  }

  const checkpointTime = Date.parse(checkpointLastSuccessfulSyncAt)
  const queryFrom = new Date(
    checkpointTime - ORDER_SYNC_OVERLAP_MINUTES * 60 * 1000,
  )

  return {
    lastUpdatedAfter: queryFrom.toISOString(),
    syncMode: 'incremental',
  }
}

export async function runAmazonOrderSync(
  options: RunAmazonOrderSyncOptions,
): Promise<AmazonOrderSyncResult> {
  const env = options.env ?? process.env
  const fetchFn = options.fetchFn ?? fetch
  const syncStartedAtDate = options.now ?? new Date()
  const syncStartedAt = syncStartedAtDate.toISOString()
  const spApiConfig = getSpApiConfig(env)

  const checkpoint = await getOrdersCheckpoint(options.supabaseClient)
  const { lastUpdatedAfter, syncMode } = calculateLastUpdatedAfter(
    syncStartedAtDate,
    checkpoint?.lastSuccessfulSyncAt ?? null,
  )

  const fetchResult = await searchRecentFbaOrders(
    env,
    fetchFn,
    lastUpdatedAfter,
  )
  const matchingOrders = filterOrdersByTargetAsin(
    fetchResult.orders,
    spApiConfig.targetAsin,
  )
  const matchingItems = countMatchingItems(matchingOrders)
  const persistResult = await persistAmazonOrders(
    matchingOrders,
    options.supabaseClient,
  )

  await saveOrdersCheckpoint(options.supabaseClient, syncStartedAt)

  return {
    syncMode,
    queryFrom: lastUpdatedAfter,
    syncStartedAt,
    pagesFetched: fetchResult.pagesFetched,
    ordersInspected: fetchResult.ordersInspected,
    matchingOrders: matchingOrders.length,
    matchingItems,
    ordersUpserted: persistResult.ordersUpserted,
    itemsUpserted: persistResult.itemsUpserted,
    checkpointUpdated: true,
    checkpointSavedAt: syncStartedAt,
  }
}

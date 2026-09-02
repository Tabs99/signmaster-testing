import { hasLwaCredentials } from '../amazon/lwaConfig.ts'
import { countMatchingItems, filterOrdersByTargetAsin } from '../amazon/orderFilter.ts'
import { getSpApiConfig, hasSpApiSearchConfig } from '../amazon/spApiConfig.ts'
import {
  getDefaultLastUpdatedAfter,
  searchRecentFbaOrders,
} from '../amazon/searchOrders.ts'
import { SearchOrdersError } from '../amazon/searchOrdersError.ts'
import { LwaAuthError } from '../amazon/lwaAuth.ts'

async function main(): Promise<void> {
  if (!hasLwaCredentials() || !hasSpApiSearchConfig()) {
    console.log(
      'Skipping live Amazon order search: credentials not configured in .env.local',
    )
    return
  }

  const config = getSpApiConfig()

  try {
    const fetchResult = await searchRecentFbaOrders(
      process.env,
      fetch,
      getDefaultLastUpdatedAfter(),
    )
    const matchingOrders = filterOrdersByTargetAsin(
      fetchResult.orders,
      config.targetAsin,
    )
    const matchingItems = countMatchingItems(matchingOrders)

    console.log('Amazon order search successful')
    console.log('')
    console.log(`Target ASIN: ${config.targetAsin}`)
    console.log('')
    console.log(`Pages fetched: ${fetchResult.pagesFetched}`)
    console.log(`Orders inspected: ${fetchResult.ordersInspected}`)
    console.log(`Matching orders: ${matchingOrders.length}`)
    console.log(`Matching items: ${matchingItems}`)
  } catch (error) {
    if (error instanceof SearchOrdersError || error instanceof LwaAuthError) {
      console.error(error.message)
    } else if (error instanceof Error) {
      console.error(`Amazon order search failed: ${error.message}`)
    } else {
      console.error('Amazon order search failed: unexpected error')
    }

    process.exitCode = 1
  }
}

void main()

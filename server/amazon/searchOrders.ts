import { getLwaAccessToken } from './lwaAuth.ts'
import type {
  AmazonSearchOrder,
  SearchOrdersFetchResult,
  SearchOrdersPageResponse,
} from './ordersTypes.ts'
import { getSpApiConfig } from './spApiConfig.ts'
import {
  getSafeSearchOrdersErrorMessage,
  SearchOrdersError,
} from './searchOrdersError.ts'

const ORDERS_API_VERSION = '2026-01-01'
const SEARCH_ORDERS_PATH = `/orders/${ORDERS_API_VERSION}/orders`

export interface FetchSearchOrdersPageOptions {
  endpoint: string
  marketplaceId: string
  accessToken: string
  lastUpdatedAfter: string
  paginationToken?: string
}

export interface FetchAllSearchOrdersOptions {
  endpoint: string
  marketplaceId: string
  accessToken: string
  lastUpdatedAfter: string
}

export function buildSearchOrdersUrl(
  options: FetchSearchOrdersPageOptions,
): URL {
  const url = new URL(`${options.endpoint}${SEARCH_ORDERS_PATH}`)

  url.searchParams.set('marketplaceIds', options.marketplaceId)
  url.searchParams.set('fulfilledBy', 'AMAZON')
  url.searchParams.set('includedData', 'FULFILLMENT')
  url.searchParams.set('lastUpdatedAfter', options.lastUpdatedAfter)

  if (options.paginationToken) {
    url.searchParams.set('paginationToken', options.paginationToken)
  }

  return url
}

export function getDefaultLastUpdatedAfter(days = 7): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString()
}

export async function fetchSearchOrdersPage(
  options: FetchSearchOrdersPageOptions,
  fetchFn: typeof fetch = fetch,
): Promise<SearchOrdersPageResponse> {
  const url = buildSearchOrdersUrl(options)

  const response = await fetchFn(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-amz-access-token': options.accessToken,
    },
  })

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new SearchOrdersError(
      getSafeSearchOrdersErrorMessage(data, response.status),
      response.status,
    )
  }

  return parseSearchOrdersPageResponse(data)
}

export async function fetchAllSearchOrders(
  options: FetchAllSearchOrdersOptions,
  fetchFn: typeof fetch = fetch,
): Promise<SearchOrdersFetchResult> {
  const orders: AmazonSearchOrder[] = []
  let paginationToken: string | undefined
  let pagesFetched = 0
  const seenPaginationTokens = new Set<string>()

  do {
    const page = await fetchSearchOrdersPage(
      {
        ...options,
        paginationToken,
      },
      fetchFn,
    )

    pagesFetched += 1
    orders.push(...page.orders)

    if (page.nextToken) {
      if (seenPaginationTokens.has(page.nextToken)) {
        throw new SearchOrdersError(
          'Amazon searchOrders returned a repeated pagination token',
        )
      }

      seenPaginationTokens.add(page.nextToken)
    }

    paginationToken = page.nextToken
  } while (paginationToken)

  return {
    pagesFetched,
    ordersInspected: orders.length,
    orders,
  }
}

export async function searchRecentFbaOrders(
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch,
  lastUpdatedAfter: string = getDefaultLastUpdatedAfter(),
): Promise<SearchOrdersFetchResult> {
  const config = getSpApiConfig(env)
  const { accessToken } = await getLwaAccessToken(env, fetchFn)

  return fetchAllSearchOrders(
    {
      endpoint: config.endpoint,
      marketplaceId: config.marketplaceId,
      accessToken,
      lastUpdatedAfter,
    },
    fetchFn,
  )
}

function parseSearchOrdersPageResponse(data: unknown): SearchOrdersPageResponse {
  if (!data || typeof data !== 'object') {
    throw new SearchOrdersError(
      'Amazon searchOrders returned an unexpected response structure',
    )
  }

  if (!('orders' in data) || !Array.isArray(data.orders)) {
    throw new SearchOrdersError(
      'Amazon searchOrders returned an unexpected response structure',
    )
  }

  const orders = data.orders

  let nextToken: string | undefined

  if (
    'pagination' in data &&
    data.pagination &&
    typeof data.pagination === 'object' &&
    'nextToken' in data.pagination &&
    typeof data.pagination.nextToken === 'string' &&
    data.pagination.nextToken.trim()
  ) {
    nextToken = data.pagination.nextToken
  }

  return {
    orders,
    nextToken,
  }
}

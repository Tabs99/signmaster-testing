import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSearchOrdersUrl,
  fetchAllSearchOrders,
  fetchSearchOrdersPage,
} from '../searchOrders.ts'
import { SearchOrdersError } from '../searchOrdersError.ts'
import { getMissingSpApiEnvVars, getSpApiConfig } from '../spApiConfig.ts'

const endpoint = 'https://sellingpartnerapi-eu.amazon.com'
const marketplaceId = 'A1F83G8C2ARO7P'
const accessToken = 'Atza|test-access-token'
const lastUpdatedAfter = '2026-01-01T00:00:00.000Z'

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('spApiConfig', () => {
  it('reports missing SP-API environment variables', () => {
    expect(getMissingSpApiEnvVars({})).toEqual([
      'SP_API_ENDPOINT',
      'SP_API_MARKETPLACE_ID',
      'TARGET_ASIN',
    ])
  })

  it('throws a clear error when SP-API environment variables are missing', () => {
    expect(() => getSpApiConfig({})).toThrow(
      'Missing required Amazon SP-API environment variables: SP_API_ENDPOINT, SP_API_MARKETPLACE_ID, TARGET_ASIN',
    )
  })
})

describe('searchOrders', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds the searchOrders request with the required query parameters', () => {
    const url = buildSearchOrdersUrl({
      endpoint,
      marketplaceId,
      accessToken,
      lastUpdatedAfter,
    })

    expect(url.origin + url.pathname).toBe(
      'https://sellingpartnerapi-eu.amazon.com/orders/2026-01-01/orders',
    )
    expect(url.searchParams.get('marketplaceIds')).toBe(marketplaceId)
    expect(url.searchParams.get('fulfilledBy')).toBe('AMAZON')
    expect(url.searchParams.get('includedData')).toBe('FULFILLMENT')
    expect(url.searchParams.get('lastUpdatedAfter')).toBe(lastUpdatedAfter)
    expect(url.searchParams.has('paginationToken')).toBe(false)
  })

  it('includes paginationToken on follow-up requests', () => {
    const url = buildSearchOrdersUrl({
      endpoint,
      marketplaceId,
      accessToken,
      lastUpdatedAfter,
      paginationToken: 'page-2-token',
    })

    expect(url.searchParams.get('paginationToken')).toBe('page-2-token')
  })

  it('sends the access token header without logging it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        orders: [],
        pagination: {},
      }),
    )

    await fetchSearchOrdersPage(
      {
        endpoint,
        marketplaceId,
        accessToken,
        lastUpdatedAfter,
      },
      fetchMock,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-amz-access-token': accessToken,
        }),
      }),
    )
  })

  it('fetches and combines all paginated pages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          orders: [{ orderId: 'order-page-1' }],
          pagination: { nextToken: 'page-2-token' },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          orders: [{ orderId: 'order-page-2' }],
          pagination: {},
        }),
      )

    const result = await fetchAllSearchOrders(
      {
        endpoint,
        marketplaceId,
        accessToken,
        lastUpdatedAfter,
      },
      fetchMock,
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.pagesFetched).toBe(2)
    expect(result.ordersInspected).toBe(2)
    expect(result.orders.map((order) => order.orderId)).toEqual([
      'order-page-1',
      'order-page-2',
    ])
  })

  it('rejects the whole operation when a later page fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          orders: [{ orderId: 'order-page-1' }],
          pagination: { nextToken: 'page-2-token' },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            errors: [{ message: 'Rate limit exceeded' }],
          },
          429,
        ),
      )

    await expect(
      fetchAllSearchOrders(
        {
          endpoint,
          marketplaceId,
          accessToken,
          lastUpdatedAfter,
        },
        fetchMock,
      ),
    ).rejects.toMatchObject({
      name: 'SearchOrdersError',
      message: 'Amazon searchOrders failed with status 429: Rate limit exceeded',
      statusCode: 429,
    })
  })

  it('handles Amazon error responses without exposing credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse(
        {
          errors: [{ message: 'The access token is invalid.' }],
        },
        401,
      ),
    )

    await expect(
      fetchSearchOrdersPage(
        {
          endpoint,
          marketplaceId,
          accessToken: 'Atza|secret-access-token-value',
          lastUpdatedAfter,
        },
        fetchMock,
      ),
    ).rejects.toSatisfy((error: SearchOrdersError) => {
      expect(error.message).toBe(
        'Amazon searchOrders failed with status 401: The access token is invalid.',
      )
      expect(error.message).not.toContain('Atza|secret-access-token-value')
      expect(error.message).not.toContain('refresh')
      expect(error.message).not.toContain('client_secret')
      return true
    })
  })

  it('handles invalid JSON responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('not-json', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    await expect(
      fetchSearchOrdersPage(
        {
          endpoint,
          marketplaceId,
          accessToken,
          lastUpdatedAfter,
        },
        fetchMock,
      ),
    ).rejects.toMatchObject({
      name: 'SearchOrdersError',
      message: 'Amazon searchOrders failed with status 500',
      statusCode: 500,
    })
  })

  it('accepts a successful response with an empty orders array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        orders: [],
        pagination: {},
      }),
    )

    const result = await fetchSearchOrdersPage(
      {
        endpoint,
        marketplaceId,
        accessToken,
        lastUpdatedAfter,
      },
      fetchMock,
    )

    expect(result.orders).toEqual([])
    expect(result.nextToken).toBeUndefined()
  })

  it('rejects a successful response when the orders property is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        pagination: {},
      }),
    )

    await expect(
      fetchSearchOrdersPage(
        {
          endpoint,
          marketplaceId,
          accessToken,
          lastUpdatedAfter,
        },
        fetchMock,
      ),
    ).rejects.toThrow(
      'Amazon searchOrders returned an unexpected response structure',
    )
  })

  it('rejects a successful response when orders is not an array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        orders: {},
        pagination: {},
      }),
    )

    await expect(
      fetchSearchOrdersPage(
        {
          endpoint,
          marketplaceId,
          accessToken,
          lastUpdatedAfter,
        },
        fetchMock,
      ),
    ).rejects.toThrow(
      'Amazon searchOrders returned an unexpected response structure',
    )
  })

  it('rejects repeated pagination tokens', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          orders: [{ orderId: 'order-page-1' }],
          pagination: { nextToken: 'same-token' },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          orders: [{ orderId: 'order-page-2' }],
          pagination: { nextToken: 'same-token' },
        }),
      )

    await expect(
      fetchAllSearchOrders(
        {
          endpoint,
          marketplaceId,
          accessToken,
          lastUpdatedAfter,
        },
        fetchMock,
      ),
    ).rejects.toMatchObject({
      name: 'SearchOrdersError',
      message: 'Amazon searchOrders returned a repeated pagination token',
    })
  })

  it('handles unexpected successful response structures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse(null, 200))

    await expect(
      fetchSearchOrdersPage(
        {
          endpoint,
          marketplaceId,
          accessToken,
          lastUpdatedAfter,
        },
        fetchMock,
      ),
    ).rejects.toThrow(
      'Amazon searchOrders returned an unexpected response structure',
    )
  })
})

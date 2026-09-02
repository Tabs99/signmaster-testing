import type {
  NormalizedAmazonOrder,
  NormalizedAmazonOrderItem,
} from '../amazon/ordersTypes.ts'

export interface AmazonOrderRow {
  amazon_order_id: string
  purchase_date: string | null
  fulfillment_status: string
  last_amazon_update: string
}

export interface AmazonOrderItemRow {
  order_item_id: string
  amazon_order_id: string
  asin: string
  sku: string | null
  quantity_ordered: number
  quantity_fulfilled: number
  quantity_returned: number
}

export interface PersistAmazonOrdersResult {
  ordersUpserted: number
  itemsUpserted: number
}

export class AmazonOrderPersistenceError extends Error {
  readonly supabaseCode?: string

  constructor(message: string, supabaseCode?: string) {
    super(message)
    this.name = 'AmazonOrderPersistenceError'
    this.supabaseCode = supabaseCode
  }
}

export interface SupabaseUpsertError {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export interface SupabaseUpsertResult {
  error: SupabaseUpsertError | null
}

export interface SupabaseUpsertQuery {
  upsert(
    values: unknown,
    options?: { onConflict?: string },
  ): PromiseLike<SupabaseUpsertResult>
}

export interface SupabaseUpsertClient {
  from(table: 'amazon_orders' | 'amazon_order_items'): SupabaseUpsertQuery
}

export function mapOrderToRow(order: NormalizedAmazonOrder): AmazonOrderRow {
  return {
    amazon_order_id: order.amazonOrderId,
    purchase_date: order.purchaseDate,
    fulfillment_status: order.fulfillmentStatus,
    last_amazon_update: order.lastAmazonUpdate,
  }
}

export function mapItemToRow(
  order: NormalizedAmazonOrder,
  item: NormalizedAmazonOrderItem,
): AmazonOrderItemRow {
  return {
    order_item_id: item.orderItemId,
    amazon_order_id: order.amazonOrderId,
    asin: item.asin,
    sku: item.sku,
    quantity_ordered: item.quantityOrdered,
    quantity_fulfilled: item.quantityFulfilled,
    quantity_returned: 0,
  }
}

export function mapOrdersToRows(
  matchingOrders: NormalizedAmazonOrder[],
): AmazonOrderRow[] {
  return matchingOrders.map(mapOrderToRow)
}

export function mapItemsToRows(
  matchingOrders: NormalizedAmazonOrder[],
): AmazonOrderItemRow[] {
  return matchingOrders.flatMap((order) =>
    order.items.map((item) => mapItemToRow(order, item)),
  )
}

const AMAZON_ORDER_ID_PATTERN = /\d{3}-\d{7}-\d{7}/g

function sanitizeSupabaseErrorMessage(message: string | undefined): string {
  if (!message?.trim()) {
    return 'Unknown Supabase error'
  }

  return message.trim().replace(AMAZON_ORDER_ID_PATTERN, '[REDACTED]')
}

function formatUpsertFailureMessage(
  operation: 'Amazon order upsert failed' | 'Amazon order item upsert failed',
  error: SupabaseUpsertError,
): string {
  const safeMessage = sanitizeSupabaseErrorMessage(error.message)
  const codeSuffix = error.code ? ` [${error.code}]` : ''

  return `${operation}${codeSuffix}: ${safeMessage}`
}

export async function persistAmazonOrders(
  matchingOrders: NormalizedAmazonOrder[],
  client: SupabaseUpsertClient,
): Promise<PersistAmazonOrdersResult> {
  if (matchingOrders.length === 0) {
    return {
      ordersUpserted: 0,
      itemsUpserted: 0,
    }
  }

  const orderRows = mapOrdersToRows(matchingOrders)
  const orderResult = await client
    .from('amazon_orders')
    .upsert(orderRows, { onConflict: 'amazon_order_id' })

  if (orderResult.error) {
    throw new AmazonOrderPersistenceError(
      formatUpsertFailureMessage('Amazon order upsert failed', orderResult.error),
      orderResult.error.code,
    )
  }

  const itemRows = mapItemsToRows(matchingOrders)

  if (itemRows.length === 0) {
    return {
      ordersUpserted: orderRows.length,
      itemsUpserted: 0,
    }
  }

  const itemResult = await client
    .from('amazon_order_items')
    .upsert(itemRows, { onConflict: 'order_item_id' })

  if (itemResult.error) {
    throw new AmazonOrderPersistenceError(
      formatUpsertFailureMessage(
        'Amazon order item upsert failed',
        itemResult.error,
      ),
      itemResult.error.code,
    )
  }

  return {
    ordersUpserted: orderRows.length,
    itemsUpserted: itemRows.length,
  }
}

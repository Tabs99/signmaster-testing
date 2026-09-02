import { SearchOrdersError } from './searchOrdersError.ts'
import type {
  AmazonSearchOrder,
  AmazonSearchOrderItem,
  NormalizedAmazonOrder,
  NormalizedAmazonOrderItem,
} from './ordersTypes.ts'

const INVALID_ORDER_STRUCTURE =
  'Amazon searchOrders returned an invalid order structure'

function assertNonEmptyString(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SearchOrdersError(INVALID_ORDER_STRUCTURE)
  }
}

export function validateOrderForNormalization(
  order: AmazonSearchOrder,
  items: AmazonSearchOrderItem[],
): void {
  assertNonEmptyString(order.orderId)
  assertNonEmptyString(order.lastUpdatedTime)
  assertNonEmptyString(order.fulfillment?.fulfillmentStatus)

  for (const item of items) {
    assertNonEmptyString(item.orderItemId)
    assertNonEmptyString(item.product?.asin)
  }
}

export function mapAmazonOrderItem(
  item: AmazonSearchOrderItem,
): NormalizedAmazonOrderItem {
  return {
    orderItemId: item.orderItemId ?? '',
    asin: item.product?.asin ?? '',
    sku: item.product?.sellerSku ?? null,
    quantityOrdered: item.quantityOrdered ?? 0,
    quantityFulfilled: item.fulfillment?.quantityFulfilled ?? 0,
  }
}

export function mapAmazonOrder(
  order: AmazonSearchOrder,
  items: AmazonSearchOrderItem[],
): NormalizedAmazonOrder {
  validateOrderForNormalization(order, items)

  return {
    amazonOrderId: order.orderId!.trim(),
    purchaseDate: order.createdTime ?? null,
    fulfillmentStatus: order.fulfillment!.fulfillmentStatus!.trim(),
    lastAmazonUpdate: order.lastUpdatedTime!.trim(),
    items: items.map(mapAmazonOrderItem),
  }
}

import { mapAmazonOrder } from './orderMapper.ts'
import type {
  AmazonSearchOrder,
  NormalizedAmazonOrder,
} from './ordersTypes.ts'

export function filterOrdersByTargetAsin(
  orders: AmazonSearchOrder[],
  targetAsin: string,
): NormalizedAmazonOrder[] {
  return orders.flatMap((order) => {
    const matchingItems = (order.orderItems ?? []).filter(
      (item) => item.product?.asin === targetAsin,
    )

    if (matchingItems.length === 0) {
      return []
    }

    return [mapAmazonOrder(order, matchingItems)]
  })
}

export function countMatchingItems(orders: NormalizedAmazonOrder[]): number {
  return orders.reduce((total, order) => total + order.items.length, 0)
}

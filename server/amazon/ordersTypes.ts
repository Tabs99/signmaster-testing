export interface AmazonSearchOrderItem {
  orderItemId?: string
  quantityOrdered?: number
  product?: {
    asin?: string
    sellerSku?: string
  }
  fulfillment?: {
    quantityFulfilled?: number
  }
}

export interface AmazonSearchOrder {
  orderId?: string
  createdTime?: string
  lastUpdatedTime?: string
  fulfillment?: {
    fulfillmentStatus?: string
    fulfilledBy?: string
  }
  orderItems?: AmazonSearchOrderItem[]
}

export interface SearchOrdersPageResponse {
  orders: AmazonSearchOrder[]
  nextToken?: string
}

export interface SearchOrdersFetchResult {
  pagesFetched: number
  ordersInspected: number
  orders: AmazonSearchOrder[]
}

export interface NormalizedAmazonOrderItem {
  orderItemId: string
  asin: string
  sku: string | null
  quantityOrdered: number
  quantityFulfilled: number
}

export interface NormalizedAmazonOrder {
  amazonOrderId: string
  purchaseDate: string | null
  fulfillmentStatus: string | null
  lastAmazonUpdate: string | null
  items: NormalizedAmazonOrderItem[]
}

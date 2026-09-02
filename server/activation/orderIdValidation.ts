export const AMAZON_ORDER_ID_PATTERN = /^\d{3}-\d{7}-\d{7}$/

export function isValidAmazonOrderId(value: string): boolean {
  return AMAZON_ORDER_ID_PATTERN.test(value.trim())
}

export function normalizeAmazonOrderId(value: string): string {
  return value.trim()
}

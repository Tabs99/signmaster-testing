export const ORDER_ID_PATTERN = /^\d{3}-\d{7}-\d{7}$/

export const VALIDATION_MESSAGES = {
  orderIdRequired: 'Enter your Amazon order number.',
  orderIdInvalid:
    "That doesn't look like an Amazon order number. It has 17 digits, for example 205-1234567-1234567.",
} as const

export function countOrderIdDigits(value: string): number {
  return value.replace(/\D/g, '').length
}

/** True when the raw input (before display truncation) contains exactly 17 digits. */
export function isExactSeventeenDigitSource(raw: string): boolean {
  return countOrderIdDigits(raw) === 17
}

export function isValidOrderId(value: string): boolean {
  return ORDER_ID_PATTERN.test(value.trim())
}

export function validateOrderId(value: string): string | null {
  const trimmed = value.trim()

  if (!trimmed) {
    return VALIDATION_MESSAGES.orderIdRequired
  }

  if (!ORDER_ID_PATTERN.test(trimmed)) {
    return VALIDATION_MESSAGES.orderIdInvalid
  }

  return null
}

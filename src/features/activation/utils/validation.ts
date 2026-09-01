export const ORDER_ID_PATTERN = /^\d{3}-\d{7}-\d{7}$/
export const UK_POSTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i

export const VALIDATION_MESSAGES = {
  orderIdRequired:
    'Enter a valid Amazon Order ID, for example 202-1234567-8901234.',
  orderIdInvalid:
    'Enter a valid Amazon Order ID, for example 202-1234567-8901234.',
  postcodeRequired:
    'Enter a valid UK delivery postcode, for example AA1 1AA.',
  postcodeInvalid:
    'Enter a valid UK delivery postcode, for example AA1 1AA.',
} as const

export function isValidOrderId(value: string): boolean {
  return ORDER_ID_PATTERN.test(value.trim())
}

export function isValidPostcode(value: string): boolean {
  return UK_POSTCODE_PATTERN.test(value.trim())
}

export function validateOrderId(value: string): string | null {
  const trimmed = value.trim()

  if (!trimmed || !ORDER_ID_PATTERN.test(trimmed)) {
    return trimmed
      ? VALIDATION_MESSAGES.orderIdInvalid
      : VALIDATION_MESSAGES.orderIdRequired
  }

  return null
}

export function validatePostcode(value: string): string | null {
  const trimmed = value.trim()

  if (!trimmed || !UK_POSTCODE_PATTERN.test(trimmed)) {
    return trimmed
      ? VALIDATION_MESSAGES.postcodeInvalid
      : VALIDATION_MESSAGES.postcodeRequired
  }

  return null
}

export interface ActivationFormValues {
  orderId: string
  postcode: string
}

export interface ActivationFormErrors {
  orderId?: string
  postcode?: string
}

export function validateActivationForm(
  values: ActivationFormValues,
): ActivationFormErrors {
  const errors: ActivationFormErrors = {}

  const orderIdError = validateOrderId(values.orderId)
  if (orderIdError) {
    errors.orderId = orderIdError
  }

  const postcodeError = validatePostcode(values.postcode)
  if (postcodeError) {
    errors.postcode = postcodeError
  }

  return errors
}

export function shouldSimulateVerificationFailure(
  orderId: string,
  postcode: string,
): boolean {
  return orderId.startsWith('000') || postcode.startsWith('XX')
}

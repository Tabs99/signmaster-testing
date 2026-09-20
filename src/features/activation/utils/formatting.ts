import {
  countOrderIdDigits,
  isExactSeventeenDigitSource,
  isOrderIdRawSourceWithinLimit,
  isValidOrderId,
} from './validation'

export const CLIPBOARD_NO_ORDER_ID_MESSAGE =
  'No Amazon Order ID found in your clipboard.' as const

const MAX_ORDER_ID_DIGITS = 17

export type ProcessedOrderIdInput = {
  value: string
  autoVerifyEligible: boolean
  sourceWithinDigitLimit: boolean
}

/** Single path for keyboard, paste, and clipboard button input. */
export function processOrderIdInput(
  raw: string,
  options: { trim?: boolean } = {},
): ProcessedOrderIdInput {
  const autoVerifyEligible = isExactSeventeenDigitSource(raw)
  const source = options.trim ? raw.trim() : raw
  return {
    value: formatOrderId(source),
    autoVerifyEligible,
    sourceWithinDigitLimit: isOrderIdRawSourceWithinLimit(raw),
  }
}

export function formatOrderId(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_ORDER_ID_DIGITS)

  if (digits.length <= 3) {
    return digits
  }

  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
}

export function normalisePastedOrderId(raw: string): string {
  return processOrderIdInput(raw, { trim: true }).value
}

/**
 * Dedicated clipboard Paste button: accept only a complete 17-digit Amazon Order ID.
 * Native keyboard paste continues to use {@link processOrderIdInput} directly.
 */
export function parseCompleteOrderIdFromClipboard(raw: string): ProcessedOrderIdInput | null {
  const trimmed = raw.trim()
  if (!trimmed || countOrderIdDigits(trimmed) !== 17) {
    return null
  }

  const processed = processOrderIdInput(raw, { trim: true })
  if (!isValidOrderId(processed.value)) {
    return null
  }

  return processed
}

export function isClipboardPasteSupported(): boolean {
  return (
    typeof globalThis.navigator !== 'undefined' &&
    globalThis.isSecureContext === true &&
    typeof globalThis.navigator.clipboard?.readText === 'function'
  )
}

export function countDigitsBeforeIndex(formatted: string, index: number): number {
  let count = 0
  const clamped = Math.max(0, Math.min(index, formatted.length))

  for (let i = 0; i < clamped; i++) {
    const char = formatted[i]
    if (char >= '0' && char <= '9') {
      count++
    }
  }

  return count
}

export function cursorPositionAfterDigits(formatted: string, digitCount: number): number {
  if (digitCount <= 0) {
    return 0
  }

  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    const char = formatted[i]
    if (char >= '0' && char <= '9') {
      seen++
      if (seen === digitCount) {
        return i + 1
      }
    }
  }

  return formatted.length
}

export function insertOrderIdDigit(
  formattedValue: string,
  digit: string,
  selectionStart: number,
  selectionEnd: number,
): string {
  const digits = formattedValue.replace(/\D/g, '')
  const digitStart = countDigitsBeforeIndex(formattedValue, selectionStart)
  const digitEnd = countDigitsBeforeIndex(formattedValue, selectionEnd)
  const nextDigits = `${digits.slice(0, digitStart)}${digit}${digits.slice(digitEnd)}`.slice(
    0,
    MAX_ORDER_ID_DIGITS,
  )

  return formatOrderId(nextDigits)
}

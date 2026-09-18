import { describe, expect, it } from 'vitest'
import {
  cursorPositionAfterDigits,
  formatOrderId,
  insertOrderIdDigit,
  normalisePastedOrderId,
} from '../formatting'
import {
  countOrderIdDigits,
  isExactSeventeenDigitSource,
  isValidOrderId,
  validateOrderId,
  VALIDATION_MESSAGES,
} from '../validation'

describe('validation', () => {
  describe('validateOrderId', () => {
    it('returns required message for empty values', () => {
      expect(validateOrderId('')).toBe(VALIDATION_MESSAGES.orderIdRequired)
      expect(validateOrderId('   ')).toBe(VALIDATION_MESSAGES.orderIdRequired)
    })

    it('returns invalid message for malformed order IDs', () => {
      expect(validateOrderId('111-111111-1111111')).toBe(
        VALIDATION_MESSAGES.orderIdInvalid,
      )
      expect(validateOrderId('205-12345')).toBe(VALIDATION_MESSAGES.orderIdInvalid)
    })

    it('returns null for valid order IDs', () => {
      expect(validateOrderId('111-1111111-1111111')).toBeNull()
      expect(isValidOrderId('111-1111111-1111111')).toBe(true)
    })
  })

  describe('countOrderIdDigits', () => {
    it('counts digits regardless of hyphens', () => {
      expect(countOrderIdDigits('205-1234567-1')).toBe(11)
      expect(countOrderIdDigits('205-1234567-1234567')).toBe(17)
    })
  })

  describe('isExactSeventeenDigitSource', () => {
    it('is true only when the raw source contains exactly 17 digits', () => {
      expect(isExactSeventeenDigitSource('205-1234567-1234567')).toBe(true)
      expect(isExactSeventeenDigitSource('Order # 205-1234567-1234567')).toBe(true)
      expect(isExactSeventeenDigitSource('20512345671234567')).toBe(true)
      expect(isExactSeventeenDigitSource('2051234567123456')).toBe(false)
      expect(isExactSeventeenDigitSource('205123456712345678')).toBe(false)
      expect(isExactSeventeenDigitSource('Order # 205-1234567-1234567 ref 99')).toBe(
        false,
      )
    })
  })
})

describe('formatting', () => {
  it('formats order IDs with hyphens', () => {
    expect(formatOrderId('20212345678901234')).toBe('202-1234567-8901234')
  })

  it('normalises pasted order IDs', () => {
    expect(normalisePastedOrderId('  20212345678901234  ')).toBe('202-1234567-8901234')
  })

  it('inserts digits for key-repeat at the current selection', () => {
    expect(insertOrderIdDigit('0', '0', 1, 1)).toBe('00')
    expect(insertOrderIdDigit('000-0', '0', 5, 5)).toBe('000-00')
    const fullOrderId = '205-1234567-1234567'
    expect(
      insertOrderIdDigit(fullOrderId, '9', fullOrderId.length, fullOrderId.length),
    ).toBe(fullOrderId)
  })

  it('places the caret after the inserted digit count', () => {
    expect(cursorPositionAfterDigits('000-0', 4)).toBe(5)
  })
})

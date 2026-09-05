import { describe, expect, it } from 'vitest'
import { formatOrderId, normalisePastedOrderId } from '../formatting'
import {
  countOrderIdDigits,
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
})

describe('formatting', () => {
  it('formats order IDs with hyphens', () => {
    expect(formatOrderId('20212345678901234')).toBe('202-1234567-8901234')
  })

  it('normalises pasted order IDs', () => {
    expect(normalisePastedOrderId('  20212345678901234  ')).toBe('202-1234567-8901234')
  })
})

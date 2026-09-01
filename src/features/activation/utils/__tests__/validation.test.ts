import { describe, expect, it } from 'vitest'
import { formatOrderId, normalisePostcode } from '../formatting'
import {
  isValidOrderId,
  isValidPostcode,
  validateActivationForm,
  validateOrderId,
  validatePostcode,
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
    })

    it('returns null for valid order IDs', () => {
      expect(validateOrderId('111-1111111-1111111')).toBeNull()
      expect(isValidOrderId('111-1111111-1111111')).toBe(true)
    })
  })

  describe('validatePostcode', () => {
    it('returns required message for empty values', () => {
      expect(validatePostcode('')).toBe(VALIDATION_MESSAGES.postcodeRequired)
    })

    it('returns invalid message for malformed postcodes', () => {
      expect(validatePostcode('INVALID')).toBe(
        VALIDATION_MESSAGES.postcodeInvalid,
      )
    })

    it('returns null for valid UK postcodes', () => {
      expect(validatePostcode('SW1A 1AA')).toBeNull()
      expect(validatePostcode('sw1a1aa')).toBeNull()
      expect(isValidPostcode('SW1A 1AA')).toBe(true)
    })
  })

  describe('validateActivationForm', () => {
    it('collects field-level errors', () => {
      expect(
        validateActivationForm({ orderId: '', postcode: '' }),
      ).toEqual({
        orderId: VALIDATION_MESSAGES.orderIdRequired,
        postcode: VALIDATION_MESSAGES.postcodeRequired,
      })
    })

    it('returns no errors for valid input', () => {
      expect(
        validateActivationForm({
          orderId: '111-1111111-1111111',
          postcode: 'SW1A 1AA',
        }),
      ).toEqual({})
    })
  })
})

describe('formatting', () => {
  it('formats order IDs with hyphens', () => {
    expect(formatOrderId('20212345678901234')).toBe('202-1234567-8901234')
  })

  it('normalises UK postcodes with a space', () => {
    expect(normalisePostcode('sw1a1aa')).toBe('SW1A 1AA')
  })
})

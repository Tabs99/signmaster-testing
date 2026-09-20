import { describe, expect, it } from 'vitest'
import {
  ACTIVATION_CLAIM_MAX_BODY_BYTES,
  isActivationClaimBodyAllowed,
  isActivationClaimBodyTooLarge,
} from '../claimRequestLimits.ts'

describe('activation claim request limits', () => {
  it('allows absent, null, or empty object bodies', () => {
    expect(isActivationClaimBodyAllowed(undefined)).toBe(true)
    expect(isActivationClaimBodyAllowed(null)).toBe(true)
    expect(isActivationClaimBodyAllowed({})).toBe(true)
  })

  it('rejects unexpected JSON properties', () => {
    expect(isActivationClaimBodyAllowed({ orderId: '123-1234567-1234567' })).toBe(false)
    expect(isActivationClaimBodyAllowed([])).toBe(false)
    expect(isActivationClaimBodyAllowed('')).toBe(false)
  })

  it('rejects oversized bodies', () => {
    expect(
      isActivationClaimBodyTooLarge(
        { 'content-length': String(ACTIVATION_CLAIM_MAX_BODY_BYTES + 1) },
        {},
      ),
    ).toBe(true)
  })
})

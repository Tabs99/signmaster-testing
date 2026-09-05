import { describe, expect, it } from 'vitest'
import {
  ActivationConfigError,
  getActivationTargetAsin,
} from '../config.ts'

describe('getActivationTargetAsin', () => {
  it('reads TARGET_ASIN from the environment', () => {
    expect(
      getActivationTargetAsin({
        TARGET_ASIN: 'B0H8ZRL6DK',
      }),
    ).toBe('B0H8ZRL6DK')
  })

  it('trims whitespace from TARGET_ASIN', () => {
    expect(
      getActivationTargetAsin({
        TARGET_ASIN: '  B0TEST12345  ',
      }),
    ).toBe('B0TEST12345')
  })

  it('rejects missing or blank TARGET_ASIN', () => {
    expect(() => getActivationTargetAsin({})).toThrow(ActivationConfigError)
    expect(() => getActivationTargetAsin({ TARGET_ASIN: '' })).toThrow(
      ActivationConfigError,
    )
    expect(() => getActivationTargetAsin({ TARGET_ASIN: '   ' })).toThrow(
      ActivationConfigError,
    )
  })

  it('does not require SP_API_ENDPOINT or SP_API_MARKETPLACE_ID', () => {
    expect(
      getActivationTargetAsin({
        TARGET_ASIN: 'B0TEST12345',
      }),
    ).toBe('B0TEST12345')
  })
})

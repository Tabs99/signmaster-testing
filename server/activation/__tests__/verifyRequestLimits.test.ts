import { describe, expect, it } from 'vitest'
import {
  ACTIVATION_VERIFY_MAX_BODY_BYTES,
  isActivationVerifyBodyTooLarge,
  parseContentLengthHeader,
} from '../verifyRequestLimits.ts'

describe('activation verify request limits', () => {
  it('parses Content-Length when present', () => {
    expect(parseContentLengthHeader({ 'content-length': '42' })).toBe(42)
    expect(parseContentLengthHeader({ 'content-length': 'bad' })).toBeNull()
  })

  it('rejects bodies over the max byte limit', () => {
    const hugeOrderId = '1'.repeat(ACTIVATION_VERIFY_MAX_BODY_BYTES)
    expect(
      isActivationVerifyBodyTooLarge(undefined, { orderId: hugeOrderId }),
    ).toBe(true)
  })

  it('accepts a normal verify payload size', () => {
    expect(
      isActivationVerifyBodyTooLarge(
        { 'content-length': '40' },
        { orderId: '123-1234567-1234567' },
      ),
    ).toBe(false)
  })

  it('rejects when Content-Length exceeds the limit even before parsing', () => {
    expect(
      isActivationVerifyBodyTooLarge(
        { 'content-length': String(ACTIVATION_VERIFY_MAX_BODY_BYTES + 1) },
        null,
      ),
    ).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { getActivationVerifyClientIp } from '../verifyClientIp.ts'

describe('getActivationVerifyClientIp', () => {
  it('prefers x-vercel-forwarded-for over other forwarding headers', () => {
    expect(
      getActivationVerifyClientIp({
        'x-vercel-forwarded-for': '198.51.100.22',
        'x-forwarded-for': '203.0.113.10, 70.41.3.18',
        'x-real-ip': '10.0.0.1',
      }),
    ).toBe('198.51.100.22')
  })

  it('uses x-vercel-forwarded-for as a single platform value (no comma splitting)', () => {
    expect(
      getActivationVerifyClientIp({
        'x-vercel-forwarded-for': '203.0.113.55',
      }),
    ).toBe('203.0.113.55')
  })

  it('uses the first x-forwarded-for hop when Vercel header is absent', () => {
    expect(
      getActivationVerifyClientIp({
        'x-forwarded-for': '203.0.113.10, 70.41.3.18',
      }),
    ).toBe('203.0.113.10')
  })

  it('falls back to x-real-ip when forwarding headers are absent', () => {
    expect(
      getActivationVerifyClientIp({
        'x-real-ip': '198.51.100.4',
      }),
    ).toBe('198.51.100.4')
  })

  it('returns unknown when no IP headers exist (local deterministic bucket)', () => {
    expect(getActivationVerifyClientIp({})).toBe('unknown')
    expect(getActivationVerifyClientIp(undefined)).toBe('unknown')
  })
})

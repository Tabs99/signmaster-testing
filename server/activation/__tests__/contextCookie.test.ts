import { describe, expect, it } from 'vitest'
import {
  ACTIVATION_CONTEXT_COOKIE_NAME,
  ACTIVATION_CONTEXT_LIFETIME_SECONDS,
  buildActivationContextClearCookie,
  buildActivationContextSetCookie,
  parseActivationContextCookie,
  shouldUseSecureActivationContextCookie,
} from '../contextCookie.ts'

describe('activation context cookie', () => {
  it('builds HttpOnly SameSite=Lax cookies with max age', () => {
    const cookie = buildActivationContextSetCookie('opaque-token-value', {
      secure: true,
      maxAgeSeconds: ACTIVATION_CONTEXT_LIFETIME_SECONDS,
    })

    expect(cookie).toContain(`${ACTIVATION_CONTEXT_COOKIE_NAME}=opaque-token-value`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain(`Max-Age=${ACTIVATION_CONTEXT_LIFETIME_SECONDS}`)
    expect(cookie).toContain('Secure')
  })

  it('parses the activation context cookie from a header', () => {
    const header = `other=value; ${ACTIVATION_CONTEXT_COOKIE_NAME}=abc123; another=1`

    expect(parseActivationContextCookie(header)).toBe('abc123')
    expect(parseActivationContextCookie(undefined)).toBeNull()
  })

  it('clears the activation context cookie', () => {
    const cookie = buildActivationContextClearCookie({ secure: false })

    expect(cookie).toContain(`${ACTIVATION_CONTEXT_COOKIE_NAME}=`)
    expect(cookie).toContain('Max-Age=0')
  })

  it('uses Secure cookies in production by default', () => {
    expect(
      shouldUseSecureActivationContextCookie({
        NODE_ENV: 'production',
      }),
    ).toBe(true)
    expect(
      shouldUseSecureActivationContextCookie({
        NODE_ENV: 'development',
      }),
    ).toBe(false)
  })
})

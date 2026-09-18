import { describe, expect, it } from 'vitest'
import { buildOAuthReturnUrl } from '../oauthRedirect'

describe('buildOAuthReturnUrl', () => {
  it('builds a path-only return URL on the app origin', () => {
    expect(
      buildOAuthReturnUrl({
        origin: 'https://signmastercards.co.uk',
        pathname: '/activate',
      }),
    ).toBe('https://signmastercards.co.uk/activate')
  })

  it('never includes query parameters', () => {
    const url = buildOAuthReturnUrl({
      origin: 'http://localhost:4200',
      pathname: '/activate',
    })
    expect(url).not.toContain('?')
    expect(url).not.toContain('#')
  })

  it('falls back to /sign-in for unknown paths', () => {
    expect(
      buildOAuthReturnUrl({
        origin: 'http://localhost:4200',
        pathname: '/evil?order=205-1234567-1234567',
      }),
    ).toBe('http://localhost:4200/sign-in')
  })
})

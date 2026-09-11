import { describe, expect, it } from 'vitest'
import {
  PASSWORD_RESET_ROUTE,
  buildPasswordResetRedirect,
} from '../passwordResetRedirect'

describe('buildPasswordResetRedirect', () => {
  it('points at the reset route on the provided origin with no query params', () => {
    const url = buildPasswordResetRedirect('https://signmastercards.co.uk')
    const parsed = new URL(url)

    expect(parsed.origin).toBe('https://signmastercards.co.uk')
    expect(parsed.pathname).toBe(PASSWORD_RESET_ROUTE)
    expect(parsed.search).toBe('')
  })

  it('carries no sensitive identifiers', () => {
    const url = buildPasswordResetRedirect('https://signmastercards.co.uk')

    expect(url).toBe('https://signmastercards.co.uk/reset-password')
    expect(url).not.toMatch(/token|order|user|entitlement|ref=/i)
  })

  it('falls back to window.location.origin when no origin is given', () => {
    const url = buildPasswordResetRedirect()
    const parsed = new URL(url)

    expect(parsed.origin).toBe(window.location.origin)
    expect(parsed.pathname).toBe(PASSWORD_RESET_ROUTE)
  })
})

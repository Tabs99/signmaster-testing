import { describe, expect, it } from 'vitest'
import {
  hasMinPasswordLength,
  hasNumberOrSymbol,
  isValidEmail,
  isValidPassword,
  passwordsMatch,
  shouldSimulateExistingAccount,
} from '../validation'

describe('account validation', () => {
  it('validates email addresses', () => {
    expect(isValidEmail('alex@example.com')).toBe(true)
    expect(isValidEmail('not-an-email')).toBe(false)
  })

  it('validates password requirements', () => {
    expect(hasMinPasswordLength('12345678')).toBe(true)
    expect(hasNumberOrSymbol('password1')).toBe(true)
    expect(isValidPassword('password1')).toBe(true)
    expect(isValidPassword('password')).toBe(false)
  })

  it('validates matching passwords', () => {
    expect(passwordsMatch('Secure123!', 'Secure123!')).toBe(true)
    expect(passwordsMatch('Secure123!', 'Secure123')).toBe(false)
  })

  it('detects demo existing-account emails', () => {
    expect(shouldSimulateExistingAccount('user+exists@example.com')).toBe(true)
    expect(shouldSimulateExistingAccount('alex@example.com')).toBe(false)
  })
})

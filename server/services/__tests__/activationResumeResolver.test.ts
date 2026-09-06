import { describe, expect, it } from 'vitest'
import { resolveActivationResumeState } from '../activationResumeResolver.ts'

describe('resolveActivationResumeState', () => {
  it('returns expired_context for expired activation contexts', () => {
    expect(
      resolveActivationResumeState({
        contextStatus: 'EXPIRED',
        auth: { isAuthenticated: false, isEmailConfirmed: false },
      }),
    ).toBe('expired_context')
  })

  it('returns confirmed_auth_no_context when signed in without context', () => {
    expect(
      resolveActivationResumeState({
        contextStatus: 'NONE',
        auth: { isAuthenticated: true, isEmailConfirmed: true },
      }),
    ).toBe('confirmed_auth_no_context')
  })

  it('returns valid_context_confirmed_auth when signed in with valid context', () => {
    expect(
      resolveActivationResumeState({
        contextStatus: 'VALID',
        auth: { isAuthenticated: true, isEmailConfirmed: true },
      }),
    ).toBe('valid_context_confirmed_auth')
  })

  it('returns valid_context_unconfirmed_auth for unconfirmed users', () => {
    expect(
      resolveActivationResumeState({
        contextStatus: 'VALID',
        auth: { isAuthenticated: true, isEmailConfirmed: false },
      }),
    ).toBe('valid_context_unconfirmed_auth')
  })

  it('returns signed_out_valid_context on sign-in path', () => {
    expect(
      resolveActivationResumeState({
        contextStatus: 'VALID',
        auth: { isAuthenticated: false, isEmailConfirmed: false },
        intent: 'sign_in',
      }),
    ).toBe('signed_out_valid_context')
  })

  it('returns valid_context on create-account path', () => {
    expect(
      resolveActivationResumeState({
        contextStatus: 'VALID',
        auth: { isAuthenticated: false, isEmailConfirmed: false },
        intent: 'create_account',
      }),
    ).toBe('valid_context')
  })
})

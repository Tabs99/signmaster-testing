import { describe, expect, it } from 'vitest'
import { resolveActivationResumeState } from '../activationResumeResolver.ts'

describe('frontend activationResumeResolver', () => {
  it('matches server resolver states for auth continuation', () => {
    expect(
      resolveActivationResumeState({
        contextStatus: 'VALID',
        auth: { isAuthenticated: true, isEmailConfirmed: true },
        intent: 'create_account',
      }),
    ).toBe('valid_context_confirmed_auth')
  })

  it('does not treat confirmed OAuth auth with EXPIRED context as claim-ready', () => {
    expect(
      resolveActivationResumeState({
        contextStatus: 'EXPIRED',
        auth: { isAuthenticated: true, isEmailConfirmed: true },
        intent: 'create_account',
      }),
    ).toBe('expired_context')
  })

  it('does not treat confirmed OAuth auth with NONE context as claim-ready', () => {
    expect(
      resolveActivationResumeState({
        contextStatus: 'NONE',
        auth: { isAuthenticated: true, isEmailConfirmed: true },
        intent: 'create_account',
      }),
    ).toBe('confirmed_auth_no_context')
  })
})

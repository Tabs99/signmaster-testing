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
})

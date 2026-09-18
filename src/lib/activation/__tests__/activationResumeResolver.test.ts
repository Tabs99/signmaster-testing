import { describe, expect, it } from 'vitest'
import {
  resolveActivationResumeState,
  type ActivationResumeAuthState,
  type ActivationResumeIntent,
} from '../activationResumeResolver.ts'

type Context = 'VALID' | 'EXPIRED' | 'NONE'

function resolve(
  contextStatus: Context,
  auth: ActivationResumeAuthState,
  intent: ActivationResumeIntent = 'generic',
) {
  return resolveActivationResumeState({ contextStatus, auth, intent })
}

/** Provider-agnostic resume matrix (CP8). OAuth/email differ only before confirmed auth. */
describe('frontend activationResumeResolver (CP8 identity matrix)', () => {
  const confirmed: ActivationResumeAuthState = {
    isAuthenticated: true,
    isEmailConfirmed: true,
  }
  const unconfirmed: ActivationResumeAuthState = {
    isAuthenticated: true,
    isEmailConfirmed: false,
  }
  const signedOut: ActivationResumeAuthState = {
    isAuthenticated: false,
    isEmailConfirmed: false,
  }

  it.each([
    ['A/B/C ACTIVE via app guard', 'NONE', confirmed, 'generic', 'confirmed_auth_no_context'],
    ['D claim path', 'VALID', confirmed, 'create_account', 'valid_context_confirmed_auth'],
    ['E no claim', 'EXPIRED', confirmed, 'create_account', 'expired_context'],
    ['F B10 path', 'NONE', confirmed, 'generic', 'confirmed_auth_no_context'],
    ['G idempotent claim server-side', 'VALID', confirmed, 'create_account', 'valid_context_confirmed_auth'],
    ['H NOT_ELIGIBLE server-side', 'VALID', confirmed, 'create_account', 'valid_context_confirmed_auth'],
    ['I conflict server-side', 'VALID', confirmed, 'create_account', 'valid_context_confirmed_auth'],
    ['J unclaimed eligible server-side', 'VALID', confirmed, 'create_account', 'valid_context_confirmed_auth'],
    ['K unconfirmed gate', 'VALID', unconfirmed, 'create_account', 'valid_context_unconfirmed_auth'],
    ['L confirmed after recheck', 'VALID', confirmed, 'create_account', 'valid_context_confirmed_auth'],
    ['M/N OAuth + EXPIRED', 'EXPIRED', confirmed, 'create_account', 'expired_context'],
    ['O/P provider identity irrelevant here', 'VALID', confirmed, 'sign_in', 'valid_context_confirmed_auth'],
    ['Q signed out valid ctx', 'VALID', signedOut, 'sign_in', 'signed_out_valid_context'],
    ['T EXPIRED before claim', 'EXPIRED', confirmed, 'create_account', 'expired_context'],
  ] as const)(
    'case %s → %s',
    (_label, context, auth, intent, expected) => {
      expect(resolve(context, auth, intent)).toBe(expected)
    },
  )

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

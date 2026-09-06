import { describe, expect, it } from 'vitest'
import { mapAuthError, mapSignUpError } from '../authErrors'
import { AUTH_MESSAGES } from '../types'

describe('mapAuthError', () => {
  it('maps invalid login credentials to a generic sign-in message', () => {
    expect(
      mapAuthError({ message: 'Invalid login credentials', code: 'invalid_credentials' }),
    ).toEqual({
      code: 'invalid_credentials',
      message: AUTH_MESSAGES.genericSignInError,
    })
  })

  it('maps unconfirmed email errors safely', () => {
    expect(mapAuthError({ message: 'Email not confirmed' })).toEqual({
      code: 'email_not_confirmed',
      message: AUTH_MESSAGES.emailConfirmationRequired,
    })
  })

  it('maps duplicate registration errors for sign-up flows', () => {
    expect(mapAuthError({ message: 'User already registered' })).toEqual({
      code: 'email_already_registered',
      message: AUTH_MESSAGES.emailAlreadyRegistered,
    })
  })

  it('maps network failures without exposing raw Supabase details', () => {
    expect(mapAuthError({ name: 'AuthRetryableFetchError', status: 0 })).toEqual({
      code: 'network_error',
      message: AUTH_MESSAGES.networkError,
    })
  })
})

describe('mapSignUpError', () => {
  it('uses sign-up generic copy for unknown failures', () => {
    expect(mapSignUpError({ message: 'Something unexpected happened' })).toEqual({
      code: 'unknown',
      message: AUTH_MESSAGES.genericSignUpError,
    })
  })
})

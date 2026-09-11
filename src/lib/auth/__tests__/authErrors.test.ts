import { describe, expect, it } from 'vitest'
import {
  categorisePasswordResetRequestError,
  categorisePasswordUpdateError,
  mapAuthError,
  mapSignUpError,
} from '../authErrors'
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

describe('categorisePasswordResetRequestError', () => {
  it('collapses account-not-found style errors to sent (anti-enumeration)', () => {
    expect(
      categorisePasswordResetRequestError({ message: 'User not found', status: 400 }),
    ).toBe('sent')
  })

  it('collapses non-object/undefined values to sent', () => {
    expect(categorisePasswordResetRequestError(undefined)).toBe('sent')
  })

  it('maps network failures to connection_error', () => {
    expect(
      categorisePasswordResetRequestError({ name: 'AuthRetryableFetchError', status: 0 }),
    ).toBe('connection_error')
  })

  it('maps 429 to rate_limited', () => {
    expect(
      categorisePasswordResetRequestError({ message: 'Rate limit', status: 429 }),
    ).toBe('rate_limited')
  })

  it('maps 5xx to service_unavailable', () => {
    expect(categorisePasswordResetRequestError({ status: 502 })).toBe(
      'service_unavailable',
    )
  })
})

describe('categorisePasswordUpdateError', () => {
  it('maps a missing session to invalid_recovery_session', () => {
    expect(
      categorisePasswordUpdateError({ name: 'AuthSessionMissingError', message: 'missing' }),
    ).toBe('invalid_recovery_session')
  })

  it('maps expired tokens to invalid_recovery_session', () => {
    expect(categorisePasswordUpdateError({ message: 'JWT expired', status: 401 })).toBe(
      'invalid_recovery_session',
    )
  })

  it('maps weak passwords to weak_password', () => {
    expect(
      categorisePasswordUpdateError({
        message: 'Password should be at least 6 characters',
        status: 422,
      }),
    ).toBe('weak_password')
  })

  it('maps network failures to connection_error', () => {
    expect(categorisePasswordUpdateError({ message: 'Failed to fetch' })).toBe(
      'connection_error',
    )
  })

  it('maps 5xx to service_unavailable', () => {
    expect(categorisePasswordUpdateError({ status: 500 })).toBe('service_unavailable')
  })

  it('falls back to unknown_error for unclassified failures', () => {
    expect(categorisePasswordUpdateError({ message: 'weird', status: 418 })).toBe(
      'unknown_error',
    )
  })
})

import { AUTH_MESSAGES, type AuthErrorCode, type SafeAuthError } from './types'

interface SupabaseLikeAuthError {
  message?: string
  status?: number
  code?: string
  name?: string
}

function normaliseMessage(error: SupabaseLikeAuthError): string {
  return error.message?.trim().toLowerCase() ?? ''
}

export function mapAuthError(error: unknown): SafeAuthError {
  if (!error || typeof error !== 'object') {
    return {
      code: 'unknown',
      message: AUTH_MESSAGES.genericSignInError,
    }
  }

  const authError = error as SupabaseLikeAuthError
  const message = normaliseMessage(authError)

  if (
    authError.name === 'AuthRetryableFetchError' ||
    authError.status === 0 ||
    message.includes('failed to fetch') ||
    message.includes('network')
  ) {
    return {
      code: 'network_error',
      message: AUTH_MESSAGES.networkError,
    }
  }

  if (
    message.includes('email not confirmed') ||
    message.includes('email confirmation')
  ) {
    return {
      code: 'email_not_confirmed',
      message: AUTH_MESSAGES.emailConfirmationRequired,
    }
  }

  if (
    message.includes('user already registered') ||
    message.includes('already been registered') ||
    authError.code === 'user_already_exists'
  ) {
    return {
      code: 'email_already_registered',
      message: AUTH_MESSAGES.emailAlreadyRegistered,
    }
  }

  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid email or password') ||
    authError.code === 'invalid_credentials'
  ) {
    return {
      code: 'invalid_credentials',
      message: AUTH_MESSAGES.genericSignInError,
    }
  }

  if (
    message.includes('password') &&
    (message.includes('weak') ||
      message.includes('short') ||
      message.includes('at least'))
  ) {
    return {
      code: 'weak_password',
      message: AUTH_MESSAGES.genericSignUpError,
    }
  }

  return {
    code: inferAuthErrorCode(authError),
    message: AUTH_MESSAGES.genericSignInError,
  }
}

function inferAuthErrorCode(error: SupabaseLikeAuthError): AuthErrorCode {
  if (error.code === 'invalid_credentials') {
    return 'invalid_credentials'
  }

  if (error.code === 'user_already_exists') {
    return 'email_already_registered'
  }

  return 'unknown'
}

export type PasswordResetRequestCategory =
  | 'sent'
  | 'rate_limited'
  | 'service_unavailable'
  | 'connection_error'

/**
 * Categorises the outcome of `resetPasswordForEmail`. Account-not-found never
 * errors in Supabase, so it already collapses to `sent`. Anything we cannot
 * confidently classify as a transient failure also collapses to `sent` so the
 * request flow can never reveal whether an account exists.
 */
export function categorisePasswordResetRequestError(
  error: unknown,
): PasswordResetRequestCategory {
  if (!error || typeof error !== 'object') {
    return 'sent'
  }

  const authError = error as SupabaseLikeAuthError
  const message = normaliseMessage(authError)

  if (
    authError.name === 'AuthRetryableFetchError' ||
    authError.status === 0 ||
    message.includes('failed to fetch') ||
    message.includes('network')
  ) {
    return 'connection_error'
  }

  if (authError.status === 429 || message.includes('rate limit')) {
    return 'rate_limited'
  }

  if (typeof authError.status === 'number' && authError.status >= 500) {
    return 'service_unavailable'
  }

  return 'sent'
}

export type PasswordUpdateCategory =
  | 'invalid_recovery_session'
  | 'weak_password'
  | 'service_unavailable'
  | 'connection_error'
  | 'unknown_error'

/**
 * Categorises the outcome of `updateUser({ password })` into safe, UI-friendly
 * buckets. Raw Supabase error text never propagates to the UI.
 */
export function categorisePasswordUpdateError(
  error: unknown,
): PasswordUpdateCategory {
  if (!error || typeof error !== 'object') {
    return 'unknown_error'
  }

  const authError = error as SupabaseLikeAuthError
  const message = normaliseMessage(authError)

  if (
    authError.name === 'AuthRetryableFetchError' ||
    authError.status === 0 ||
    message.includes('failed to fetch') ||
    message.includes('network')
  ) {
    return 'connection_error'
  }

  if (
    authError.name === 'AuthSessionMissingError' ||
    authError.status === 401 ||
    message.includes('session missing') ||
    message.includes('session not found') ||
    message.includes('session expired') ||
    message.includes('jwt expired') ||
    message.includes('invalid token') ||
    message.includes('token has expired') ||
    message.includes('not authenticated')
  ) {
    return 'invalid_recovery_session'
  }

  if (
    message.includes('password') &&
    (message.includes('weak') ||
      message.includes('short') ||
      message.includes('at least') ||
      message.includes('should be') ||
      message.includes('characters'))
  ) {
    return 'weak_password'
  }

  if (typeof authError.status === 'number' && authError.status >= 500) {
    return 'service_unavailable'
  }

  return 'unknown_error'
}

export function mapSignUpError(error: unknown): SafeAuthError {
  const mapped = mapAuthError(error)

  if (mapped.code === 'invalid_credentials') {
    return {
      code: 'unknown',
      message: AUTH_MESSAGES.genericSignUpError,
    }
  }

  if (mapped.code === 'unknown') {
    return {
      code: 'unknown',
      message: AUTH_MESSAGES.genericSignUpError,
    }
  }

  return mapped
}

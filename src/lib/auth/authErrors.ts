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

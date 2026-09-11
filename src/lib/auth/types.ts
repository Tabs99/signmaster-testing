export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_already_registered'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'network_error'
  | 'unknown'

export interface AuthUser {
  id: string
  email: string
  emailConfirmed: boolean
}

export interface SafeAuthError {
  code: AuthErrorCode
  message: string
}

export interface AuthSessionInfo {
  user: AuthUser
}

export type SignUpResult =
  | { kind: 'success'; user: AuthUser; session: AuthSessionInfo }
  | { kind: 'email_confirmation_required'; user: AuthUser }
  | { kind: 'error'; error: SafeAuthError }

export type SignInResult =
  | { kind: 'success'; user: AuthUser; session: AuthSessionInfo }
  | { kind: 'error'; error: SafeAuthError }

/**
 * Result of requesting a password-reset email. Account existence is never
 * revealed: a missing account and a successful dispatch both collapse to
 * `sent`. Only genuine transient failures are surfaced (as retryable states);
 * anything unexpected also collapses to `sent` so the UI can never be used to
 * enumerate accounts.
 */
export type PasswordResetRequestResult =
  | { kind: 'sent' }
  | { kind: 'rate_limited' }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

/**
 * Result of updating the password while a Supabase recovery session is active.
 * Raw Supabase errors never reach the UI — they are mapped to safe categories.
 */
export type PasswordUpdateResult =
  | { kind: 'success'; user: AuthUser }
  | { kind: 'invalid_recovery_session' }
  | { kind: 'weak_password' }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }
  | { kind: 'unknown_error' }

export const AUTH_MESSAGES = {
  genericSignInError:
    'We could not sign you in. Check your email and password and try again.',
  genericSignUpError:
    'We could not create your account. Please check your details and try again.',
  emailConfirmationRequired:
    'Check your email to confirm your address before signing in.',
  emailAlreadyRegistered:
    'We could not create your account. If you already have one, try signing in.',
  networkError:
    'We could not reach SignMaster right now. Check your connection and try again.',
  passwordResetSent:
    "If an account exists for this email, we've sent a password reset link.",
  passwordResetTemporaryFailure:
    'We could not send the reset email right now. Please try again in a moment.',
  passwordUpdateInvalidSession:
    'This password reset link is invalid or has expired. Request a new reset email to continue.',
  passwordUpdateTemporaryFailure:
    'We could not update your password right now. Please try again in a moment.',
  passwordUpdateWeak: 'Choose a password that meets the requirements below.',
} as const

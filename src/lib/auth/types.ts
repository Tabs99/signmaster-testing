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
} as const

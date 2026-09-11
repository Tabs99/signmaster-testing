import type { AuthService } from '../../../lib/auth/authService'
import type { SignUpResult } from '../../../lib/auth/types'

export interface CreateAccountScreenProps {
  signUp?: AuthService['signUp']
  /**
   * Builds the account-confirmation `emailRedirectTo` URL, embedding the opaque
   * cross-device continuation reference when an activation context exists.
   */
  buildConfirmationRedirect?: (email: string) => Promise<string>
  onSignIn?: () => void
  onRestartActivation?: () => void
}

export interface SignInScreenProps {
  signIn?: AuthService['signIn']
  onCreateAccount?: () => void
  onRestartActivation?: () => void
  onForgotPassword?: () => void
}

export interface ForgotPasswordScreenProps {
  requestReset?: AuthService['requestPasswordReset']
  /** Builds the `redirectTo` URL for the recovery email (defaults to the app origin + reset route). */
  buildRedirect?: (origin?: string) => string
  onBackToSignIn?: () => void
}

export type ForgotPasswordStatus = 'idle' | 'loading' | 'sent' | 'error'

export interface ResetPasswordScreenProps {
  updatePassword?: AuthService['updatePassword']
  /** Navigate onward after a successful reset (authenticated). */
  onContinue?: () => void
  onSignIn?: () => void
  /** Navigate back to the forgot-password screen to request a fresh link. */
  onRequestNewLink?: () => void
}

export type ResetPasswordSubmitStatus = 'idle' | 'loading' | 'success'

export type CreateAccountStatus =
  | 'idle'
  | 'loading'
  | 'existing-account'
  | 'email-confirmation'
  | 'done'

export type SignInStatus = 'idle' | 'loading' | 'done'

export type AccountFieldState = 'default' | 'focused' | 'valid' | 'error'

export type AccountFieldName = 'email' | 'password' | 'confirm'

export type { SignUpResult }

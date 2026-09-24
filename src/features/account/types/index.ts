import type { ActivationContextResolutionStatus } from '../../../lib/api/activationContextApi'
import type { AuthService } from '../../../lib/auth/authService'
import type { SignUpResult } from '../../../lib/auth/types'

export type ActivationContextResolutionSnapshot = {
  status: ActivationContextResolutionStatus | null
  isLoading: boolean
  error: boolean
  retry: () => void
}

export type ActivationAccountSetupVariant = 'page' | 'progressive'

export interface CreateAccountScreenProps {
  signUp?: AuthService['signUp']
  signInWithGoogle?: AuthService['signInWithGoogle']
  signInWithApple?: AuthService['signInWithApple']
  /**
   * Builds the account-confirmation `emailRedirectTo` URL, embedding the opaque
   * cross-device continuation reference when an activation context exists.
   */
  buildConfirmationRedirect?: (email: string) => Promise<string>
  onSignIn?: () => void
  onRestartActivation?: () => void
  /**
   * Routes onward through the entitlement-aware protected-route resolver (the
   * `/app` guard) after account creation. The resolver — not this screen —
   * decides between protected access, resuming activation, or the
   * activation-required state.
   */
  onEnterApp?: () => void
}

export interface ActivationAccountSetupProps extends CreateAccountScreenProps {
  /**
   * Fires with true once the entitlement is claimed, so the surrounding screen
   * can stop offering ways back into activation.
   */
  onActivatedChange?: (activated: boolean) => void
  variant?: ActivationAccountSetupVariant
  /** When set (progressive /activate), avoids a second context GET in the child. */
  activationContextResolution?: ActivationContextResolutionSnapshot
  /** Verified Order ID from the in-session activation flow (progressive Step 2 only). */
  verifiedOrderId?: string
}

export interface SignInScreenProps {
  signIn?: AuthService['signIn']
  signInWithGoogle?: AuthService['signInWithGoogle']
  signInWithApple?: AuthService['signInWithApple']
  onCreateAccount?: () => void
  onForgotPassword?: () => void
  /**
   * Routes onward through the entitlement-aware protected-route resolver (the
   * `/app` guard) after sign in. The resolver decides access vs. resume vs.
   * activation-required.
   */
  onEnterApp?: () => void
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
  | 'auth-sync-failed'
  | 'auth-sync-retrying'
  | 'done'

export type SignInStatus = 'idle' | 'loading' | 'done'

export type AccountFieldState = 'default' | 'focused' | 'valid' | 'error'

export type AccountFieldName = 'email' | 'password' | 'confirm'

export type { SignUpResult }

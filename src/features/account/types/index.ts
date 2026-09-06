import type { AuthService } from '../../../lib/auth/authService'
import type { SignUpResult } from '../../../lib/auth/types'

export interface CreateAccountScreenProps {
  signUp?: AuthService['signUp']
  onSignIn?: () => void
  onRestartActivation?: () => void
}

export interface SignInScreenProps {
  signIn?: AuthService['signIn']
  onCreateAccount?: () => void
  onRestartActivation?: () => void
}

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

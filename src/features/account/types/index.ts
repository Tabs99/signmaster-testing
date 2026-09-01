export interface CreateAccountScreenProps {
  onComplete?: () => void
  onSignIn?: () => void
}

export const ACCOUNT_STORAGE_KEY = 'signmaster_account_created'

export type CreateAccountStatus = 'idle' | 'loading' | 'existing-account' | 'done'

export type AccountFieldState = 'default' | 'focused' | 'valid' | 'error'

export type AccountFieldName = 'email' | 'password' | 'confirm'

import type { MutableRefObject } from 'react'
import { authService, type AuthService } from '../../../lib/auth/authService'
import { useOAuthSignIn } from './useOAuthSignIn'

export interface UseAppleSignInOptions {
  signInWithApple?: AuthService['signInWithApple']
  buildReturnUrl?: () => string
  enabled?: boolean
  inFlightRef?: MutableRefObject<boolean>
}

export function useAppleSignIn({
  signInWithApple = authService.signInWithApple.bind(authService),
  buildReturnUrl,
  enabled = true,
  inFlightRef,
}: UseAppleSignInOptions = {}) {
  const oauth = useOAuthSignIn({
    signIn: signInWithApple,
    buildReturnUrl,
    enabled,
    inFlightRef,
  })

  return {
    handleAppleSignIn: oauth.handleSignIn,
    appleLoading: oauth.loading,
    appleError: oauth.error,
    clearAppleError: oauth.clearError,
  }
}

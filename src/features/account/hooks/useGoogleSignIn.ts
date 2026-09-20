import type { MutableRefObject } from 'react'
import { authService, type AuthService } from '../../../lib/auth/authService'
import { useOAuthSignIn } from './useOAuthSignIn'

export interface UseGoogleSignInOptions {
  signInWithGoogle?: AuthService['signInWithGoogle']
  buildReturnUrl?: () => string
  enabled?: boolean
  inFlightRef?: MutableRefObject<boolean>
}

export function useGoogleSignIn({
  signInWithGoogle = authService.signInWithGoogle.bind(authService),
  buildReturnUrl,
  enabled = true,
  inFlightRef,
}: UseGoogleSignInOptions = {}) {
  const oauth = useOAuthSignIn({
    signIn: signInWithGoogle,
    buildReturnUrl,
    enabled,
    inFlightRef,
  })

  return {
    handleGoogleSignIn: oauth.handleSignIn,
    googleLoading: oauth.loading,
    googleError: oauth.error,
    clearGoogleError: oauth.clearError,
  }
}

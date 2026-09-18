import { useCallback, useRef, useState } from 'react'
import {
  authService,
  type AuthService,
  type GoogleSignInOptions,
} from '../../../lib/auth/authService'
import { buildOAuthReturnUrl } from '../../../lib/auth/oauthRedirect'
import { AUTH_MESSAGES } from '../../../lib/auth/types'

export interface UseGoogleSignInOptions {
  signInWithGoogle?: AuthService['signInWithGoogle']
  buildReturnUrl?: () => string
  enabled?: boolean
}

export function useGoogleSignIn({
  signInWithGoogle = authService.signInWithGoogle.bind(authService),
  buildReturnUrl = buildOAuthReturnUrl,
  enabled = true,
}: UseGoogleSignInOptions = {}) {
  const inFlightRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleSignIn = useCallback(async () => {
    if (!enabled || inFlightRef.current) {
      return
    }

    inFlightRef.current = true
    setError(null)
    setLoading(true)

    try {
      const redirectTo = buildReturnUrl()
      const options: GoogleSignInOptions = { redirectTo }
      const result = await signInWithGoogle(options)

      if (result.kind === 'error') {
        setError(result.error.message || AUTH_MESSAGES.oauthInitiationFailed)
        setLoading(false)
        inFlightRef.current = false
        return
      }
    } catch {
      setError(AUTH_MESSAGES.networkError)
      setLoading(false)
      inFlightRef.current = false
    }
  }, [buildReturnUrl, enabled, signInWithGoogle])

  return {
    handleGoogleSignIn,
    googleLoading: loading,
    googleError: error,
    clearGoogleError: () => setError(null),
  }
}

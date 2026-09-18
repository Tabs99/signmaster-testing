import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import type { OAuthSignInOptions } from '../../../lib/auth/authService'
import { buildOAuthReturnUrl } from '../../../lib/auth/oauthRedirect'
import type { OAuthRedirectResult } from '../../../lib/auth/types'
import { AUTH_MESSAGES } from '../../../lib/auth/types'

export type OAuthSignInFn = (options?: OAuthSignInOptions) => Promise<OAuthRedirectResult>

export interface UseOAuthSignInOptions {
  signIn: OAuthSignInFn
  buildReturnUrl?: () => string
  enabled?: boolean
  /** When set, multiple provider hooks share one in-flight guard (Google + Apple). */
  inFlightRef?: MutableRefObject<boolean>
}

export function useOAuthSignIn({
  signIn,
  buildReturnUrl = buildOAuthReturnUrl,
  enabled = true,
  inFlightRef: sharedInFlightRef,
}: UseOAuthSignInOptions) {
  const localInFlightRef = useRef(false)
  const inFlightRef = sharedInFlightRef ?? localInFlightRef
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = useCallback(async () => {
    if (!enabled || inFlightRef.current) {
      return
    }

    inFlightRef.current = true
    setError(null)
    setLoading(true)

    try {
      const redirectTo = buildReturnUrl()
      const result = await signIn({ redirectTo })

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
  }, [buildReturnUrl, enabled, signIn])

  return {
    handleSignIn,
    loading,
    error,
    clearError: () => setError(null),
  }
}

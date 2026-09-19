import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SecondaryButton from '../../activation/components/SecondaryButton'
import { AUTH_MESSAGES, type SafeAuthError } from '../../../lib/auth/types'
import { useAuthContext } from '../context/AuthProvider'

export interface SignOutButtonProps {
  signInPath?: string
  className?: string
}

/**
 * Clears the Supabase session via the shared auth context and returns to sign-in.
 * Does not alter server-side entitlement or activation ownership.
 */
export default function SignOutButton({
  signInPath = '/sign-in',
  className = '',
}: SignOutButtonProps) {
  const { signOut } = useAuthContext()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inFlightRef = useRef(false)

  const handleClick = useCallback(async () => {
    if (inFlightRef.current) {
      return
    }

    inFlightRef.current = true
    setBusy(true)
    setErrorMessage(null)

    try {
      await signOut()
      navigate(signInPath, { replace: true })
    } catch (error) {
      const message =
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof (error as SafeAuthError).message === 'string'
          ? (error as SafeAuthError).message
          : AUTH_MESSAGES.networkError
      setErrorMessage(message)
    } finally {
      inFlightRef.current = false
      setBusy(false)
    }
  }, [navigate, signInPath, signOut])

  return (
    <div className="flex w-full flex-col gap-3">
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-[13px] font-medium leading-snug text-amber-300"
        >
          {errorMessage}
        </div>
      ) : null}
      <SecondaryButton
        type="button"
        className={className}
        disabled={busy}
        aria-busy={busy}
        onClick={() => {
          void handleClick()
        }}
      >
        Sign out
      </SecondaryButton>
    </div>
  )
}

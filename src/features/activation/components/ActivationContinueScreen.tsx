import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageShell from '../../../components/layout/PageShell'
import BrandLockup from './BrandLockup'
import ActivationStatusPlate from './ActivationStatusPlate'
import LoadingSpinner from './LoadingSpinner'
import { useAuthContext } from '../../auth/context/AuthProvider'
import {
  consumeActivationContinuation,
  type ActivationContinueResult,
} from '../../../lib/api/activationContinuationApi'

export interface ActivationContinueScreenProps {
  onResume?: () => void
  onSignIn?: () => void
  onRestartActivation?: () => void
  consume?: (
    reference: string,
    options?: { fetchFn?: typeof fetch; getAccessToken?: () => Promise<string | null> },
  ) => Promise<ActivationContinueResult>
}

type ContinueView =
  | { kind: 'working' }
  | { kind: 'needs_sign_in' }
  | { kind: 'link_unusable' }
  | { kind: 'retryable' }

function LoadingCard({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="activation-continue-working"
      className="flex w-full items-center gap-3 rounded-md border border-white/20 bg-keyline-pane px-4 py-4 text-left"
    >
      <LoadingSpinner />
      <p className="text-[14px] font-semibold leading-snug text-white/80">{message}</p>
    </div>
  )
}

/**
 * Confirming-device landing route for the cross-device activation continuation.
 *
 * The account-confirmation email links here with an opaque `?ref=` token. The
 * Supabase client establishes the confirmed session from the redirect, then we
 * exchange the reference server-side (`POST /api/activation/continue`) to
 * re-issue the HttpOnly activation-context cookie for the same verified order.
 * Once resumed, the normal resolver → claim flow takes over on this device.
 */
export default function ActivationContinueScreen({
  onResume,
  onSignIn,
  onRestartActivation,
  consume = consumeActivationContinuation,
}: ActivationContinueScreenProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isInitializing, isAuthenticated } = useAuthContext()
  const [view, setView] = useState<ContinueView>({ kind: 'working' })
  const attemptedRef = useRef(false)

  const reference = searchParams.get('ref')

  const resume = useCallback(() => {
    if (onResume) {
      onResume()
      return
    }
    navigate('/create-account', { replace: true })
  }, [navigate, onResume])

  const runConsume = useCallback(
    async (ref: string) => {
      const result = await consume(ref)

      if (result.kind === 'outcome' && result.outcome === 'continued') {
        resume()
        return
      }

      if (
        result.kind === 'outcome' &&
        (result.outcome === 'unauthenticated' || result.outcome === 'email_not_confirmed')
      ) {
        setView({ kind: 'needs_sign_in' })
        return
      }

      if (result.kind === 'service_unavailable' || result.kind === 'connection_error') {
        setView({ kind: 'retryable' })
        return
      }

      // invalid / expired / already_consumed
      setView({ kind: 'link_unusable' })
    },
    [consume, resume],
  )

  useEffect(() => {
    if (isInitializing || attemptedRef.current) {
      return
    }

    // No reference: nothing cross-device to exchange. Route onward based on the
    // session so the same-device confirmation path is unaffected.
    if (!reference) {
      attemptedRef.current = true
      if (isAuthenticated) {
        resume()
      } else {
        setView({ kind: 'needs_sign_in' })
      }
      return
    }

    if (!isAuthenticated) {
      attemptedRef.current = true
      setView({ kind: 'needs_sign_in' })
      return
    }

    attemptedRef.current = true
    void runConsume(reference)
  }, [isAuthenticated, isInitializing, reference, resume, runConsume])

  const handleRetry = useCallback(() => {
    if (!reference) {
      return
    }
    setView({ kind: 'working' })
    void runConsume(reference)
  }, [reference, runConsume])

  return (
    <PageShell>
      <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
        <BrandLockup variant="desktop" />
        <div className="w-full" data-testid="activation-continue" data-continue-view={view.kind}>
          {view.kind === 'working' ? (
            <LoadingCard message="Finishing your activation…" />
          ) : null}

          {view.kind === 'needs_sign_in' ? (
            <ActivationStatusPlate
              tone="neutral"
              heading="Sign in to finish activating"
              body={[
                'Your email is confirmed. Sign in on this device to finish activating your SignMaster access.',
              ]}
              primaryAction={
                onSignIn ? { label: 'Sign in', onClick: onSignIn } : undefined
              }
            />
          ) : null}

          {view.kind === 'link_unusable' ? (
            <ActivationStatusPlate
              tone="warning"
              heading="This activation link can't be used"
              body={[
                "This activation link has expired or has already been used.",
                'Sign in to continue, or verify your Amazon order again.',
              ]}
              primaryAction={
                onSignIn ? { label: 'Sign in', onClick: onSignIn } : undefined
              }
              secondaryAction={
                onRestartActivation
                  ? { label: 'Verify my order', onClick: onRestartActivation }
                  : undefined
              }
            />
          ) : null}

          {view.kind === 'retryable' ? (
            <ActivationStatusPlate
              tone="neutral"
              heading="We couldn't finish just now"
              body={[
                'SignMaster is temporarily unavailable and your purchase has not been changed.',
                'Please try again in a moment.',
              ]}
              primaryAction={{ label: 'Try again', onClick: handleRetry }}
            />
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}

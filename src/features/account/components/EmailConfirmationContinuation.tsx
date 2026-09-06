import { useCallback, useRef, useState } from 'react'
import PrimaryButton from '../../activation/components/PrimaryButton'
import LoadingSpinner from '../../activation/components/LoadingSpinner'
import { AUTH_MESSAGES } from '../../../lib/auth/types'

export interface EmailConfirmationContinuationProps {
  /** Invoked once the re-check confirms the email is now confirmed. */
  onConfirmed: () => void
  onSignIn?: () => void
  /** Returns to the account form to try a different email; preserves context. */
  onChangeEmail?: () => void
  /** Resolves true when the email is now confirmed. Defaults are wired by the screen. */
  recheck: () => Promise<boolean>
}

type RecheckStatus = 'idle' | 'checking' | 'still_unconfirmed'

export default function EmailConfirmationContinuation({
  onConfirmed,
  onSignIn,
  onChangeEmail,
  recheck,
}: EmailConfirmationContinuationProps) {
  const [status, setStatus] = useState<RecheckStatus>('idle')
  const inFlightRef = useRef(false)

  const handleRecheck = useCallback(async () => {
    if (inFlightRef.current) {
      return
    }

    inFlightRef.current = true
    setStatus('checking')

    try {
      const confirmed = await recheck()

      if (confirmed) {
        onConfirmed()
        return
      }

      setStatus('still_unconfirmed')
    } catch {
      setStatus('still_unconfirmed')
    } finally {
      inFlightRef.current = false
    }
  }, [onConfirmed, recheck])

  const isChecking = status === 'checking'

  return (
    <article
      className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-9 text-center backdrop-blur-xl"
      data-testid="email-confirmation-continuation"
    >
      <p className="text-xl font-extrabold tracking-tight text-white">Confirm your email</p>
      <p className="mt-2 text-sm leading-relaxed text-white/65">
        {AUTH_MESSAGES.emailConfirmationRequired}
      </p>

      {status === 'still_unconfirmed' ? (
        <div
          role="status"
          data-testid="email-confirmation-not-seen"
          className="mt-5 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-[13px] leading-snug text-amber-300"
        >
          We haven&apos;t seen the confirmation yet. Check your email and try again.
        </div>
      ) : null}

      <div className="mt-6">
        <PrimaryButton
          type="button"
          enabled={!isChecking}
          loading={isChecking}
          onClick={() => {
            void handleRecheck()
          }}
          className="w-full"
        >
          {isChecking ? (
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner />
              Checking…
            </span>
          ) : (
            "I've confirmed my email"
          )}
        </PrimaryButton>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm leading-relaxed text-white/[0.62]">
        {onChangeEmail ? (
          <p>
            Wrong email?{' '}
            <button
              type="button"
              onClick={onChangeEmail}
              className="font-semibold text-accent-gold underline underline-offset-2"
            >
              Change email
            </button>
          </p>
        ) : null}
        {onSignIn ? (
          <p>
            Already confirmed on another device?{' '}
            <button
              type="button"
              onClick={onSignIn}
              className="font-semibold text-accent-gold underline underline-offset-2"
            >
              Sign in
            </button>
          </p>
        ) : null}
      </div>
    </article>
  )
}

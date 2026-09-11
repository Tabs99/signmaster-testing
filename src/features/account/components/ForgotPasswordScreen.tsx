import { FormEvent, useCallback, useRef, useState } from 'react'
import PageShell from '../../../components/layout/PageShell'
import BrandLockup from '../../activation/components/BrandLockup'
import FieldError from '../../activation/components/FieldError'
import LoadingSpinner from '../../activation/components/LoadingSpinner'
import PrimaryButton from '../../activation/components/PrimaryButton'
import SecondaryButton from '../../activation/components/SecondaryButton'
import { authService } from '../../../lib/auth/authService'
import { buildPasswordResetRedirect } from '../../../lib/auth/passwordResetRedirect'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import {
  type AccountFieldState,
  type ForgotPasswordScreenProps,
  type ForgotPasswordStatus,
} from '../types'
import { accountInputClasses, accountLabelClassName } from '../utils/fieldStyles'
import { isValidEmail } from '../utils/validation'

function ResetLinkSentCard({
  onBackToSignIn,
  onResend,
}: {
  onBackToSignIn?: () => void
  onResend: () => void
}) {
  return (
    <article
      className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-9 text-center backdrop-blur-xl"
      data-testid="forgot-password-sent"
    >
      <div className="mx-auto mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-full bg-gradient-cta shadow-[0_4px_16px_rgba(240,192,74,0.3)]">
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26" fill="none">
          <path
            d="M3.5 6.5l9.5 6 9.5-6M4 5.5h18a1 1 0 011 1v13a1 1 0 01-1 1H4a1 1 0 01-1-1v-13a1 1 0 011-1z"
            stroke="#0a1628"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-xl font-extrabold tracking-tight text-white">Check your email</p>
      <p className="mx-auto mt-2 max-w-[320px] text-sm leading-relaxed text-white/65">
        {AUTH_MESSAGES.passwordResetSent}
      </p>
      <p className="mx-auto mt-2 max-w-[320px] text-xs leading-relaxed text-white/50">
        The link opens SignMaster so you can choose a new password. It may take a minute to
        arrive — remember to check your spam folder.
      </p>
      <div className="mt-6 space-y-3">
        <SecondaryButton type="button" onClick={onResend}>
          Use a different email
        </SecondaryButton>
        {onBackToSignIn ? (
          <p className="text-center text-sm leading-relaxed text-white/[0.62]">
            <button
              type="button"
              onClick={onBackToSignIn}
              className="font-semibold text-accent-gold underline underline-offset-2"
            >
              Back to sign in
            </button>
          </p>
        ) : null}
      </div>
    </article>
  )
}

export default function ForgotPasswordScreen({
  requestReset = authService.requestPasswordReset.bind(authService),
  buildRedirect = buildPasswordResetRedirect,
  onBackToSignIn,
}: ForgotPasswordScreenProps) {
  const emailRef = useRef<HTMLInputElement>(null)
  const submitInFlightRef = useRef(false)

  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [focused, setFocused] = useState(false)
  const [status, setStatus] = useState<ForgotPasswordStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const emailOk = isValidEmail(email)
  const showEmailErr = (emailTouched || submitAttempted) && !emailOk
  const isLoading = status === 'loading'
  const canSubmit = emailOk && !isLoading

  const fieldState: AccountFieldState = showEmailErr
    ? 'error'
    : focused
      ? 'focused'
      : emailOk && emailTouched
        ? 'valid'
        : 'default'

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      setSubmitAttempted(true)
      setEmailTouched(true)
      setErrorMessage(null)

      if (!emailOk) {
        emailRef.current?.focus()
        return
      }

      if (submitInFlightRef.current) {
        return
      }

      submitInFlightRef.current = true
      setStatus('loading')

      try {
        const result = await requestReset(email, { redirectTo: buildRedirect() })

        if (result.kind === 'sent') {
          setStatus('sent')
          return
        }

        // rate_limited / service_unavailable / connection_error — transient.
        // We never reveal whether an account exists; only that the send failed.
        setErrorMessage(AUTH_MESSAGES.passwordResetTemporaryFailure)
        setStatus('error')
      } catch {
        setErrorMessage(AUTH_MESSAGES.passwordResetTemporaryFailure)
        setStatus('error')
      } finally {
        submitInFlightRef.current = false
      }
    },
    [buildRedirect, email, emailOk, requestReset],
  )

  const handleResend = useCallback(() => {
    setStatus('idle')
    setEmail('')
    setEmailTouched(false)
    setSubmitAttempted(false)
    setErrorMessage(null)
  }, [])

  if (status === 'sent') {
    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <BrandLockup variant="desktop" />
          <ResetLinkSentCard onBackToSignIn={onBackToSignIn} onResend={handleResend} />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="flex w-full max-w-[420px] flex-col items-center">
        <BrandLockup variant="desktop" />

        <header className="mb-6 w-full max-w-[500px] px-1 text-center">
          <h1 className="text-[clamp(20px,4.5vw,28px)] font-extrabold leading-tight tracking-tight text-white">
            Reset your password
          </h1>
          <p className="account-subtitle mx-auto mt-2.5 max-w-[360px] text-[15px] leading-relaxed text-white/70">
            Enter the email for your SignMaster account and we&apos;ll send a link to choose a
            new password.
          </p>
        </header>

        <article className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-6 pb-7 backdrop-blur-xl">
          {status === 'error' && errorMessage ? (
            <div
              role="alert"
              className="mb-5 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-[13px] font-medium leading-snug text-amber-300"
            >
              {errorMessage}
            </div>
          ) : null}

          <form
            noValidate
            onSubmit={handleSubmit}
            aria-label="Reset your SignMaster password form"
            className="flex flex-col gap-[18px]"
          >
            <div>
              <label htmlFor="forgot-email" className={accountLabelClassName}>
                Email Address
              </label>
              <input
                ref={emailRef}
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false)
                  setEmailTouched(true)
                }}
                placeholder="you@example.com"
                aria-invalid={showEmailErr}
                aria-describedby={showEmailErr ? 'forgot-email-error' : undefined}
                className={accountInputClasses(fieldState, false)}
              />
              {showEmailErr ? (
                <FieldError id="forgot-email-error">
                  Enter a valid email address, for example{' '}
                  <span className="whitespace-nowrap font-mono">you@example.com</span>.
                </FieldError>
              ) : null}
            </div>

            <PrimaryButton type="submit" enabled={canSubmit} loading={isLoading} className="w-full">
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner />
                  Sending reset link…
                </span>
              ) : (
                'Send reset link'
              )}
            </PrimaryButton>

            <p className="mt-1 text-center text-sm leading-relaxed text-white/[0.62]">
              Remembered your password?{' '}
              <button
                type="button"
                onClick={onBackToSignIn}
                className="font-semibold text-accent-gold underline underline-offset-2"
              >
                Back to sign in
              </button>
            </p>
          </form>
        </article>
      </div>
    </PageShell>
  )
}

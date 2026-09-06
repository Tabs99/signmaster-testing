import { FormEvent, useCallback, useMemo, useRef, useState } from 'react'
import PageShell from '../../../components/layout/PageShell'
import LoadingSpinner from '../../activation/components/LoadingSpinner'
import PrimaryButton from '../../activation/components/PrimaryButton'
import BrandLockup from '../../activation/components/BrandLockup'
import {
  ActivationContextMissingNotice,
  ActivationContextServiceErrorNotice,
  ActivationExpiredNotice,
} from '../../activation/components/ActivationContextNotice'
import { useActivationContextResolution } from '../../activation/hooks/useActivationContextResolution'
import { useActivationClaimWhenReady } from '../../activation/hooks/useActivationClaimWhenReady'
import ActivationClaimResult from '../../activation/components/ActivationClaimResult'
import FieldError from '../../activation/components/FieldError'
import { authService } from '../../../lib/auth/authService'
import { resolveActivationResumeState } from '../../../lib/activation/activationResumeResolver'
import { useAuthContext } from '../../auth/context/AuthProvider'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import {
  type AccountFieldName,
  type AccountFieldState,
  type SignInScreenProps,
  type SignInStatus,
} from '../types'
import { accountInputClasses, accountLabelClassName } from '../utils/fieldStyles'
import { isValidEmail, isValidPassword } from '../utils/validation'
import EyeToggle from './EyeToggle'

function SignedInCard({
  resumeState,
  claimOutcome,
}: {
  resumeState: string | null
  claimOutcome?: string
}) {
  return (
    <article
      className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-9 text-center backdrop-blur-xl"
      data-resume-state={resumeState ?? undefined}
      data-claim-outcome={claimOutcome}
    >
      <div className="mx-auto mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-full bg-gradient-cta shadow-[0_4px_16px_rgba(240,192,74,0.3)]">
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26" fill="none">
          <path
            d="M6 13.5l5 5L20 8"
            stroke="#0a1628"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-xl font-extrabold tracking-tight text-white">You&apos;re signed in</p>
      <p className="mt-2 text-sm leading-relaxed text-white/65">
        Activation will continue in a later step. Your companion app access is not unlocked yet.
      </p>
    </article>
  )
}

export default function SignInScreen({
  signIn = authService.signIn.bind(authService),
  onCreateAccount,
  onRestartActivation,
}: SignInScreenProps) {
  const {
    status: contextStatus,
    isLoading: contextLoading,
    error: contextError,
    retry: retryContextResolution,
  } = useActivationContextResolution()
  const { isAuthenticated, user, isInitializing: authInitializing } = useAuthContext()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const submitInFlightRef = useRef(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [focusedField, setFocusedField] = useState<AccountFieldName | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [formStatus, setFormStatus] = useState<SignInStatus>('idle')
  const [authError, setAuthError] = useState<string | null>(null)

  const emailOk = isValidEmail(email)
  const passwordOk = isValidPassword(password)
  const showEmailErr = (emailTouched || submitAttempted) && !emailOk
  const showPwErr = (passwordTouched || submitAttempted) && !passwordOk
  const isLoading = formStatus === 'loading'
  const contextResolutionBlocked = contextLoading || contextError
  const canSubmit = emailOk && passwordOk && !isLoading && !contextResolutionBlocked

  const resumeState = useMemo(() => {
    if (contextLoading || authInitializing || contextError || !contextStatus) {
      return null
    }

    return resolveActivationResumeState({
      contextStatus,
      auth: {
        isAuthenticated,
        isEmailConfirmed: Boolean(user?.emailConfirmed),
      },
      intent: 'sign_in',
    })
  }, [
    authInitializing,
    contextError,
    contextLoading,
    contextStatus,
    isAuthenticated,
    user?.emailConfirmed,
  ])

  const claimReady = resumeState === 'valid_context_confirmed_auth'
  const { state: claimState, retry: retryClaim } = useActivationClaimWhenReady({
    ready: claimReady,
  })
  const claimActive = claimState.kind !== 'idle'
  const claimOutcome =
    claimState.kind === 'outcome' ? claimState.outcome : undefined

  function fieldState(field: AccountFieldName): AccountFieldState {
    const isFocused = focusedField === field

    if (field === 'email') {
      if (showEmailErr) return 'error'
      if (isFocused) return 'focused'
      if (emailOk && emailTouched) return 'valid'
      return 'default'
    }

    if (showPwErr) return 'error'
    if (isFocused) return 'focused'
    if (passwordOk && passwordTouched) return 'valid'
    return 'default'
  }

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (contextLoading || contextError) {
        return
      }

      setSubmitAttempted(true)
      setEmailTouched(true)
      setPasswordTouched(true)
      setAuthError(null)

      if (!emailOk) {
        emailRef.current?.focus()
        return
      }

      if (!passwordOk) {
        passwordRef.current?.focus()
        return
      }

      if (submitInFlightRef.current) {
        return
      }

      submitInFlightRef.current = true
      setFormStatus('loading')

      try {
        const result = await signIn(email, password)

        if (result.kind === 'success') {
          setFormStatus('done')
          return
        }

        setAuthError(result.error.message)
        setFormStatus('idle')
      } catch {
        setAuthError(AUTH_MESSAGES.networkError)
        setFormStatus('idle')
      } finally {
        submitInFlightRef.current = false
      }
    },
    [contextError, contextLoading, email, emailOk, passwordOk, signIn],
  )

  if (formStatus === 'done') {
    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <BrandLockup variant="desktop" />
          {claimActive ? (
            <ActivationClaimResult
              claimState={claimState}
              onRetryClaim={retryClaim}
              onRestartActivation={onRestartActivation}
            />
          ) : (
            <SignedInCard resumeState={resumeState} claimOutcome={claimOutcome} />
          )}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="flex w-full max-w-[420px] flex-col items-center">
        <BrandLockup variant="desktop" />

        <header className="mb-6 w-full max-w-[500px] px-1 text-center">
          {contextError ? (
            <ActivationContextServiceErrorNotice
              onRetry={retryContextResolution}
              isRetrying={contextLoading}
            />
          ) : null}
          {!contextError && resumeState === 'expired_context' ? (
            <ActivationExpiredNotice onRestartActivation={onRestartActivation} />
          ) : null}
          {!contextError && resumeState === 'confirmed_auth_no_context' ? (
            <ActivationContextMissingNotice />
          ) : null}
          <h1 className="text-[clamp(20px,4.5vw,28px)] font-extrabold leading-tight tracking-tight text-white">
            Sign in to SignMaster
          </h1>
          <p className="account-subtitle mx-auto mt-2.5 max-w-[360px] text-[15px] leading-relaxed text-white/70">
            Use the email and password for your SignMaster account.
          </p>
        </header>

        <article
          className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-6 pb-7 backdrop-blur-xl"
          data-resume-state={resumeState ?? undefined}
        >
          {authError ? (
            <div
              role="alert"
              className="mb-5 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-[13px] font-medium leading-snug text-amber-300"
            >
              {authError}
            </div>
          ) : null}

          <form
            noValidate
            onSubmit={handleSubmit}
            aria-label="Sign in to SignMaster form"
            className="flex flex-col gap-[18px]"
          >
            <fieldset className="flex flex-col gap-[18px] border-0 p-0">
              <legend className="sr-only">Sign in details</legend>

              <div>
                <label htmlFor="sign-in-email" className={accountLabelClassName}>
                  Email Address
                </label>
                <input
                  ref={emailRef}
                  id="sign-in-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => {
                    setFocusedField(null)
                    setEmailTouched(true)
                  }}
                  placeholder="you@example.com"
                  aria-invalid={showEmailErr}
                  aria-describedby={showEmailErr ? 'sign-in-email-error' : undefined}
                  className={accountInputClasses(fieldState('email'), false)}
                />
                {showEmailErr ? (
                  <FieldError id="sign-in-email-error">
                    Enter a valid email address, for example{' '}
                    <span className="whitespace-nowrap font-mono">you@example.com</span>.
                  </FieldError>
                ) : null}
              </div>

              <div>
                <label htmlFor="sign-in-password" className={accountLabelClassName}>
                  Password
                </label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    id="sign-in-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => {
                      setFocusedField(null)
                      setPasswordTouched(true)
                    }}
                    placeholder="Your password"
                    aria-invalid={showPwErr}
                    aria-describedby={showPwErr ? 'sign-in-password-error' : undefined}
                    className={accountInputClasses(fieldState('password'), true)}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <EyeToggle
                      visible={showPassword}
                      onToggle={() => setShowPassword((current) => !current)}
                    />
                  </div>
                </div>
                {showPwErr ? (
                  <FieldError id="sign-in-password-error">
                    Password does not meet the requirements.
                  </FieldError>
                ) : null}
              </div>
            </fieldset>

            <PrimaryButton type="submit" enabled={canSubmit} loading={isLoading} className="w-full">
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner />
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </PrimaryButton>

            <p className="mt-1 text-center text-sm leading-relaxed text-white/[0.62]">
              Need a SignMaster account?{' '}
              <button
                type="button"
                onClick={onCreateAccount}
                className="font-semibold text-accent-gold underline underline-offset-2"
              >
                Create account
              </button>
            </p>
          </form>
        </article>
      </div>
    </PageShell>
  )
}

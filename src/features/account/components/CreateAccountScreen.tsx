import { FormEvent, useCallback, useMemo, useRef, useState } from 'react'
import PageShell from '../../../components/layout/PageShell'
import BrandLockup from '../../activation/components/BrandLockup'
import {
  ActivationContextMissingNotice,
  ActivationContextServiceErrorNotice,
  ActivationExpiredNotice,
} from '../../activation/components/ActivationContextNotice'
import { useActivationContextResolution } from '../../activation/hooks/useActivationContextResolution'
import { useActivationClaimWhenReady } from '../../activation/hooks/useActivationClaimWhenReady'
import ActivationClaimResult from '../../activation/components/ActivationClaimResult'
import EmailConfirmationContinuation from './EmailConfirmationContinuation'
import FieldError from '../../activation/components/FieldError'
import LoadingSpinner from '../../activation/components/LoadingSpinner'
import PrimaryButton from '../../activation/components/PrimaryButton'
import { authService } from '../../../lib/auth/authService'
import { buildConfirmationContinuationRedirect } from '../../../lib/activation/confirmationRedirect'
import { resolveActivationResumeState } from '../../../lib/activation/activationResumeResolver'
import { useAuthContext } from '../../auth/context/AuthProvider'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import {
  type AccountFieldName,
  type AccountFieldState,
  type CreateAccountScreenProps,
  type CreateAccountStatus,
} from '../types'
import { accountInputClasses, accountLabelClassName } from '../utils/fieldStyles'
import {
  hasMinPasswordLength,
  hasNumberOrSymbol,
  isValidEmail,
  isValidPassword,
  passwordsMatch,
} from '../utils/validation'
import EyeToggle from './EyeToggle'
import PasswordRequirement from './PasswordRequirement'
import ValidTick from './ValidTick'

function AccountSuccessCard({
  claimOutcome,
  onEnterApp,
}: {
  claimOutcome?: string
  onEnterApp?: () => void
}) {
  return (
    <article
      className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-9 text-center backdrop-blur-xl"
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
      <p className="text-xl font-extrabold tracking-tight text-white">Account created!</p>
      <p className="mt-2 text-sm leading-relaxed text-white/65">
        You&apos;re signed in. Activation will continue in a later step — your companion app
        access is not unlocked yet.
      </p>
      {onEnterApp ? (
        <div className="mt-6">
          <PrimaryButton type="button" enabled onClick={onEnterApp} className="w-full">
            Continue
          </PrimaryButton>
        </div>
      ) : null}
    </article>
  )
}

function PurchaseVerifiedBadge() {
  return (
    <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3.5 py-1.5 pl-2.5">
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle
          cx="7.5"
          cy="7.5"
          r="6.75"
          fill="rgba(240,192,74,0.25)"
          stroke="#f0c04a"
          strokeWidth="1.3"
        />
        <path
          d="M4.5 7.8l2 2 4-4"
          stroke="#f0c04a"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-xs font-bold tracking-wide text-accent-gold">
        Purchase verified
      </span>
    </div>
  )
}

function ExistingAccountAlert({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        className="mt-0.5 shrink-0"
      >
        <circle cx="9" cy="9" r="7.75" stroke="rgba(245,158,11,0.7)" strokeWidth="1.4" />
        <path
          d="M9 6v4.5M9 12.5h.01"
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <div>
        <p className="text-[13px] font-bold leading-snug text-amber-300">
          {AUTH_MESSAGES.emailAlreadyRegistered}{' '}
          <button
            type="button"
            onClick={onSignIn}
            className="font-bold text-accent-gold underline underline-offset-2"
          >
            Sign in
          </button>
        </p>
        <p className="mt-1.5 text-xs leading-snug text-white/60">
          Or use a different email address to try again.
        </p>
      </div>
    </div>
  )
}

export default function CreateAccountScreen({
  signUp = authService.signUp.bind(authService),
  buildConfirmationRedirect = buildConfirmationContinuationRedirect,
  onSignIn,
  onRestartActivation,
  onEnterApp,
}: CreateAccountScreenProps) {
  const {
    status: contextStatus,
    isLoading: contextLoading,
    error: contextError,
    retry: retryContextResolution,
  } = useActivationContextResolution()
  const {
    isAuthenticated,
    user,
    isInitializing: authInitializing,
    refresh: refreshAuth,
  } = useAuthContext()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const submitInFlightRef = useRef(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [focusedField, setFocusedField] = useState<AccountFieldName | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [formStatus, setFormStatus] = useState<CreateAccountStatus>('idle')
  const [authError, setAuthError] = useState<string | null>(null)

  const emailOk = isValidEmail(email)
  const pwLengthOk = hasMinPasswordLength(password)
  const pwSymbolOk = hasNumberOrSymbol(password)
  const passwordOk = isValidPassword(password)
  const matchOk = passwordsMatch(password, confirm)

  const showEmailErr = (emailTouched || submitAttempted) && !emailOk
  const showPwErr = (passwordTouched || submitAttempted) && !passwordOk
  const showMatchErr = (confirmTouched || submitAttempted) && !matchOk && confirm !== ''
  const showMatchEmpty = submitAttempted && confirm === ''

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
      intent: 'create_account',
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

  const showVerifiedBadge =
    resumeState === 'valid_context' ||
    resumeState === 'valid_context_unconfirmed_auth' ||
    resumeState === 'valid_context_confirmed_auth'

  function fieldState(field: AccountFieldName): AccountFieldState {
    const isFocused = focusedField === field

    if (field === 'email') {
      if (showEmailErr) return 'error'
      if (isFocused) return 'focused'
      if (emailOk && emailTouched) return 'valid'
      return 'default'
    }

    if (field === 'password') {
      if (showPwErr) return 'error'
      if (isFocused) return 'focused'
      if (passwordOk && passwordTouched) return 'valid'
      return 'default'
    }

    if (showMatchErr || showMatchEmpty) return 'error'
    if (isFocused) return 'focused'
    if (matchOk && confirmTouched) return 'valid'
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
      setConfirmTouched(true)

      if (!emailOk) {
        emailRef.current?.focus()
        return
      }

      if (!passwordOk) {
        passwordRef.current?.focus()
        return
      }

      if (!matchOk) {
        confirmRef.current?.focus()
        return
      }

      if (submitInFlightRef.current) {
        return
      }

      submitInFlightRef.current = true
      setAuthError(null)
      setFormStatus('loading')

      try {
        const emailRedirectTo = await buildConfirmationRedirect(email)
        const result = await signUp(email, password, { emailRedirectTo })

        if (result.kind === 'success') {
          setFormStatus('done')
          return
        }

        if (result.kind === 'email_confirmation_required') {
          setFormStatus('email-confirmation')
          return
        }

        if (result.error.code === 'email_already_registered') {
          setFormStatus('existing-account')
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
    [
      buildConfirmationRedirect,
      contextError,
      contextLoading,
      email,
      emailOk,
      matchOk,
      passwordOk,
      signUp,
    ],
  )

  const recheckEmailConfirmation = useCallback(async () => {
    if (!refreshAuth) {
      return false
    }

    const updated = await refreshAuth()
    return Boolean(updated?.emailConfirmed)
  }, [refreshAuth])

  const handleEmailConfirmed = useCallback(() => {
    setFormStatus('done')
  }, [])

  const handleChangeEmail = useCallback(() => {
    setFormStatus('idle')
    setEmail('')
    setPassword('')
    setConfirm('')
    setEmailTouched(false)
    setPasswordTouched(false)
    setConfirmTouched(false)
    setSubmitAttempted(false)
    setAuthError(null)
  }, [])

  const isLoading = formStatus === 'loading'
  const contextResolutionBlocked = contextLoading || contextError
  const canSubmit =
    emailOk && passwordOk && matchOk && !isLoading && !contextResolutionBlocked

  // Show the claim/continuation result whenever a claim is active. This covers
  // both the same-device path (after form submit) and the cross-device resume,
  // where the confirming device lands here already authenticated with a valid
  // context and the claim runs without a fresh form submission.
  if (claimActive) {
    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <BrandLockup variant="desktop" />
          <ActivationClaimResult
            claimState={claimState}
            onRetryClaim={retryClaim}
            onSignIn={onSignIn}
            onRestartActivation={onRestartActivation}
            onContinue={onEnterApp}
          />
        </div>
      </PageShell>
    )
  }

  if (formStatus === 'done') {
    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <BrandLockup variant="desktop" />
          <AccountSuccessCard claimOutcome={claimOutcome} onEnterApp={onEnterApp} />
        </div>
      </PageShell>
    )
  }

  if (formStatus === 'email-confirmation') {
    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <BrandLockup variant="desktop" />
          <EmailConfirmationContinuation
            onConfirmed={handleEmailConfirmed}
            onSignIn={onSignIn}
            onChangeEmail={handleChangeEmail}
            recheck={recheckEmailConfirmation}
          />
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
          {!contextError &&
          (resumeState === 'no_context' || resumeState === 'confirmed_auth_no_context') ? (
            <ActivationContextMissingNotice />
          ) : null}
          {!contextError && showVerifiedBadge ? <PurchaseVerifiedBadge /> : null}
          <h1 className="text-[clamp(20px,4.5vw,28px)] font-extrabold leading-tight tracking-tight text-white">
            Create your SignMaster account
          </h1>
          <p className="account-subtitle mx-auto mt-2.5 max-w-[360px] text-[15px] leading-relaxed text-white/70">
            Save your progress and access your free companion app on any device.
          </p>
        </header>

        <article
          className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-6 pb-7 backdrop-blur-xl"
          data-resume-state={resumeState ?? undefined}
        >
          {formStatus === 'existing-account' ? (
            <ExistingAccountAlert onSignIn={onSignIn} />
          ) : null}

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
            aria-label="Create SignMaster account form"
            className="flex flex-col gap-[18px]"
          >
            <fieldset className="flex flex-col gap-[18px] border-0 p-0">
              <legend className="sr-only">Account registration details</legend>

              <div>
                <label htmlFor="email" className={accountLabelClassName}>
                  Email Address
                </label>
                <div className="relative">
                  <input
                    ref={emailRef}
                    id="email"
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
                    aria-describedby={showEmailErr ? 'email-error' : undefined}
                    className={accountInputClasses(fieldState('email'), emailOk && emailTouched && !showEmailErr)}
                  />
                  {emailOk && emailTouched && !showEmailErr ? (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2">
                      <ValidTick />
                    </div>
                  ) : null}
                </div>
                {showEmailErr ? (
                  <FieldError id="email-error">
                    Enter a valid email address, for example{' '}
                    <span className="whitespace-nowrap font-mono">you@example.com</span>.
                  </FieldError>
                ) : null}
              </div>

              <div>
                <label htmlFor="password" className={accountLabelClassName}>
                  Create Password
                </label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => {
                      setFocusedField(null)
                      setPasswordTouched(true)
                    }}
                    placeholder="At least 8 characters"
                    aria-invalid={showPwErr}
                    aria-describedby="password-reqs"
                    className={accountInputClasses(fieldState('password'), true)}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <EyeToggle
                      visible={showPassword}
                      onToggle={() => setShowPassword((current) => !current)}
                    />
                  </div>
                </div>
                <div id="password-reqs" className="mt-2 flex flex-col gap-1">
                  {passwordTouched || password !== '' ? (
                    <>
                      <PasswordRequirement met={pwLengthOk} label="At least 8 characters" />
                      <PasswordRequirement
                        met={pwSymbolOk}
                        label="One number or special character"
                      />
                    </>
                  ) : (
                    <p className="text-xs leading-snug text-white/[0.58]">
                      Use at least 8 characters, including a number.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="confirm" className={accountLabelClassName}>
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    ref={confirmRef}
                    id="confirm"
                    name="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    onFocus={() => setFocusedField('confirm')}
                    onBlur={() => {
                      setFocusedField(null)
                      setConfirmTouched(true)
                    }}
                    placeholder="Repeat your password"
                    aria-invalid={showMatchErr || showMatchEmpty}
                    aria-describedby={
                      showMatchErr || showMatchEmpty ? 'confirm-error' : undefined
                    }
                    className={accountInputClasses(fieldState('confirm'), true)}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    {matchOk && confirmTouched ? (
                      <ValidTick />
                    ) : (
                      <EyeToggle
                        visible={showConfirm}
                        onToggle={() => setShowConfirm((current) => !current)}
                      />
                    )}
                  </div>
                </div>
                {showMatchErr ? (
                  <FieldError id="confirm-error">
                    Passwords don&apos;t match. Please try again.
                  </FieldError>
                ) : null}
                {showMatchEmpty ? (
                  <FieldError id="confirm-error">Please confirm your password.</FieldError>
                ) : null}
              </div>
            </fieldset>

            <div className="mt-[-4px] flex items-start gap-2">
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="mt-0.5 shrink-0"
              >
                <path
                  d="M7 1.5L2.5 3.5V7c0 2.485 1.96 4.614 4.5 5 2.54-.386 4.5-2.515 4.5-5V3.5L7 1.5Z"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-xs leading-snug text-white/[0.62]">
                Your email is used only to manage your SignMaster account and companion app
                access.
              </p>
            </div>

            <PrimaryButton type="submit" enabled={canSubmit} loading={isLoading} className="w-full">
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner />
                  Creating your account…
                </span>
              ) : (
                'Create Account & Continue'
              )}
            </PrimaryButton>

            <p className="mt-1 text-center text-sm leading-relaxed text-white/[0.62]">
              Already have a SignMaster account?{' '}
              <button
                type="button"
                onClick={onSignIn}
                className="font-semibold text-accent-gold underline underline-offset-2"
              >
                Sign in
              </button>
            </p>
          </form>
        </article>
      </div>
    </PageShell>
  )
}

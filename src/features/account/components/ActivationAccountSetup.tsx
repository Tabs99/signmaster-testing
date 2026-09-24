import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { useGoogleSignIn } from '../hooks/useGoogleSignIn'
import SocialAuthOptions from './SocialAuthOptions'
import { buildConfirmationContinuationRedirect } from '../../../lib/activation/confirmationRedirect'
import { resolveActivationResumeState } from '../../../lib/activation/activationResumeResolver'
import { useAuthContext } from '../../auth/context/AuthProvider'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import {
  type AccountFieldName,
  type AccountFieldState,
  type ActivationAccountSetupProps,
  type ActivationAccountSetupVariant,
  type ActivationContextResolutionSnapshot,
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

export function PurchaseVerifiedBadge({
  label = 'Purchase verified',
  className = '',
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3.5 py-1.5 pl-2.5 ${className}`}
    >
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
      <span className="text-xs font-bold tracking-wide text-accent-gold">{label}</span>
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

function AccountSetupLayout({
  variant,
  children,
  brandSpacingTestId,
}: {
  variant: ActivationAccountSetupVariant
  children: ReactNode
  brandSpacingTestId?: string
}) {
  if (variant === 'progressive') {
    return (
      <div className="w-full" data-testid="activation-account-setup">
        {children}
      </div>
    )
  }

  return (
    <PageShell>
      <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
        {brandSpacingTestId ? (
          <div
            data-testid={brandSpacingTestId}
            className="mb-[18px] flex w-full flex-col items-center max-[667px]:mb-3"
          >
            <BrandLockup variant="desktop" showDivider={false} />
          </div>
        ) : null}
        {children}
      </div>
    </PageShell>
  )
}

export default function ActivationAccountSetup({
  variant = 'page',
  activationContextResolution,
  signUp = authService.signUp.bind(authService),
  signInWithGoogle = authService.signInWithGoogle.bind(authService),
  buildConfirmationRedirect = buildConfirmationContinuationRedirect,
  onSignIn,
  onRestartActivation,
  onEnterApp,
  onActivatedChange,
  verifiedOrderId,
}: ActivationAccountSetupProps) {
  const internalContextResolution = useActivationContextResolution({
    enabled: activationContextResolution === undefined,
  })
  const contextResolution: ActivationContextResolutionSnapshot =
    activationContextResolution ?? internalContextResolution
  const {
    status: contextStatus,
    isLoading: contextLoading,
    error: contextError,
    retry: retryContextResolution,
  } = contextResolution
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
  const authSyncRetryInFlightRef = useRef(false)

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
  const activated = claimState.kind === 'outcome' && claimState.outcome === 'success'

  useEffect(() => {
    onActivatedChange?.(activated)
  }, [activated, onActivatedChange])
  const pendingClaimStart =
    resumeState === 'valid_context_confirmed_auth' && claimState.kind === 'idle'
  const contextAllowsAccountCreation =
    resumeState === 'valid_context' || resumeState === 'valid_context_unconfirmed_auth'
  const hideAccountFormForActivation =
    pendingClaimStart ||
    claimActive ||
    (resumeState === 'valid_context_confirmed_auth' && formStatus !== 'existing-account')

  const showVerifiedBadge =
    resumeState === 'valid_context' ||
    resumeState === 'valid_context_unconfirmed_auth' ||
    resumeState === 'valid_context_confirmed_auth'
  const showPurchaseVerifiedInHeader =
    !contextError &&
    (variant === 'progressive'
      ? Boolean(verifiedOrderId) || showVerifiedBadge
      : showVerifiedBadge)

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

  const reconcileAuthSessionAfterSignUp = useCallback(async (): Promise<boolean> => {
    if (!refreshAuth) {
      return false
    }

    const updated = await refreshAuth()
    return Boolean(updated?.emailConfirmed)
  }, [refreshAuth])

  const handleRetryAuthSync = useCallback(async () => {
    if (authSyncRetryInFlightRef.current) {
      return
    }

    authSyncRetryInFlightRef.current = true
    setFormStatus('auth-sync-retrying')

    try {
      const synced = await reconcileAuthSessionAfterSignUp()
      setFormStatus(synced ? 'idle' : 'auth-sync-failed')
    } finally {
      authSyncRetryInFlightRef.current = false
    }
  }, [reconcileAuthSessionAfterSignUp])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (
        formStatus === 'auth-sync-failed' ||
        formStatus === 'auth-sync-retrying' ||
        formStatus === 'email-confirmation'
      ) {
        return
      }

      if (contextLoading || contextError || !contextAllowsAccountCreation) {
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
          const synced = await reconcileAuthSessionAfterSignUp()
          if (!synced) {
            setFormStatus('auth-sync-failed')
            return
          }
          setFormStatus('idle')
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
      contextAllowsAccountCreation,
      contextLoading,
      email,
      emailOk,
      formStatus,
      matchOk,
      passwordOk,
      reconcileAuthSessionAfterSignUp,
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

  // recheckEmailConfirmation already refreshed auth; leave confirmation UI.
  const handleEmailConfirmed = useCallback(() => {
    setFormStatus('idle')
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
  const socialOAuthInFlightRef = useRef(false)
  const googleSignInEnabled =
    !contextResolutionBlocked && contextAllowsAccountCreation && formStatus === 'idle' && !isLoading
  const { handleGoogleSignIn, googleLoading, googleError } = useGoogleSignIn({
    signInWithGoogle,
    enabled: googleSignInEnabled,
    inFlightRef: socialOAuthInFlightRef,
  })
  const socialOAuthError = googleError
  const canSubmit =
    emailOk &&
    passwordOk &&
    matchOk &&
    !isLoading &&
    !contextResolutionBlocked &&
    contextAllowsAccountCreation

  // Show the claim/continuation result whenever a claim is active. This covers
  // both the same-device path (after form submit) and the cross-device resume,
  // where the confirming device lands here already authenticated with a valid
  // context and the claim runs without a fresh form submission.
  const accountHeader = (
    <header
      className={`mb-6 w-full px-1 ${variant === 'progressive' ? 'text-left' : 'max-w-[500px] text-center'}`}
    >
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
      {showPurchaseVerifiedInHeader ? (
        variant === 'progressive' ? (
          <div className="mb-4">
            <PurchaseVerifiedBadge label="Order verified" />
            {verifiedOrderId ? (
              <p
                data-testid="activation-verified-order-id"
                className="mt-2 font-mono text-[12px] leading-snug text-white/55"
              >
                Order ID:{' '}
                <span className="text-keyline-gold">{verifiedOrderId}</span>
              </p>
            ) : null}
          </div>
        ) : (
          <PurchaseVerifiedBadge className="mb-4" />
        )
      ) : null}
      {variant === 'progressive' ? (
        <>
          <p className="text-[15px] font-semibold leading-snug text-white/90">
            SignMaster 101 UK Road Sign Flashcards
          </p>
          <h2 className="mt-2 text-[clamp(18px,4vw,22px)] font-extrabold leading-tight tracking-tight text-white">
            Create your account to unlock your companion app.
          </h2>
        </>
      ) : (
        <>
          <h1 className="text-[clamp(20px,4.5vw,28px)] font-extrabold leading-tight tracking-tight text-white">
            Create your SignMaster account
          </h1>
          <p className="account-subtitle mx-auto mt-2.5 max-w-[360px] text-[15px] leading-relaxed text-white/70">
            Save your progress and access your free companion app on any device.
          </p>
        </>
      )}
    </header>
  )

  if (claimActive) {
    const claimContent = (
      <>
        {variant === 'page' ? (
          <div
            data-testid="activation-complete-brand-spacing"
            className="mb-[18px] flex w-full flex-col items-center max-[667px]:mb-3"
          >
            <BrandLockup variant="desktop" showDivider={false} />
          </div>
        ) : null}
        <ActivationClaimResult
          claimState={claimState}
          onRetryClaim={retryClaim}
          onSignIn={onSignIn}
          onRestartActivation={onRestartActivation}
          onContinue={onEnterApp}
        />
      </>
    )

    if (variant === 'progressive') {
      return <AccountSetupLayout variant={variant}>{claimContent}</AccountSetupLayout>
    }

    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          {claimContent}
        </div>
      </PageShell>
    )
  }

  if (hideAccountFormForActivation && formStatus !== 'email-confirmation') {
    const activatingContent = (
      <div
        data-testid="activation-claim-pending"
        className="py-2"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-2 text-[15px] leading-[1.55] text-white/70">
          <LoadingSpinner />
          Activating your SignMaster access…
        </span>
      </div>
    )

    if (variant === 'progressive') {
      return (
        <AccountSetupLayout variant={variant}>{activatingContent}</AccountSetupLayout>
      )
    }

    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          {activatingContent}
        </div>
      </PageShell>
    )
  }

  if (formStatus === 'auth-sync-failed' || formStatus === 'auth-sync-retrying') {
    const authSyncRetrying = formStatus === 'auth-sync-retrying'
    const authSyncContent = (
      <>
        {variant === 'page' ? <BrandLockup variant="desktop" /> : null}
        {accountHeader}
        <article
          data-testid="activation-auth-sync-notice"
          className={
            variant === 'progressive'
              ? 'w-full'
              : 'w-full rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-9 text-center backdrop-blur-xl'
          }
        >
          <p className="text-[15px] leading-relaxed text-white/75">
            {AUTH_MESSAGES.accountCreatedSignInIncomplete}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Check your connection and try again. Your account is already created.
          </p>
          <div className="mt-6">
            <PrimaryButton
              type="button"
              enabled={!authSyncRetrying}
              loading={authSyncRetrying}
              onClick={() => {
                void handleRetryAuthSync()
              }}
              className="w-full"
            >
              {authSyncRetrying ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner />
                  Signing you in…
                </span>
              ) : (
                'Retry'
              )}
            </PrimaryButton>
          </div>
          {onSignIn ? (
            <p className="mt-4 text-center text-sm leading-relaxed text-white/[0.62]">
              Already signed in elsewhere?{' '}
              <button
                type="button"
                onClick={onSignIn}
                className="font-semibold text-accent-gold underline underline-offset-2"
              >
                Sign in
              </button>
            </p>
          ) : null}
        </article>
      </>
    )

    if (variant === 'progressive') {
      return <AccountSetupLayout variant={variant}>{authSyncContent}</AccountSetupLayout>
    }

    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          {authSyncContent}
        </div>
      </PageShell>
    )
  }

  if (formStatus === 'email-confirmation') {
    const emailConfirmationContent = (
      <>
        {variant === 'page' ? <BrandLockup variant="desktop" /> : null}
        <EmailConfirmationContinuation
          onConfirmed={handleEmailConfirmed}
          onSignIn={onSignIn}
          onChangeEmail={handleChangeEmail}
          recheck={recheckEmailConfirmation}
        />
      </>
    )

    if (variant === 'progressive') {
      return (
        <AccountSetupLayout variant={variant}>{emailConfirmationContent}</AccountSetupLayout>
      )
    }

    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          {emailConfirmationContent}
        </div>
      </PageShell>
    )
  }

  return (
    <AccountSetupLayout variant={variant} brandSpacingTestId="create-account-brand-spacing">
      {accountHeader}

      <article
        className={
          variant === 'progressive'
            ? 'w-full'
            : 'w-full rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-6 pb-7 backdrop-blur-xl'
        }
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

            <SocialAuthOptions
              onGoogleClick={() => {
                void handleGoogleSignIn()
              }}
              googleLoading={googleLoading}
              disabled={!googleSignInEnabled}
              error={socialOAuthError}
            />

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
    </AccountSetupLayout>
  )
}

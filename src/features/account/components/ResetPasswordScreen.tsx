import { FormEvent, useCallback, useRef, useState } from 'react'
import PageShell from '../../../components/layout/PageShell'
import BrandLockup from '../../activation/components/BrandLockup'
import ActivationStatusPlate from '../../activation/components/ActivationStatusPlate'
import FieldError from '../../activation/components/FieldError'
import LoadingSpinner from '../../activation/components/LoadingSpinner'
import PrimaryButton from '../../activation/components/PrimaryButton'
import { authService } from '../../../lib/auth/authService'
import { useAuthContext } from '../../auth/context/AuthProvider'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import {
  type AccountFieldName,
  type AccountFieldState,
  type ResetPasswordScreenProps,
  type ResetPasswordSubmitStatus,
} from '../types'
import { accountInputClasses, accountLabelClassName } from '../utils/fieldStyles'
import {
  hasMinPasswordLength,
  hasNumberOrSymbol,
  isValidPassword,
  passwordsMatch,
} from '../utils/validation'
import EyeToggle from './EyeToggle'
import PasswordRequirement from './PasswordRequirement'
import ValidTick from './ValidTick'

type RecoveryView = 'checking' | 'ready' | 'invalid'

function CheckingCard() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="reset-password-checking"
      className="flex w-full items-center gap-3 rounded-md border border-white/20 bg-keyline-pane px-4 py-4 text-left"
    >
      <LoadingSpinner />
      <p className="text-[14px] font-semibold leading-snug text-white/80">
        Checking your reset link…
      </p>
    </div>
  )
}

function PasswordUpdatedCard({ onContinue }: { onContinue: () => void }) {
  return (
    <article
      className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-9 text-center backdrop-blur-xl"
      data-testid="reset-password-success"
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
      <p className="text-xl font-extrabold tracking-tight text-white">Password updated</p>
      <p className="mx-auto mt-2 max-w-[320px] text-sm leading-relaxed text-white/65">
        Your password has been changed and you&apos;re signed in. You can carry on where you left
        off.
      </p>
      <div className="mt-6">
        <PrimaryButton type="button" enabled onClick={onContinue} className="w-full">
          Continue
        </PrimaryButton>
      </div>
    </article>
  )
}

export default function ResetPasswordScreen({
  updatePassword = authService.updatePassword.bind(authService),
  onContinue,
  onSignIn,
  onRequestNewLink,
}: ResetPasswordScreenProps) {
  const { isInitializing, isPasswordRecovery } = useAuthContext()
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const submitInFlightRef = useRef(false)

  const [recoveryLost, setRecoveryLost] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [focusedField, setFocusedField] = useState<AccountFieldName | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [status, setStatus] = useState<ResetPasswordSubmitStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Recovery authority comes ONLY from Supabase's `PASSWORD_RECOVERY` event
  // (surfaced by AuthProvider as `isPasswordRecovery`). A normal authenticated
  // session is deliberately NOT accepted here — that would be account settings
  // / change-password, which Task 7 does not implement. `recoveryLost` is a
  // sticky flag set when the recovery session dies mid-flow.
  //
  // Reload semantics: the recovery event does not re-fire on reload and cannot
  // be safely re-derived without unsafe client authority, so a hard reload of
  // /reset-password falls back to the safe "request a new reset link" state.
  // A late-arriving event (while still on the same page load) flips checking →
  // ready, so a genuine recovery entry is never mislabelled invalid.
  const recoveryView: RecoveryView = recoveryLost
    ? 'invalid'
    : isPasswordRecovery
      ? 'ready'
      : isInitializing
        ? 'checking'
        : 'invalid'

  const pwLengthOk = hasMinPasswordLength(password)
  const pwSymbolOk = hasNumberOrSymbol(password)
  const passwordOk = isValidPassword(password)
  const matchOk = passwordsMatch(password, confirm)

  const showPwErr = (passwordTouched || submitAttempted) && !passwordOk
  const showMatchErr = (confirmTouched || submitAttempted) && !matchOk && confirm !== ''
  const showMatchEmpty = submitAttempted && confirm === ''

  const isLoading = status === 'loading'
  const canSubmit = passwordOk && matchOk && !isLoading

  function fieldState(field: AccountFieldName): AccountFieldState {
    const isFocused = focusedField === field

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

      setSubmitAttempted(true)
      setPasswordTouched(true)
      setConfirmTouched(true)
      setErrorMessage(null)

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
      setStatus('loading')

      try {
        const result = await updatePassword(password)

        if (result.kind === 'success') {
          setStatus('success')
          return
        }

        if (result.kind === 'invalid_recovery_session') {
          // The recovery session died mid-flow — send the user to safe recovery.
          setStatus('idle')
          setRecoveryLost(true)
          return
        }

        if (result.kind === 'weak_password') {
          setErrorMessage(AUTH_MESSAGES.passwordUpdateWeak)
          setStatus('idle')
          passwordRef.current?.focus()
          return
        }

        // service_unavailable / connection_error / unknown_error — transient.
        setErrorMessage(AUTH_MESSAGES.passwordUpdateTemporaryFailure)
        setStatus('idle')
      } catch {
        setErrorMessage(AUTH_MESSAGES.passwordUpdateTemporaryFailure)
        setStatus('idle')
      } finally {
        submitInFlightRef.current = false
      }
    },
    [matchOk, password, passwordOk, updatePassword],
  )

  const handleContinue = useCallback(() => {
    onContinue?.()
  }, [onContinue])

  if (status === 'success') {
    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <BrandLockup variant="desktop" />
          <PasswordUpdatedCard onContinue={handleContinue} />
        </div>
      </PageShell>
    )
  }

  if (recoveryView === 'checking') {
    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <BrandLockup variant="desktop" />
          <div className="w-full">
            <CheckingCard />
          </div>
        </div>
      </PageShell>
    )
  }

  if (recoveryView === 'invalid') {
    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <BrandLockup variant="desktop" />
          <div className="w-full" data-testid="reset-password-invalid">
            <ActivationStatusPlate
              tone="warning"
              heading="This reset link can't be used"
              body={[
                'This password reset link is invalid or has expired.',
                'Request a new reset email, or return to sign in.',
              ]}
              primaryAction={
                onRequestNewLink
                  ? { label: 'Request a new link', onClick: onRequestNewLink }
                  : undefined
              }
              secondaryAction={
                onSignIn ? { label: 'Back to sign in', onClick: onSignIn } : undefined
              }
            />
          </div>
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
            Choose a new password
          </h1>
          <p className="account-subtitle mx-auto mt-2.5 max-w-[360px] text-[15px] leading-relaxed text-white/70">
            Enter a new password for your SignMaster account.
          </p>
        </header>

        <article className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-6 pb-7 backdrop-blur-xl">
          {errorMessage ? (
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
            aria-label="Choose a new SignMaster password form"
            className="flex flex-col gap-[18px]"
          >
            <fieldset className="flex flex-col gap-[18px] border-0 p-0">
              <legend className="sr-only">New password details</legend>

              <div>
                <label htmlFor="new-password" className={accountLabelClassName}>
                  New Password
                </label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    id="new-password"
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
                    aria-describedby="new-password-reqs"
                    className={accountInputClasses(fieldState('password'), true)}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <EyeToggle
                      visible={showPassword}
                      onToggle={() => setShowPassword((current) => !current)}
                    />
                  </div>
                </div>
                <div id="new-password-reqs" className="mt-2 flex flex-col gap-1">
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
                <label htmlFor="confirm-new-password" className={accountLabelClassName}>
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    ref={confirmRef}
                    id="confirm-new-password"
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
                    placeholder="Repeat your new password"
                    aria-invalid={showMatchErr || showMatchEmpty}
                    aria-describedby={
                      showMatchErr || showMatchEmpty ? 'confirm-new-password-error' : undefined
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
                  <FieldError id="confirm-new-password-error">
                    Passwords don&apos;t match. Please try again.
                  </FieldError>
                ) : null}
                {showMatchEmpty ? (
                  <FieldError id="confirm-new-password-error">
                    Please confirm your password.
                  </FieldError>
                ) : null}
              </div>
            </fieldset>

            <PrimaryButton type="submit" enabled={canSubmit} loading={isLoading} className="w-full">
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner />
                  Updating password…
                </span>
              ) : (
                'Update password'
              )}
            </PrimaryButton>

            {onSignIn ? (
              <p className="mt-1 text-center text-sm leading-relaxed text-white/[0.62]">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="font-semibold text-accent-gold underline underline-offset-2"
                >
                  Back to sign in
                </button>
              </p>
            ) : null}
          </form>
        </article>
      </div>
    </PageShell>
  )
}

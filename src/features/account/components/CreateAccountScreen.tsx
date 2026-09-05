import { FormEvent, useCallback, useRef, useState } from 'react'
import PageShell from '../../../components/layout/PageShell'
import BrandLockup from '../../activation/components/BrandLockup'
import FieldError from '../../activation/components/FieldError'
import {
  ACCOUNT_STORAGE_KEY,
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
  shouldSimulateExistingAccount,
} from '../utils/validation'
import EyeToggle from './EyeToggle'
import PasswordRequirement from './PasswordRequirement'
import ValidTick from './ValidTick'

const CREATE_ACCOUNT_DELAY_MS = 1800

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
          An account already exists with this email.{' '}
          <button
            type="button"
            onClick={onSignIn}
            className="font-bold text-accent-gold underline underline-offset-2"
          >
            Sign in to continue.
          </button>
        </p>
        <p className="mt-1.5 text-xs leading-snug text-white/60">
          Or use a different email address to create a new account.
        </p>
      </div>
    </div>
  )
}

function AccountSuccessCard() {
  return (
    <article className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-9 text-center backdrop-blur-xl">
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
        Welcome to SignMaster. Your companion app is ready.
      </p>
    </article>
  )
}

export default function CreateAccountScreen({
  onComplete,
  onSignIn,
}: CreateAccountScreenProps) {
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

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
  const [formStatus, setFormStatus] = useState<CreateAccountStatus>(() =>
    localStorage.getItem(ACCOUNT_STORAGE_KEY) === 'true' ? 'done' : 'idle',
  )

  const emailOk = isValidEmail(email)
  const pwLengthOk = hasMinPasswordLength(password)
  const pwSymbolOk = hasNumberOrSymbol(password)
  const passwordOk = isValidPassword(password)
  const matchOk = passwordsMatch(password, confirm)

  const showEmailErr = (emailTouched || submitAttempted) && !emailOk
  const showPwErr = (passwordTouched || submitAttempted) && !passwordOk
  const showMatchErr = (confirmTouched || submitAttempted) && !matchOk && confirm !== ''
  const showMatchEmpty = submitAttempted && confirm === ''

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

      setFormStatus('loading')
      await new Promise((resolve) => window.setTimeout(resolve, CREATE_ACCOUNT_DELAY_MS))

      if (shouldSimulateExistingAccount(email)) {
        setFormStatus('existing-account')
        return
      }

      localStorage.setItem(ACCOUNT_STORAGE_KEY, 'true')
      setFormStatus('done')
      onComplete?.()
    },
    [email, emailOk, matchOk, onComplete, passwordOk],
  )

  const isLoading = formStatus === 'loading'
  const canSubmit = emailOk && passwordOk && matchOk && !isLoading

  if (formStatus === 'done') {
    return (
      <PageShell>
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <BrandLockup variant="desktop" />
          <AccountSuccessCard />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="flex w-full max-w-[420px] flex-col items-center">
        <BrandLockup variant="desktop" />

        <header className="mb-6 w-full max-w-[500px] px-1 text-center">
          <PurchaseVerifiedBadge />
          <h1 className="text-[clamp(20px,4.5vw,28px)] font-extrabold leading-tight tracking-tight text-white">
            Create your SignMaster account
          </h1>
          <p className="account-subtitle mx-auto mt-2.5 max-w-[360px] text-[15px] leading-relaxed text-white/70">
            Save your progress and access your free companion app on any device.
          </p>
        </header>

        <article className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-6 pb-7 backdrop-blur-xl">
          {formStatus === 'existing-account' ? (
            <ExistingAccountAlert onSignIn={onSignIn} />
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

            <button
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border-0 px-6 py-[15px] text-[15px] font-bold tracking-wide transition-[background,color,box-shadow] duration-200 ${
                canSubmit
                  ? 'cursor-pointer bg-gradient-cta text-[#0a1628] shadow-[0_3px_12px_rgba(240,192,74,0.18)] hover:shadow-[0_6px_20px_rgba(240,192,74,0.28)]'
                  : 'cursor-not-allowed bg-white/10 text-white/55'
              }`}
            >
              {isLoading ? (
                <>
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="animate-spin"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray="28"
                      strokeDashoffset="10"
                      strokeLinecap="round"
                    />
                  </svg>
                  Creating your account…
                </>
              ) : (
                'Create Account & Continue'
              )}
            </button>

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

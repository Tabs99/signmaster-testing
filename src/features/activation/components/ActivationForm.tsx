import { FormEvent, useRef, useState } from 'react'
import { ACTIVATION_STORAGE_KEY, type ActivationFormProps, type ActivationStatus } from '../types'
import { formatOrderId, normalisePostcode } from '../utils/formatting'
import { prefersReducedMotion } from '../utils/motion'
import {
  isValidOrderId,
  isValidPostcode,
  shouldSimulateVerificationFailure,
} from '../utils/validation'
import FieldError from './FieldError'
import HelpOverlay from './HelpOverlay'
import OrderIdHint from './OrderIdHint'
import SignMasterLogo from './SignMasterLogo'

const VERIFICATION_DELAY_MS = 1800

function inputClasses(hasError: boolean, isFocused: boolean): string {
  const base =
    'min-h-11 w-full rounded-lg px-4 py-3.5 text-[15px] text-white outline-none transition-[border-color,background-color] duration-200 placeholder:text-white/55'

  if (hasError) {
    return `${base} border border-error/60 bg-error/10`
  }

  if (isFocused) {
    return `${base} border border-accent-gold/60 bg-white/[0.07]`
  }

  return `${base} border border-white/20 bg-white/[0.07]`
}

export default function ActivationForm({ onSuccess }: ActivationFormProps) {
  const orderIdRef = useRef<HTMLInputElement>(null)
  const postcodeRef = useRef<HTMLInputElement>(null)

  const [orderId, setOrderId] = useState('')
  const [postcode, setPostcode] = useState('')
  const [orderIdTouched, setOrderIdTouched] = useState(false)
  const [postcodeTouched, setPostcodeTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [status, setStatus] = useState<ActivationStatus>('idle')
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpInitialIndex, setHelpInitialIndex] = useState(-1)
  const [focusedField, setFocusedField] = useState<'orderId' | 'postcode' | null>(null)

  const orderIdValid = isValidOrderId(orderId)
  const postcodeValid = isValidPostcode(postcode)
  const showOrderIdError = (orderIdTouched || submitAttempted) && !orderIdValid
  const showPostcodeError = (postcodeTouched || submitAttempted) && !postcodeValid
  const canSubmit = orderIdValid && postcodeValid && status !== 'loading'

  function openHelp(initialIndex = -1) {
    setHelpInitialIndex(initialIndex)
    setHelpOpen(true)
  }

  function scrollFieldIntoView(element: HTMLElement) {
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth'

    window.setTimeout(() => {
      element.closest('[data-field]')?.scrollIntoView({ behavior, block: 'nearest' })
    }, 300)
  }

  function handleReset() {
    setStatus('idle')
    setOrderIdTouched(false)
    setPostcodeTouched(false)
    setSubmitAttempted(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitAttempted(true)
    setOrderIdTouched(true)
    setPostcodeTouched(true)

    if (!orderIdValid) {
      orderIdRef.current?.focus()
      return
    }

    if (!postcodeValid) {
      postcodeRef.current?.focus()
      return
    }

    setStatus('loading')
    await new Promise((resolve) => window.setTimeout(resolve, VERIFICATION_DELAY_MS))

    if (shouldSimulateVerificationFailure(orderId, postcode)) {
      setStatus('failed')
      return
    }

    localStorage.setItem(ACTIVATION_STORAGE_KEY, 'true')
    onSuccess?.()
  }

  return (
    <>
      <main className="flex min-h-dvh w-full max-w-[100vw] flex-col items-center overflow-x-hidden bg-gradient-page px-5 pb-[calc(56px+env(safe-area-inset-bottom))] pt-[calc(max(16px,3vh)+env(safe-area-inset-top))] font-sans">
        <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
          <SignMasterLogo />

          <header className="mb-7 w-full text-center">
            <h1 className="text-[clamp(26px,6.5vw,36px)] font-extrabold leading-[1.15] tracking-tight text-white">
              Verify Your Purchase
            </h1>
            <p className="activation-subtitle mx-auto mt-2.5 max-w-[380px] text-[15px] leading-relaxed text-white/75">
              Enter your Amazon order details to unlock your free SignMaster companion
              app.
            </p>
          </header>

          <article className="w-full rounded-2xl border border-white/10 bg-white/[0.045] p-5 pb-7 backdrop-blur-xl sm:px-5">
            {status === 'failed' ? (
              <div>
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-error/30 bg-error/10 px-4 py-3.5"
                >
                  <svg
                    aria-hidden="true"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    className="mt-0.5 shrink-0"
                  >
                    <circle cx="9" cy="9" r="8" stroke="#ff6b6b" strokeWidth="1.5" />
                    <path
                      d="M9 5v5M9 12.5h.01"
                      stroke="#ff6b6b"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-bold text-error">
                      We couldn&apos;t verify your order
                    </p>
                    <p className="mt-1 text-[13px] leading-snug text-white/65">
                      The Order ID or delivery postcode doesn&apos;t match our records.
                      Please check your details and try again.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="min-h-11 w-full rounded-[10px] border-0 bg-white/10 px-6 py-3.5 text-[15px] font-semibold text-white/80"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={() => openHelp(1)}
                  className="mt-2.5 min-h-11 w-full rounded-[10px] border border-accent-gold/30 bg-transparent px-6 py-3 text-sm font-semibold text-accent-gold/85"
                >
                  Get Help with Order Details
                </button>
              </div>
            ) : (
              <form noValidate onSubmit={handleSubmit} aria-label="Amazon order verification form">
                <fieldset className="border-0 p-0">
                  <legend className="sr-only">Amazon order verification details</legend>

                  <div data-field className="mb-0">
                    <label
                      htmlFor="order-id"
                      className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-accent-gold"
                    >
                      Amazon Order ID
                    </label>
                    <input
                      ref={orderIdRef}
                      id="order-id"
                      name="orderId"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={orderId}
                      onChange={(event) => setOrderId(formatOrderId(event.target.value))}
                      onFocus={(event) => {
                        setFocusedField('orderId')
                        scrollFieldIntoView(event.currentTarget)
                      }}
                      onBlur={() => {
                        setFocusedField(null)
                        setOrderIdTouched(true)
                      }}
                      placeholder="e.g., 202-1234567-8901234"
                      aria-invalid={showOrderIdError}
                      aria-describedby={showOrderIdError ? 'order-id-error' : undefined}
                      className={inputClasses(showOrderIdError, focusedField === 'orderId')}
                    />
                    {showOrderIdError ? (
                      <FieldError id="order-id-error">
                        <span>
                          Enter a valid Amazon Order ID, for example{' '}
                          <span className="font-mono text-[clamp(11px,3vw,12px)] whitespace-nowrap">
                            202&#8209;1234567&#8209;8901234
                          </span>
                          .
                        </span>
                      </FieldError>
                    ) : (
                      <OrderIdHint onOpenHelp={() => openHelp(0)} />
                    )}
                  </div>

                  <div data-field className="mb-0">
                    <label
                      htmlFor="postcode"
                      className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-accent-gold"
                    >
                      Delivery Postcode
                    </label>
                    <input
                      ref={postcodeRef}
                      id="postcode"
                      name="postcode"
                      type="text"
                      autoComplete="postal-code"
                      value={postcode}
                      onChange={(event) =>
                        setPostcode(event.target.value.toUpperCase())
                      }
                      onFocus={(event) => {
                        setFocusedField('postcode')
                        scrollFieldIntoView(event.currentTarget)
                      }}
                      onBlur={() => {
                        setFocusedField(null)
                        setPostcodeTouched(true)
                        setPostcode((current) => normalisePostcode(current))
                      }}
                      placeholder="e.g., CV21 1AA"
                      aria-invalid={showPostcodeError}
                      aria-describedby={showPostcodeError ? 'postcode-error' : undefined}
                      className={inputClasses(showPostcodeError, focusedField === 'postcode')}
                    />
                    {showPostcodeError ? (
                      <FieldError id="postcode-error">
                        Enter a valid UK delivery postcode, for example{' '}
                        <span className="font-mono whitespace-nowrap">AA1 1AA</span>.
                      </FieldError>
                    ) : null}
                  </div>
                </fieldset>

                <p
                  className={`activation-privacy flex items-start gap-1.5 text-xs leading-snug text-white/70 ${
                    showPostcodeError ? 'mb-6 mt-0' : 'mb-6 mt-2.5'
                  }`}
                >
                  <svg
                    aria-hidden="true"
                    width="13"
                    height="13"
                    viewBox="0 0 13 13"
                    fill="none"
                    className="mt-0.5 shrink-0"
                  >
                    <path
                      d="M6.5 1.5L2 3.5V7c0 2.485 1.96 4.614 4.5 5 2.54-.386 4.5-2.515 4.5-5V3.5L6.5 1.5Z"
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  We use these details only to verify your Amazon purchase and will not use
                  them for marketing.
                </p>

                <footer>
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
                    {status === 'loading' ? (
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
                        Verifying…
                      </>
                    ) : (
                      'Verify Order & Continue'
                    )}
                  </button>
                </footer>
              </form>
            )}
          </article>

          <p className="activation-footer mt-2 text-center text-sm leading-snug text-white/65">
            Having trouble finding your order details?
            <br />
            <button
              type="button"
              onClick={() => openHelp(-1)}
              className="inline-flex min-h-11 items-center border-b border-accent-gold/40 px-1 py-2.5 text-sm font-semibold text-accent-gold transition-opacity hover:opacity-80"
            >
              Get Help
            </button>
          </p>
        </div>
      </main>

      {helpOpen ? (
        <HelpOverlay
          onClose={() => setHelpOpen(false)}
          initialOpenIndex={helpInitialIndex}
        />
      ) : null}
    </>
  )
}

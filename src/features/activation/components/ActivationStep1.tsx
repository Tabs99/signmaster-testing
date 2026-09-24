import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  createActivationContext,
} from '../../../lib/api/activationContextApi'
import {
  verifyActivationOrder,
  type ActivationVerifyResult,
} from '../../../lib/api/activationApi'
import type { HelpSheetSection } from '../types'
import {
  getActivationStatusContent,
  mapVerifyResultToKind,
  type ActivationResultKind,
  type ActivationStep1Props,
  type ActivationUiPhase,
} from '../types/activationResult'
import {
  clearActivationEntryDeferral,
  deferActivationEntryResume,
  isActivationEntryDeferred,
} from '../utils/progressiveActivationSession'
import {
  isValidOrderId,
  VALIDATION_MESSAGES,
} from '../utils/validation'

/**
 * Trailing debounce before auto-verifying a complete, structurally valid Order
 * ID. Short enough to feel instant, long enough to coalesce fast typing/paste
 * into a single verification.
 */
const AUTO_VERIFY_DEBOUNCE_MS = 300
import ActivationShell from './ActivationShell'
import ActivationStatusPlate from './ActivationStatusPlate'
import BrandLockup from './BrandLockup'
import CheckingOrderButton from './CheckingOrderButton'
import HelpSheet from './HelpSheet'
import LoadingSpinner from './LoadingSpinner'
import KeylinePlate from './KeylinePlate'
import OrderIdField from './OrderIdField'
import PrimaryButton from './PrimaryButton'
import ActivationAccountSetup from '../../account/components/ActivationAccountSetup'
import { useActivationContextResolution } from '../hooks/useActivationContextResolution'

export default function ActivationStep1({
  verifyOrder = verifyActivationOrder,
  createContext = createActivationContext,
  onContinueToAccount: _legacyOnContinueToAccount,
  onSignIn,
  onEnterApp,
}: ActivationStep1Props = {}) {
  void _legacyOnContinueToAccount
  const orderIdRef = useRef<HTMLInputElement>(null)
  const showMeWhereRef = useRef<HTMLButtonElement>(null)
  const getSupportRef = useRef<HTMLButtonElement>(null)
  const helpReturnFocusRef = useRef<HTMLElement | null>(null)
  const verifyInFlightRef = useRef(false)
  const contextCreateInFlightRef = useRef(false)
  // The last normalized Order ID for which a verification was *started* (manual
  // or automatic). Lets auto-verification skip a value that has already been
  // requested, so the same unchanged Order ID is never verified twice.
  const lastRequestedOrderIdRef = useRef<string | null>(null)
  const eligibleContextCreateStartedRef = useRef(false)

  const [orderId, setOrderId] = useState('')
  const [accountSetupUnlocked, setAccountSetupUnlocked] = useState(false)
  const [activated, setActivated] = useState(false)
  const [autoVerifyEligible, setAutoVerifyEligible] = useState(false)
  const [orderIdSourceWithinLimit, setOrderIdSourceWithinLimit] = useState(true)
  const [fieldTouched, setFieldTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [phase, setPhase] = useState<ActivationUiPhase>('entry')
  const [resultKind, setResultKind] = useState<ActivationResultKind | null>(null)
  const [presentedResultKind, setPresentedResultKind] =
    useState<ActivationResultKind | null>(null)
  const [rateLimitRetryAt, setRateLimitRetryAt] = useState<number | null>(null)
  const [rateLimitRetryReady, setRateLimitRetryReady] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpInitialSection, setHelpInitialSection] = useState<HelpSheetSection | null>(0)
  const [helpTitle, setHelpTitle] = useState('Finding your Amazon order number')
  const [contextCreating, setContextCreating] = useState(false)
  const activationContextResolution = useActivationContextResolution()
  const { status: resolvedContextStatus, isLoading: contextResolving } =
    activationContextResolution
  const isInitialContextRestoring =
    !accountSetupUnlocked &&
    (contextResolving ||
      (resolvedContextStatus === 'VALID' && !isActivationEntryDeferred()))

  const orderIdValid = isValidOrderId(orderId)
  const orderIdSubmittable = orderIdValid && orderIdSourceWithinLimit
  const overlongRawSource = orderIdValid && !orderIdSourceWithinLimit
  const showOrderIdError =
    (fieldTouched || submitAttempted || overlongRawSource) && !orderIdSubmittable
  const orderIdErrorOverride =
    showOrderIdError && orderIdValid && !orderIdSourceWithinLimit
      ? VALIDATION_MESSAGES.orderIdRawTooLong
      : null
  const isChecking = phase === 'checking'
  const isEligiblePreparing =
    resultKind === 'eligible' && !accountSetupUnlocked && phase === 'result'
  const canSubmit =
    orderIdSubmittable &&
    !isChecking &&
    !isEligiblePreparing &&
    !contextResolving

  useEffect(() => {
    if (resultKind !== 'rate_limited' || rateLimitRetryAt === null) {
      setRateLimitRetryReady(false)
      return
    }

    const remainingMs = rateLimitRetryAt - Date.now()
    if (remainingMs <= 0) {
      setRateLimitRetryReady(true)
      return
    }

    setRateLimitRetryReady(false)
    const timeoutId = globalThis.setTimeout(() => {
      setRateLimitRetryReady(true)
    }, remainingMs)

    return () => globalThis.clearTimeout(timeoutId)
  }, [resultKind, rateLimitRetryAt])

  function openHelp(
    section: HelpSheetSection | null,
    returnFocus: HTMLElement | null,
    title: string,
  ) {
    helpReturnFocusRef.current = returnFocus
    setHelpInitialSection(section)
    setHelpTitle(title)
    setHelpOpen(true)
  }

  const runVerification = useCallback(
    async (orderIdToVerify: string) => {
      if (verifyInFlightRef.current) {
        return
      }

      verifyInFlightRef.current = true
      lastRequestedOrderIdRef.current = orderIdToVerify
      setPhase('checking')

      try {
        const result = await verifyOrder(orderIdToVerify)
        await applyVerificationResult(result)
      } finally {
        verifyInFlightRef.current = false
      }
    },
    [verifyOrder],
  )

  // Auto-verify once a complete, structurally valid Order ID has settled. The
  // frontend never verifies incomplete/malformed input, never verifies on every
  // keystroke (trailing debounce), and never re-verifies the same normalized
  // value (dedupe latch). Entering the `checking` phase re-runs this effect and
  // its cleanup cancels any pending timer, so a manual submit cannot race a
  // queued auto-verification into a duplicate request.
  useEffect(() => {
    if (orderId === '') {
      // A deliberate clear (e.g. "Use another order") resets the latch so a
      // fresh, intentional re-entry can verify again.
      lastRequestedOrderIdRef.current = null
      return
    }

    if (
      phase !== 'entry' ||
      contextResolving ||
      !orderIdSubmittable ||
      !autoVerifyEligible ||
      verifyInFlightRef.current ||
      orderId === lastRequestedOrderIdRef.current
    ) {
      return
    }

    const timeoutId = globalThis.setTimeout(() => {
      void runVerification(orderId)
    }, AUTO_VERIFY_DEBOUNCE_MS)

    return () => globalThis.clearTimeout(timeoutId)
  }, [
    orderId,
    orderIdSubmittable,
    autoVerifyEligible,
    contextResolving,
    phase,
    runVerification,
  ])

  // Resume the progressive account step after refresh/navigation when a valid
  // HttpOnly activation context already exists (direct /activate return visits).
  useEffect(() => {
    if (contextResolving || accountSetupUnlocked) {
      return
    }

    if (
      resolvedContextStatus === 'VALID' &&
      !isActivationEntryDeferred()
    ) {
      eligibleContextCreateStartedRef.current = true
      setAccountSetupUnlocked(true)
      setPhase('result')
      setResultKind('eligible')
      setPresentedResultKind('eligible')
    }
  }, [accountSetupUnlocked, contextResolving, resolvedContextStatus])

  async function applyVerificationResult(result: ActivationVerifyResult) {
    if (result.kind === 'invalid_order_id') {
      setPhase('entry')
      setResultKind(null)
      setPresentedResultKind(null)
      setSubmitAttempted(true)
      setFieldTouched(true)
      requestAnimationFrame(() => orderIdRef.current?.focus())
      return
    }

    if (result.kind === 'rate_limited') {
      setResultKind('rate_limited')
      setPresentedResultKind('rate_limited')
      setPhase('result')
      setRateLimitRetryAt(
        result.retryAfterMs !== null ? Date.now() + result.retryAfterMs : null,
      )
      setRateLimitRetryReady(result.retryAfterMs === null ? false : result.retryAfterMs <= 0)
      return
    }

    const kind = mapVerifyResultToKind(result)
    setResultKind(kind)
    setPresentedResultKind(kind)
    setPhase('result')
    setRateLimitRetryAt(null)

    if (kind === 'not_found') {
      // Result plate is shown; customer uses "Check the number" to return to the field.
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitAttempted(true)
    setFieldTouched(true)

    if (!orderIdSubmittable || isChecking || isEligiblePreparing || contextResolving) {
      if (!orderIdSubmittable) {
        orderIdRef.current?.focus()
      }
      return
    }

    void runVerification(orderId)
  }

  function returnToEntry(options?: { clearOrderId?: boolean; focusField?: boolean }) {
    if (options?.clearOrderId) {
      setOrderId('')
      setAutoVerifyEligible(false)
      setOrderIdSourceWithinLimit(true)
    }
    setAccountSetupUnlocked(false)
    eligibleContextCreateStartedRef.current = false
    setPhase('entry')
    setResultKind(null)
    setPresentedResultKind(null)
    setRateLimitRetryAt(null)
    setRateLimitRetryReady(false)
    if (options?.focusField !== false) {
      requestAnimationFrame(() => orderIdRef.current?.focus())
    }
  }

  function handleUseAnotherOrder() {
    deferActivationEntryResume()
    returnToEntry({ clearOrderId: true, focusField: true })
  }

  async function persistEligibleContext(currentOrderId: string) {
    if (contextCreateInFlightRef.current) {
      return false
    }

    contextCreateInFlightRef.current = true
    setContextCreating(true)

    try {
      const result = await createContext(currentOrderId)
      return result.kind === 'created'
    } finally {
      contextCreateInFlightRef.current = false
      setContextCreating(false)
    }
  }

  // After an eligible verification, create the HttpOnly activation context and
  // reveal account setup inline (Checkpoint 3 progressive activation).
  useEffect(() => {
    if (
      resultKind !== 'eligible' ||
      phase !== 'result' ||
      accountSetupUnlocked ||
      contextCreating ||
      eligibleContextCreateStartedRef.current
    ) {
      return
    }

    eligibleContextCreateStartedRef.current = true

    void (async () => {
      const created = await persistEligibleContext(orderId)
      if (created) {
        clearActivationEntryDeferral()
        setAccountSetupUnlocked(true)
        activationContextResolution.retry()
        return
      }

      eligibleContextCreateStartedRef.current = false
      setResultKind('service_unavailable')
      setPresentedResultKind('service_unavailable')
    })()
  }, [resultKind, phase, accountSetupUnlocked, contextCreating, orderId])

  async function handleStatusPrimaryAction() {
    if (!resultKind) {
      return
    }

    switch (resultKind) {
      case 'eligible':
        break
      case 'not_found':
        returnToEntry({ focusField: true })
        break
      case 'not_shipped':
      case 'service_unavailable':
      case 'connection_error':
        void runVerification(orderId)
        break
      case 'already_claimed':
        onSignIn?.()
        break
      case 'cancelled':
      case 'returned':
        returnToEntry({ clearOrderId: true, focusField: true })
        break
      case 'rate_limited':
        if (rateLimitRetryReady) {
          void runVerification(orderId)
        }
        break
    }
  }

  function handleStatusSecondaryAction() {
    if (!resultKind) {
      return
    }

    const content = getActivationStatusContent(resultKind)

    if (content.secondaryKind === 'help') {
      openHelp(0, showMeWhereRef.current, 'Finding your Amazon order number')
      return
    }

    if (content.secondaryKind === 'use_another_order') {
      handleUseAnotherOrder()
      return
    }

    openHelp(2, getSupportRef.current, 'SignMaster activation help')
  }

  function resolvePrimaryAction() {
    if (!resultKind) {
      return undefined
    }

    const content = getActivationStatusContent(resultKind)

    if (resultKind === 'eligible') {
      if (contextCreating) {
        return {
          label: 'Preparing account setup…',
          onClick: () => undefined,
          disabled: true,
          loading: true,
        }
      }

      return undefined
    }

    if (resultKind === 'already_claimed' && !onSignIn) {
      return undefined
    }

    const disabled =
      resultKind === 'rate_limited' &&
      (rateLimitRetryAt !== null ? !rateLimitRetryReady : true)

    return {
      label: content.primaryLabel,
      onClick: () => {
        void handleStatusPrimaryAction()
      },
      disabled,
      loading: false,
    }
  }

  function resolveSecondaryAction() {
    if (!resultKind) {
      return undefined
    }

    const content = getActivationStatusContent(resultKind)
    if (!content.secondaryLabel) {
      return undefined
    }

    return {
      label: content.secondaryLabel,
      onClick: handleStatusSecondaryAction,
    }
  }

  const statusContent = presentedResultKind
    ? getActivationStatusContent(presentedResultKind)
    : null
  const isResultChecking = phase === 'checking' && presentedResultKind !== null
  const showStatusPlate = Boolean(
    !accountSetupUnlocked &&
      presentedResultKind &&
      presentedResultKind !== 'eligible' &&
      (phase === 'result' || isResultChecking),
  )

  function resolveRetryCheckingPrimaryAction() {
    return {
      label: 'Checking your order…',
      onClick: () => undefined,
      disabled: true,
      loading: true,
    }
  }

  return (
    <>
      <ActivationShell>
        <BrandLockup variant="mobile" />

        <header className="mb-5 max-[667px]:mb-3">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-step text-keyline-gold">
            {accountSetupUnlocked
              ? 'Step 2 of 2 · Create account'
              : 'Step 1 of 2 · Verify purchase'}
          </p>
          <h1 className="mt-[11px] text-[29px] font-extrabold leading-[1.08] tracking-[-0.022em] text-white max-[667px]:mt-2 lg:text-[30px]">
            {accountSetupUnlocked ? 'Complete your SignMaster setup' : 'Unlock your SignMaster app'}
          </h1>
          {accountSetupUnlocked ? (
            <p className="mt-[11px] text-[15px] leading-[1.55] text-white/70 max-[667px]:mt-2">
              Your purchase is verified. Create an account or sign in to activate access.
            </p>
          ) : (
            <p className="mt-[11px] text-[15px] leading-[1.55] text-white/70 max-[667px]:mt-2">
              Enter the Amazon order number for your{' '}
              <span className="font-semibold text-white/90">101 UK Road Sign Flashcards</span>. App
              access is included with your pack at no extra cost.
            </p>
          )}
        </header>

        <KeylinePlate className="mt-5 max-[667px]:mt-3">
          {accountSetupUnlocked ? (
            <ActivationAccountSetup
              variant="progressive"
              verifiedOrderId={orderIdSubmittable ? orderId : undefined}
              activationContextResolution={activationContextResolution}
              onSignIn={onSignIn}
              onRestartActivation={handleUseAnotherOrder}
              onEnterApp={onEnterApp}
              onActivatedChange={setActivated}
            />
          ) : isInitialContextRestoring ? (
            <div
              data-testid="activation-context-restoring"
              className="py-2"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-2 text-[15px] leading-[1.55] text-white/70">
                <LoadingSpinner />
                Restoring your activation…
              </span>
            </div>
          ) : showStatusPlate && statusContent ? (
            <ActivationStatusPlate
              data-testid="activation-result-card"
              tone={statusContent.tone}
              heading={statusContent.heading}
              body={statusContent.body}
              orderId={statusContent.showOrderId ? orderId : undefined}
              primaryAction={
                isResultChecking ? resolveRetryCheckingPrimaryAction() : resolvePrimaryAction()
              }
              secondaryAction={isResultChecking ? undefined : resolveSecondaryAction()}
              checking={isResultChecking}
            />
          ) : (
            <form
              data-testid="activation-entry-form"
              data-eligible-preparing={isEligiblePreparing ? 'true' : undefined}
              noValidate
              onSubmit={handleSubmit}
              aria-label="Amazon order verification form"
            >
              <OrderIdField
                value={orderId}
                onChange={(value, meta) => {
                  setOrderId(value)
                  setAutoVerifyEligible(meta.autoVerifyEligible)
                  setOrderIdSourceWithinLimit(meta.sourceWithinDigitLimit)
                }}
                onOpenHelp={() =>
                  openHelp(0, showMeWhereRef.current, 'Finding your Amazon order number')
                }
                showError={showOrderIdError}
                errorMessageOverride={orderIdErrorOverride}
                disabled={isChecking || isEligiblePreparing}
                inputRef={orderIdRef}
                helpButtonRef={showMeWhereRef}
              />

              <div className="mt-[18px] max-[667px]:mt-3.5">
                {isChecking ? (
                  <CheckingOrderButton type="submit" />
                ) : isEligiblePreparing ? (
                  <PrimaryButton type="button" enabled={false} loading disabled>
                    <span className="inline-flex items-center gap-2">
                      <LoadingSpinner />
                      Preparing account setup…
                    </span>
                  </PrimaryButton>
                ) : (
                  <PrimaryButton type="submit" enabled={canSubmit}>
                    Check my order
                  </PrimaryButton>
                )}
              </div>

              {onSignIn ? (
                <p className="mt-3 text-center text-[13px] leading-[1.55] text-white/[0.55]">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => onSignIn()}
                    className="keyline-support-action font-medium text-white/70"
                  >
                    Sign in
                  </button>
                </p>
              ) : null}
            </form>
          )}
        </KeylinePlate>

        {/*
          Before the claim, "Use another order" is a genuine way out — wrong
          order, wrong deck, a typo. Once the entitlement is claimed it only
          suggests the activation might not have taken, so the support line
          every other state carries takes its place.
        */}
        {accountSetupUnlocked && !activated ? (
          <p className="mt-4 text-center text-[13px] leading-[1.55] text-white/[0.55] max-[667px]:mt-2">
            <button
              type="button"
              onClick={handleUseAnotherOrder}
              className="keyline-support-action"
            >
              Use another order
            </button>
          </p>
        ) : !accountSetupUnlocked ? (
          <p className="mt-4 text-xs leading-[1.55] text-white/[0.5] max-[667px]:mt-2">
            Your order number is used only to verify your purchase and manage your SignMaster
            access.
          </p>
        ) : null}

        {!accountSetupUnlocked || activated ? (
          <p className="mt-auto pt-6 text-center text-[13px] leading-[1.55] text-white/[0.55] max-[667px]:pt-2 lg:pt-8 lg:text-left">
            Need help with activation?{' '}
            <button
              ref={getSupportRef}
              type="button"
              onClick={() => openHelp(2, getSupportRef.current, 'SignMaster activation help')}
              className="keyline-support-action"
            >
              Get support
            </button>
          </p>
        ) : null}
      </ActivationShell>

      {helpOpen ? (
        <HelpSheet
          onClose={() => setHelpOpen(false)}
          title={helpTitle}
          initialSection={helpInitialSection}
          returnFocusRef={helpReturnFocusRef}
        />
      ) : null}
    </>
  )
}

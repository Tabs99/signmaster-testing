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
import { isValidOrderId } from '../utils/validation'
import ActivationShell from './ActivationShell'
import ActivationStatusPlate from './ActivationStatusPlate'
import BrandLockup from './BrandLockup'
import CheckingOrderButton from './CheckingOrderButton'
import HelpSheet from './HelpSheet'
import KeylinePlate from './KeylinePlate'
import OrderIdField from './OrderIdField'
import PrimaryButton from './PrimaryButton'

export default function ActivationStep1({
  verifyOrder = verifyActivationOrder,
  createContext = createActivationContext,
  onContinueToAccount,
  onSignIn,
}: ActivationStep1Props = {}) {
  const orderIdRef = useRef<HTMLInputElement>(null)
  const showMeWhereRef = useRef<HTMLButtonElement>(null)
  const getSupportRef = useRef<HTMLButtonElement>(null)
  const helpReturnFocusRef = useRef<HTMLElement | null>(null)
  const verifyInFlightRef = useRef(false)
  const contextCreateInFlightRef = useRef(false)

  const [orderId, setOrderId] = useState('')
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

  const orderIdValid = isValidOrderId(orderId)
  const showOrderIdError = (fieldTouched || submitAttempted) && !orderIdValid
  const isChecking = phase === 'checking'
  const canSubmit = orderIdValid && !isChecking

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

    if (!orderIdValid || isChecking) {
      if (!orderIdValid) {
        orderIdRef.current?.focus()
      }
      return
    }

    void runVerification(orderId)
  }

  function returnToEntry(options?: { clearOrderId?: boolean; focusField?: boolean }) {
    if (options?.clearOrderId) {
      setOrderId('')
    }
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

  async function handleStatusPrimaryAction() {
    if (!resultKind) {
      return
    }

    switch (resultKind) {
      case 'eligible': {
        const created = await persistEligibleContext(orderId)
        if (!created) {
          setResultKind('service_unavailable')
          setPresentedResultKind('service_unavailable')
          return
        }

        onContinueToAccount?.()
        break
      }
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

    if (resultKind === 'eligible' && !onContinueToAccount) {
      return undefined
    }

    if (resultKind === 'already_claimed' && !onSignIn) {
      return undefined
    }

    const disabled =
      (resultKind === 'rate_limited' &&
        (rateLimitRetryAt !== null ? !rateLimitRetryReady : true)) ||
      (resultKind === 'eligible' && contextCreating)

    return {
      label: content.primaryLabel,
      onClick: () => {
        void handleStatusPrimaryAction()
      },
      disabled,
      loading: resultKind === 'eligible' && contextCreating,
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
    presentedResultKind && (phase === 'result' || isResultChecking),
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
            Step 1 of 2 · Verify purchase
          </p>
          <h1 className="mt-[11px] text-[29px] font-extrabold leading-[1.08] tracking-[-0.022em] text-white max-[667px]:mt-2 lg:text-[30px]">
            Unlock your SignMaster app
          </h1>
          <p className="mt-[11px] text-[15px] leading-[1.55] text-white/70 max-[667px]:mt-2">
            Enter the Amazon order number for your{' '}
            <span className="font-semibold text-white/90">101 UK Road Sign Flashcards</span>. App
            access is included with your pack at no extra cost.
          </p>
        </header>

        <KeylinePlate className="mt-5 max-[667px]:mt-3">
          {showStatusPlate && statusContent ? (
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
              noValidate
              onSubmit={handleSubmit}
              aria-label="Amazon order verification form"
            >
              <OrderIdField
                value={orderId}
                onChange={setOrderId}
                onOpenHelp={() =>
                  openHelp(0, showMeWhereRef.current, 'Finding your Amazon order number')
                }
                showError={showOrderIdError}
                disabled={isChecking}
                inputRef={orderIdRef}
                helpButtonRef={showMeWhereRef}
                onBlur={() => setFieldTouched(true)}
              />

              <div className="mt-[18px] max-[667px]:mt-3.5">
                {isChecking ? (
                  <CheckingOrderButton type="submit" />
                ) : (
                  <PrimaryButton type="submit" enabled={canSubmit}>
                    Check my order
                  </PrimaryButton>
                )}
              </div>
            </form>
          )}
        </KeylinePlate>

        <p className="mt-4 text-xs leading-[1.55] text-white/[0.5] max-[667px]:mt-2">
          Your order number is used only to verify your purchase and manage your SignMaster
          access.
        </p>

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

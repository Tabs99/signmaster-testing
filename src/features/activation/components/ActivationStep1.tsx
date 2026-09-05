import { FormEvent, useRef, useState } from 'react'
import type { HelpSheetSection } from '../types'
import { isValidOrderId } from '../utils/validation'
import ActivationShell from './ActivationShell'
import BrandLockup from './BrandLockup'
import HelpSheet from './HelpSheet'
import KeylinePlate from './KeylinePlate'
import OrderIdField from './OrderIdField'
import PrimaryButton from './PrimaryButton'

export default function ActivationStep1() {
  const orderIdRef = useRef<HTMLInputElement>(null)
  const showMeWhereRef = useRef<HTMLButtonElement>(null)
  const getSupportRef = useRef<HTMLButtonElement>(null)
  const helpReturnFocusRef = useRef<HTMLElement | null>(null)

  const [orderId, setOrderId] = useState('')
  const [fieldTouched, setFieldTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpInitialSection, setHelpInitialSection] = useState<HelpSheetSection | null>(0)

  const orderIdValid = isValidOrderId(orderId)
  const showOrderIdError = (fieldTouched || submitAttempted) && !orderIdValid
  const canSubmit = orderIdValid && !isSubmitting

  function openHelp(section: HelpSheetSection | null, returnFocus: HTMLElement | null) {
    helpReturnFocusRef.current = returnFocus
    setHelpInitialSection(section)
    setHelpOpen(true)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitAttempted(true)
    setFieldTouched(true)

    if (!orderIdValid) {
      orderIdRef.current?.focus()
      return
    }

    setIsSubmitting(true)
    window.setTimeout(() => setIsSubmitting(false), 400)
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
            Enter the Amazon order number for your 101 UK Road Sign Flashcards. App access is
            included with your pack at no extra cost.
          </p>
        </header>

        <KeylinePlate className="mt-5 max-[667px]:mt-3">
          <form
            noValidate
            onSubmit={handleSubmit}
            aria-label="Amazon order verification form"
          >
            <OrderIdField
              value={orderId}
              onChange={setOrderId}
              onOpenHelp={() => openHelp(0, showMeWhereRef.current)}
              showError={showOrderIdError}
              inputRef={orderIdRef}
              helpButtonRef={showMeWhereRef}
              onBlur={() => setFieldTouched(true)}
            />

            <div className="mt-[18px] max-[667px]:mt-3.5">
              <PrimaryButton type="submit" enabled={canSubmit} aria-busy={isSubmitting}>
                Check my order
              </PrimaryButton>
            </div>
          </form>
        </KeylinePlate>

        <p className="mt-4 text-xs leading-[1.55] text-white/[0.5] max-[667px]:mt-2">
          Your order number is used only to verify your purchase and manage your SignMaster
          access. Never for marketing.
        </p>

        <p className="mt-auto pt-6 text-center text-[13px] leading-[1.55] text-white/[0.55] max-[667px]:pt-2 lg:pt-8 lg:text-left">
          Need help with activation?{' '}
          <button
            ref={getSupportRef}
            type="button"
            onClick={() => openHelp(2, getSupportRef.current)}
            className="keyline-support-action inline-flex min-h-11 px-0 py-2"
          >
            Get support
          </button>
        </p>
      </ActivationShell>

      {helpOpen ? (
        <HelpSheet
          onClose={() => setHelpOpen(false)}
          initialSection={helpInitialSection}
          returnFocusRef={helpReturnFocusRef}
        />
      ) : null}
    </>
  )
}

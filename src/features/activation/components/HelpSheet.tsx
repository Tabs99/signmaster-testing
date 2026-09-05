import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { HelpSheetProps, HelpSheetSection } from '../types'
import { handleFocusTrapKeyDown } from '../utils/focusTrap'
import { prefersReducedMotion } from '../utils/motion'
import SecondaryButton from './SecondaryButton'

const SUPPORT_EMAIL = 'support@signmastercards.co.uk'

interface AccordionSectionProps {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

function AccordionSection({ title, open, onToggle, children }: AccordionSectionProps) {
  const panelId = useId()

  return (
    <div className="border-b border-white/[0.08] last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="keyline-focus flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="text-[13.5px] font-bold leading-snug text-white">{title}</span>
        <span className="text-[13px] font-semibold text-keyline-gold" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="pb-3">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function resolveInitialOpenSections(
  initialSection: HelpSheetProps['initialSection'],
): Record<HelpSheetSection, boolean> {
  if (initialSection == null) {
    return { 0: true, 1: false, 2: false }
  }

  return {
    0: initialSection === 0,
    1: initialSection === 1,
    2: initialSection === 2,
  }
}

export default function HelpSheet({
  onClose,
  title,
  initialSection = 0,
  returnFocusRef,
}: HelpSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  const [openSections, setOpenSections] = useState(() =>
    resolveInitialOpenSections(initialSection),
  )
  const [copyLabel, setCopyLabel] = useState('Copy')

  const close = useCallback(() => {
    setVisible(false)
    const delay = prefersReducedMotion() ? 0 : 250
    window.setTimeout(() => {
      onClose()
      returnFocusRef?.current?.focus()
    }, delay)
  }, [onClose, returnFocusRef])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
        return
      }

      if (dialogRef.current) {
        handleFocusTrapKeyDown(event, dialogRef.current)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  function toggleSection(section: HelpSheetSection) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setCopyLabel('Copied')
      window.setTimeout(() => setCopyLabel('Copy'), 2000)
    } catch {
      setCopyLabel('Copy')
    }
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      close()
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6 ${
        visible ? 'bg-[rgba(4,8,13,0.72)]' : 'bg-transparent'
      } transition-colors duration-250`}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-sheet-title"
        className={`flex w-full max-w-[620px] flex-col overflow-hidden rounded-t-[14px] border border-white/[0.14] bg-keyline-plate shadow-[0_-8px_40px_rgba(0,0,0,0.45)] transition-transform duration-250 ease-out lg:max-h-[min(85dvh,720px)] lg:rounded-lg ${
          visible ? 'translate-y-0' : 'translate-y-full lg:translate-y-4 lg:opacity-0'
        } max-h-[74dvh]`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4 lg:px-6">
          <h2
            id="help-sheet-title"
            className="text-[19px] font-extrabold leading-[1.2] tracking-[-0.02em] text-white"
          >
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close help"
            className="keyline-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 text-[17px] leading-none text-white"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 lg:px-6 lg:py-4 [scrollbar-gutter:stable]">
          <div className="flex flex-col gap-2">
            <AccordionSection
              title="Where do I find my Order ID?"
              open={openSections[0]}
              onToggle={() => toggleSection(0)}
            >
              <div className="space-y-2.5 text-[13.5px] leading-[1.55] text-white/70">
                <p>
                  <strong className="font-semibold text-white">Amazon app:</strong> tap your
                  profile icon, then Your Orders.
                </p>
                <p>
                  <strong className="font-semibold text-white">Amazon website:</strong> select
                  Returns &amp; Orders.
                </p>
                <p>
                  Open the order containing your SignMaster flashcards and view the order details.
                  You can also find the order number in your Amazon order confirmation email.
                </p>
              </div>
              <div className="mt-3 max-w-full rounded-md border border-dashed border-white/20 px-3 py-3 text-center">
                <p className="font-mono text-[15px] font-medium text-keyline-gold">
                  205-1234567-1234567
                </p>
                <p className="mt-1 px-1 font-mono text-[9.5px] leading-snug text-white/45 sm:text-[10px]">
                  17 digits in 3 groups: 3 digits, 7 digits and 7 digits
                </p>
              </div>
            </AccordionSection>

            <AccordionSection
              title="It isn't being accepted"
              open={openSections[1]}
              onToggle={() => toggleSection(1)}
            >
              <p className="text-[13.5px] leading-[1.55] text-white/70">
                Make sure you&apos;re entering the Amazon Order ID, not a tracking or invoice
                number. If you placed your order recently, it may not be available in SignMaster
                yet. App access becomes available after Amazon dispatches the order. Please try
                again after dispatch.
              </p>
            </AccordionSection>

            <AccordionSection
              title="I still need help"
              open={openSections[2]}
              onToggle={() => toggleSection(2)}
            >
              <p className="text-[13.5px] leading-[1.5] text-white/70">
                Email us your Order ID and tell us what happened. We&apos;ll help you with the next
                step.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=SignMaster%20activation%20help`}
                className="keyline-focus mt-3 inline-flex min-h-11 items-center justify-center rounded-md bg-keyline-gold px-[18px] py-3 text-[13px] font-bold tracking-wide text-keyline-gold-foreground no-underline"
              >
                Email SignMaster support
              </a>
              <div className="mt-3 flex h-11 items-center gap-2 rounded-md border border-white/[0.28] bg-keyline-pane px-3">
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-white">
                  {SUPPORT_EMAIL}
                </span>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="keyline-focus flex h-11 w-[58px] shrink-0 items-center justify-center rounded-md border border-white/[0.28] text-[13px] font-semibold text-white"
                >
                  {copyLabel}
                </button>
              </div>
              <p className="mt-3 hidden text-[12px] leading-[1.55] text-white/50 min-[668px]:block">
                Never include payment or card details. Your Order ID is enough.
              </p>
            </AccordionSection>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3 lg:px-6 lg:pb-6">
          <SecondaryButton type="button" onClick={close}>
            Back to activation
          </SecondaryButton>
        </div>
      </div>
    </div>
  )
}

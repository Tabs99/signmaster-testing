import { useCallback, useEffect, useRef, useState } from 'react'

interface HelpOverlayProps {
  onClose: () => void
  initialOpenIndex?: number
}

interface AccordionItemProps {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

function AccordionItem({ title, open, onToggle, children }: AccordionItemProps) {
  return (
    <div className="border-b border-white/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 py-4 text-left"
      >
        <span className="text-sm font-semibold leading-snug text-white">{title}</span>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="#f0c04a"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? <div className="pb-4">{children}</div> : null}
    </div>
  )
}

export default function HelpOverlay({
  onClose,
  initialOpenIndex = -1,
}: HelpOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const dragDeltaY = useRef(0)

  const [visible, setVisible] = useState(false)
  const [openIndex, setOpenIndex] = useState(initialOpenIndex)
  const [swipeOffset, setSwipeOffset] = useState(0)

  const close = useCallback(() => {
    setVisible(false)
    window.setTimeout(onClose, 300)
  }, [onClose])

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
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

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === overlayRef.current) {
      close()
    }
  }

  function toggle(index: number) {
    setOpenIndex((current) => (current === index ? -1 : index))
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-50 flex items-end justify-center sm:items-center ${
        visible ? 'bg-black/45' : 'bg-black/0'
      } transition-colors duration-300`}
    >
      <div
        onTouchStart={(event) => {
          dragStartY.current = event.touches[0].clientY
          dragDeltaY.current = 0
        }}
        onTouchMove={(event) => {
          const delta = event.touches[0].clientY - dragStartY.current
          if (delta > 0) {
            dragDeltaY.current = delta
            setSwipeOffset(delta)
          }
        }}
        onTouchEnd={() => {
          if (dragDeltaY.current > 80) {
            close()
          } else {
            setSwipeOffset(0)
          }
        }}
        style={{ transform: visible ? `translateY(${swipeOffset}px)` : 'translateY(100%)' }}
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-white/10 bg-gradient-to-b from-[#0f2035] to-[#0a1628] shadow-[0_-8px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] sm:max-w-[520px] sm:rounded-[20px]"
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              Need help verifying your purchase?
            </h2>
            <p className="mt-1 text-sm text-white/55">
              Select the issue you are having:
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 2l8 8M10 2L2 10"
                  stroke="rgba(255,255,255,0.65)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          <AccordionItem
            title="I can't find my Amazon Order ID"
            open={openIndex === 0}
            onToggle={() => toggle(0)}
          >
            <p className="text-sm leading-relaxed text-white/75 sm:text-base">
              Find your Order ID in your Amazon order confirmation email, or go to{' '}
              <strong className="text-accent-gold">Returns &amp; Orders</strong> in your
              Amazon account.
            </p>
            <div className="mt-3 rounded-lg border border-accent-gold/20 bg-accent-gold/10 px-3.5 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">
                Example Order ID
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-accent-gold sm:text-[15px]">
                202&#8209;1234567&#8209;8901234
              </p>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-white/50 sm:text-sm">
              Do not enter your tracking number or invoice number.
            </p>
          </AccordionItem>

          <AccordionItem
            title="My order details aren't being accepted"
            open={openIndex === 1}
            onToggle={() => toggle(1)}
          >
            <p className="mb-2 text-sm leading-relaxed text-white/75 sm:text-base">
              Please check the following:
            </p>
            <ul className="list-disc space-y-1 pl-[18px] text-sm leading-relaxed text-white/75 sm:text-base">
              <li>
                The Order ID follows the standard format (e.g.,{' '}
                <span className="font-mono text-accent-gold">202-1234567-8901234</span>).
              </li>
              <li>The delivery postcode matches the original Amazon order.</li>
              <li>There are no extra spaces or typing errors.</li>
            </ul>
          </AccordionItem>

          <AccordionItem
            title="I used a different delivery address"
            open={openIndex === 2}
            onToggle={() => toggle(2)}
          >
            <p className="text-sm leading-relaxed text-white/75 sm:text-base">
              Enter the delivery postcode used when placing the original Amazon order. Do
              not enter your billing postcode or your current postcode unless it was also
              used for that delivery.
            </p>
          </AccordionItem>

          <AccordionItem
            title="I still need help"
            open={openIndex === 3}
            onToggle={() => toggle(3)}
          >
            <p className="mb-3.5 text-sm leading-relaxed text-white/75 sm:text-base">
              Contact our support team if you are still unable to verify your purchase.
            </p>
            <a
              href="mailto:support@signmastercards.co.uk?subject=SignMaster%20purchase%20verification%20help"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#f5cc5a] to-[#e08c18] px-[18px] py-[11px] text-[13px] font-bold tracking-wide text-[#0a1628] no-underline"
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect
                  x="1"
                  y="3"
                  width="12"
                  height="8.5"
                  rx="1.5"
                  stroke="#0a1628"
                  strokeWidth="1.4"
                />
                <path
                  d="M1 4.5l6 4 6-4"
                  stroke="#0a1628"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              Email SignMaster Support
            </a>
            <p className="mt-3 text-xs leading-relaxed text-white/50 sm:text-sm">
              Please do not include payment or card information. You may include your
              Amazon Order ID so we can investigate the issue.
            </p>
          </AccordionItem>
        </div>

        <div className="shrink-0 border-t border-white/10 px-6 pb-7 pt-4">
          <button
            type="button"
            onClick={close}
            className="min-h-11 w-full rounded-[10px] border border-white/15 bg-white/10 px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.14]"
          >
            Return to verification
          </button>
        </div>
      </div>
    </div>
  )
}

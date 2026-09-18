import type { RefObject } from 'react'

interface OrderIdInlineHelpProps {
  onOpenDetailedHelp: () => void
  detailedHelpButtonRef?: RefObject<HTMLButtonElement | null>
}

const EXAMPLE_ORDER_ID = '123-1234567-1234567'

export default function OrderIdInlineHelp({
  onOpenDetailedHelp,
  detailedHelpButtonRef,
}: OrderIdInlineHelpProps) {
  return (
    <div className="mt-2.5 space-y-2 text-[13px] leading-[1.55] text-white/[0.55]">
      <details className="group rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <summary className="keyline-focus cursor-pointer list-none font-medium text-white/75 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="text-white/45 transition group-open:rotate-90">
              ›
            </span>
            Where do I find this?
          </span>
        </summary>
        <p className="mt-2 pl-4 text-white/[0.62]">
          Open the Amazon app or website, go to <strong className="font-semibold text-white/75">Your Orders</strong>
          , and open your SignMaster order. Look for{' '}
          <strong className="font-semibold text-white/75">Order #</strong> or{' '}
          <strong className="font-semibold text-white/75">Order number</strong>. It looks like{' '}
          <span className="font-mono text-white/70">{EXAMPLE_ORDER_ID}</span>.
        </p>
      </details>
      <p>
        Need a visual guide?{' '}
        <button
          ref={detailedHelpButtonRef}
          type="button"
          onClick={onOpenDetailedHelp}
          className="keyline-text-action inline min-h-0 p-0 text-[13px] font-medium text-white underline decoration-white/45"
        >
          Show me where
        </button>
      </p>
    </div>
  )
}

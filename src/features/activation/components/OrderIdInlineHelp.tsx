import type { RefObject } from 'react'

interface OrderIdInlineHelpProps {
  onOpenDetailedHelp: () => void
  detailedHelpButtonRef?: RefObject<HTMLButtonElement | null>
}

export default function OrderIdInlineHelp({
  onOpenDetailedHelp,
  detailedHelpButtonRef,
}: OrderIdInlineHelpProps) {
  return (
    <p className="mt-2.5 text-[13px] leading-[1.55] text-white/[0.55]">
      Find it in your Amazon confirmation email or order details.{' '}
      <button
        ref={detailedHelpButtonRef}
        type="button"
        onClick={onOpenDetailedHelp}
        className="keyline-text-action inline min-h-0 p-0 text-[13px] font-medium text-white underline decoration-white/45"
      >
        Show me where
      </button>
    </p>
  )
}

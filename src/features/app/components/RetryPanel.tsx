import PrimaryButton from '../../activation/components/PrimaryButton'
import SecondaryButton from '../../activation/components/SecondaryButton'

/**
 * The one failure screen the signed-in area uses: a plain heading, a human
 * reason, a retry, and always a second way out. No error codes, no blame.
 */

export interface RetryPanelProps {
  heading: string
  message: string
  onRetry: () => void
  secondaryLabel: string
  onSecondary: () => void
  testId: string
}

export default function RetryPanel({
  heading,
  message,
  onRetry,
  secondaryLabel,
  onSecondary,
  testId,
}: RetryPanelProps) {
  return (
    <div
      className="mx-auto flex max-w-[420px] flex-col items-center py-16 text-center"
      data-testid={testId}
    >
      <h2 className="text-[18px] font-bold text-white">{heading}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-white/65">{message}</p>
      <div className="mt-6 flex w-full flex-col gap-2.5">
        <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>
        <SecondaryButton onClick={onSecondary}>{secondaryLabel}</SecondaryButton>
      </div>
    </div>
  )
}

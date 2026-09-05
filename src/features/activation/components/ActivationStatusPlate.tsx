import PrimaryButton from './PrimaryButton'
import SecondaryButton from './SecondaryButton'

export type ActivationStatusTone = 'success' | 'info' | 'neutral' | 'warning'

interface ActivationStatusAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

interface ActivationStatusPlateProps {
  tone: ActivationStatusTone
  heading: string
  body: string
  orderId?: string
  primaryAction?: ActivationStatusAction
  secondaryAction?: ActivationStatusAction
}

const TONE_STYLES: Record<
  ActivationStatusTone,
  { border: string; icon: string; iconBg: string }
> = {
  success: {
    border: 'border-success/35',
    icon: 'text-success-text',
    iconBg: 'bg-success/15',
  },
  info: {
    border: 'border-info/35',
    icon: 'text-info-text',
    iconBg: 'bg-info/15',
  },
  neutral: {
    border: 'border-white/20',
    icon: 'text-white/70',
    iconBg: 'bg-white/[0.06]',
  },
  warning: {
    border: 'border-error/35',
    icon: 'text-error-text',
    iconBg: 'bg-error/10',
  },
}

const TONE_SYMBOL: Record<ActivationStatusTone, string> = {
  success: '✓',
  info: 'i',
  neutral: '!',
  warning: '!',
}

export default function ActivationStatusPlate({
  tone,
  heading,
  body,
  orderId,
  primaryAction,
  secondaryAction,
}: ActivationStatusPlateProps) {
  const styles = TONE_STYLES[tone]

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-md border ${styles.border} bg-keyline-pane px-4 py-4`}
    >
      <div className="flex gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${styles.iconBg} ${styles.icon} font-bold`}
          aria-hidden="true"
        >
          {TONE_SYMBOL[tone]}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-extrabold leading-[1.2] tracking-[-0.02em] text-white">
            {heading}
          </h2>
          <p className="mt-2 text-[14px] leading-[1.55] text-white/70">{body}</p>
          {orderId ? (
            <p className="mt-3 font-mono text-[12px] leading-snug text-white/55">
              Order ID:{' '}
              <span className="text-keyline-gold">{orderId}</span>
            </p>
          ) : null}
        </div>
      </div>

      {primaryAction || secondaryAction ? (
        <div className="mt-4 space-y-3">
          {primaryAction ? (
            <PrimaryButton
              type="button"
              enabled={!primaryAction.disabled}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </PrimaryButton>
          ) : null}
          {secondaryAction ? (
            <SecondaryButton type="button" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </SecondaryButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

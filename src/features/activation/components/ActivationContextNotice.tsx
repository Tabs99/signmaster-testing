interface ActivationExpiredNoticeProps {
  onRestartActivation?: () => void
}

export function ActivationExpiredNotice({
  onRestartActivation,
}: ActivationExpiredNoticeProps) {
  return (
    <div
      role="alert"
      data-testid="activation-expired-notice"
      className="mb-5 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-[13px] leading-snug text-amber-300"
    >
      <p className="font-bold">Your activation session has expired.</p>
      <p className="mt-1.5 text-white/70">
        Please verify your Amazon order again to continue.
        {onRestartActivation ? (
          <>
            {' '}
            <button
              type="button"
              onClick={onRestartActivation}
              className="font-bold text-accent-gold underline underline-offset-2"
            >
              Restart activation
            </button>
          </>
        ) : null}
      </p>
    </div>
  )
}

export function ActivationContextMissingNotice() {
  return (
    <div
      role="status"
      data-testid="activation-context-missing-notice"
      className="mb-5 rounded-[10px] border border-white/15 bg-white/[0.04] px-4 py-3.5 text-[13px] leading-snug text-white/70"
    >
      Verify your Amazon order to continue activation.
    </div>
  )
}

interface ActivationContextServiceErrorNoticeProps {
  onRetry?: () => void
  isRetrying?: boolean
}

export function ActivationContextServiceErrorNotice({
  onRetry,
  isRetrying = false,
}: ActivationContextServiceErrorNoticeProps) {
  return (
    <div
      role="alert"
      data-testid="activation-context-service-error-notice"
      className="mb-5 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-[13px] leading-snug text-amber-300"
    >
      <p className="font-bold">We couldn&apos;t check your activation session</p>
      <p className="mt-1.5 text-white/70">
        Please try again. Your purchase has not been changed.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          aria-busy={isRetrying}
          className="mt-3 font-bold text-accent-gold underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRetrying ? 'Retrying…' : 'Retry'}
        </button>
      ) : null}
    </div>
  )
}

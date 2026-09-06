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

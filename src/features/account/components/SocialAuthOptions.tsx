import LoadingSpinner from '../../activation/components/LoadingSpinner'

const socialButtonClassName = (isInteractive: boolean, loading: boolean) =>
  `keyline-focus flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-3.5 text-[15px] font-bold text-white transition-colors ${
    isInteractive
      ? 'hover:border-white/30 hover:bg-white/[0.09]'
      : 'cursor-not-allowed opacity-60'
  } ${loading ? 'cursor-wait' : ''}`

export interface SocialAuthOptionsProps {
  onGoogleClick: () => void
  googleLoading?: boolean
  disabled?: boolean
  error?: string | null
  /** Hidden until Apple Developer Program enrollment; re-enable to show Continue with Apple. */
  showApple?: boolean
  onAppleClick?: () => void
  appleLoading?: boolean
}

export default function SocialAuthOptions({
  onGoogleClick,
  googleLoading = false,
  disabled = false,
  error = null,
  showApple = false,
  onAppleClick,
  appleLoading = false,
}: SocialAuthOptionsProps) {
  const blocked = disabled || googleLoading || (showApple && appleLoading)

  return (
    <div className="flex flex-col gap-[18px]" data-testid="social-auth-options">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-white/15" />
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
          or
        </span>
        <span className="h-px flex-1 bg-white/15" />
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-[13px] font-medium leading-snug text-amber-300"
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onGoogleClick}
        disabled={blocked}
        aria-disabled={blocked}
        aria-busy={googleLoading || undefined}
        className={socialButtonClassName(!blocked, googleLoading)}
      >
        {googleLoading ? (
          <>
            <LoadingSpinner />
            <span>Connecting to Google…</span>
          </>
        ) : (
          'Continue with Google'
        )}
      </button>

      {showApple && onAppleClick ? (
        <button
          type="button"
          onClick={onAppleClick}
          disabled={blocked}
          aria-disabled={blocked}
          aria-busy={appleLoading || undefined}
          className={socialButtonClassName(!blocked, appleLoading)}
        >
          {appleLoading ? (
            <>
              <LoadingSpinner />
              <span>Connecting to Apple…</span>
            </>
          ) : (
            'Continue with Apple'
          )}
        </button>
      ) : null}
    </div>
  )
}

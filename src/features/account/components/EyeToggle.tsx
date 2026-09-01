interface EyeToggleProps {
  visible: boolean
  onToggle: () => void
}

export default function EyeToggle({ visible, onToggle }: EyeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      className="flex h-11 w-11 items-center justify-center rounded-md text-white/50 outline-none focus:shadow-[0_0_0_2px_rgba(240,192,74,0.5)]"
    >
      {visible ? (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M2 9s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 3l12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M2 9s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
    </button>
  )
}

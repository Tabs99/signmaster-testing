interface PasswordRequirementProps {
  met: boolean
  label: string
}

export default function PasswordRequirement({ met, label }: PasswordRequirementProps) {
  return (
    <div className="flex items-center gap-1.5">
      {met ? (
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle
            cx="6.5"
            cy="6.5"
            r="5.75"
            fill="rgba(74,222,128,0.15)"
            stroke="rgba(74,222,128,0.5)"
            strokeWidth="1.2"
          />
          <path
            d="M4 6.5l2 2 3.5-3.5"
            stroke="#4ade80"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle
            cx="6.5"
            cy="6.5"
            r="5.75"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1.2"
          />
        </svg>
      )}
      <span
        className={`text-xs ${met ? 'font-semibold text-success' : 'font-normal text-white/60'}`}
      >
        {label}
      </span>
    </div>
  )
}

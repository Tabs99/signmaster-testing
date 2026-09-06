interface LoadingSpinnerProps {
  className?: string
}

export default function LoadingSpinner({ className = '' }: LoadingSpinnerProps) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={`animate-spin motion-reduce:animate-none ${className}`}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="28"
        strokeDashoffset="10"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface FieldErrorProps {
  id: string
  children: React.ReactNode
}

export default function FieldError({ id, children }: FieldErrorProps) {
  return (
    <div
      id={id}
      role="alert"
      aria-live="assertive"
      className="mb-3.5 mt-1.5 flex items-start gap-2 text-xs text-error"
    >
      <svg
        aria-hidden="true"
        width="13"
        height="13"
        viewBox="0 0 13 13"
        fill="none"
        className="mt-0.5 shrink-0"
      >
        <circle cx="6.5" cy="6.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M6.5 4v3.5M6.5 9.5h.01"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span>{children}</span>
    </div>
  )
}

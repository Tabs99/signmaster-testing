interface FieldErrorProps {
  id: string
  children: React.ReactNode
}

export default function FieldError({ id, children }: FieldErrorProps) {
  return (
    <p
      id={id}
      role="alert"
      aria-live="assertive"
      className="mt-2 flex items-start gap-[7px] text-[12.5px] leading-[1.5] text-error-text"
    >
      <span
        aria-hidden="true"
        className="mt-[5px] h-2 w-2 shrink-0 rounded-[2px] bg-error"
      />
      <span>{children}</span>
    </p>
  )
}

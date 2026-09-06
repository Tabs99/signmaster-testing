import type { ButtonHTMLAttributes } from 'react'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  enabled?: boolean
  loading?: boolean
}

export default function PrimaryButton({
  enabled = true,
  loading = false,
  className = '',
  type = 'button',
  disabled,
  'aria-busy': ariaBusy,
  children,
  ...props
}: PrimaryButtonProps) {
  const isInteractive = enabled && !disabled && !loading

  return (
    <button
      type={type}
      {...props}
      disabled={!isInteractive}
      aria-disabled={!isInteractive}
      aria-busy={loading ? true : ariaBusy}
      className={`keyline-cta keyline-focus ${
        loading || isInteractive ? 'keyline-cta-enabled' : 'keyline-cta-disabled'
      } ${loading ? 'cursor-wait' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

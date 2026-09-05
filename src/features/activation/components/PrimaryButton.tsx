import type { ButtonHTMLAttributes } from 'react'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  enabled?: boolean
}

export default function PrimaryButton({
  enabled = true,
  className = '',
  type = 'button',
  children,
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      disabled={!enabled || props.disabled}
      aria-disabled={!enabled || props.disabled}
      className={`keyline-cta keyline-focus ${
        enabled && !props.disabled ? 'keyline-cta-enabled' : 'keyline-cta-disabled'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

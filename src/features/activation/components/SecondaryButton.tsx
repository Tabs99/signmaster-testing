import type { ButtonHTMLAttributes } from 'react'

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {}

export default function SecondaryButton({
  className = '',
  type = 'button',
  children,
  ...props
}: SecondaryButtonProps) {
  return (
    <button
      type={type}
      className={`keyline-focus flex h-11 w-full items-center justify-center rounded-md border border-white/[0.22] bg-transparent px-6 text-[14.5px] font-semibold leading-none text-white transition-colors hover:bg-white/[0.04] ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

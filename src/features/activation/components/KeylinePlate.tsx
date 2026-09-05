import type { ReactNode } from 'react'

interface KeylinePlateProps {
  children: ReactNode
  className?: string
}

export default function KeylinePlate({ children, className = '' }: KeylinePlateProps) {
  return (
    <div className={`keyline-plate ${className}`}>
      <div className="keyline-plate-inner">{children}</div>
    </div>
  )
}

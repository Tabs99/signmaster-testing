/**
 * A placeholder block for content that has not arrived yet.
 *
 * Skeletons are laid out in the same shape as the content they stand in for,
 * so the page does not reflow when the data lands. The pulse is a single
 * animation the global reduced-motion rule already turns off.
 *
 * Purely decorative: the enclosing region carries `role="status"` and
 * `aria-busy`, and each block is hidden from assistive technology.
 */

export interface SkeletonProps {
  className?: string
}

export default function Skeleton({ className = '' }: SkeletonProps) {
  // A caller's own radius (`rounded-full` for a ring, `rounded-xl` for an
  // icon chip) must win, so the default is only applied when none is given.
  const radius = /\brounded/.test(className) ? '' : 'rounded-md'

  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse bg-white/[0.08] ${radius} ${className}`}
    />
  )
}

import type { ReactNode } from 'react'
import BrandLockup from './BrandLockup'

interface ActivationShellProps {
  children: ReactNode
}

function DesktopBrandPane() {
  return (
    <aside className="hidden lg:flex flex-col justify-center px-11 py-12 xl:px-12">
      <BrandLockup variant="desktop" />
      <h2 className="mt-8 max-w-[24ch] text-[33px] font-extrabold leading-[1.08] tracking-[-0.026em] text-white">
        Your cards, now on your phone.
      </h2>
      <p className="mt-3.5 max-w-[42ch] text-[15px] leading-[1.6] text-white/[0.65]">
        101 UK road signs, practice quizzes and progress tracking — included with the
        flashcard pack you already own.
      </p>
      <div className="mt-8 flex flex-wrap gap-[30px] border-t border-dashed border-white/15 pt-5">
        {['101 Road Signs', 'Practice Quizzes', 'Progress Saved'].map((item) => (
          <span
            key={item}
            className="font-mono text-[11px] font-medium uppercase tracking-product text-white/50"
          >
            {item}
          </span>
        ))}
      </div>
    </aside>
  )
}

export default function ActivationShell({ children }: ActivationShellProps) {
  return (
    <div className="activation-shell min-h-dvh bg-keyline-page">
      <div className="mx-auto grid min-h-dvh w-full max-w-[1280px] lg:grid-cols-[1.05fr_0.95fr]">
        <DesktopBrandPane />
        <div className="flex min-h-dvh flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))] max-[667px]:pb-3 max-[667px]:pt-3 lg:justify-center lg:px-11 lg:py-12 lg:pt-[calc(20px+env(safe-area-inset-top))] xl:px-12">
          <div className="mx-auto flex w-full max-w-activation flex-1 flex-col lg:mx-0 lg:max-w-activation lg:flex-none">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

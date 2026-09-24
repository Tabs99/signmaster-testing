import { useCallback, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { CircleHelp, Gauge } from 'lucide-react'
import logo from '../../../assets/signmaster-logo.png'
import { useAuthContext } from '../../auth/context/AuthProvider'
import { clearProgressCache } from '../../dashboard/hooks/useProgressSummary'

/**
 * The frame every signed-in screen sits in.
 *
 * A rail at `lg` and up, a header on smaller screens, and two destinations —
 * the MVP has one working loop, and a nav advertising features that do not
 * exist yet is worse than a short one.
 *
 * Sign out has no other home in a two-item nav, so it lives in the account menu
 * here. An account-bound product with no visible way to sign out is a support
 * ticket on any shared device.
 *
 * `focus` hides the navigation entirely. The quiz uses it: mid-question, every
 * nav destination is a way to lose the session, and one deliberate exit is
 * safer than several ambient ones.
 */

export interface AppShellProps {
  children: ReactNode
  /**
   * The page heading for screens that do not draw a visible one, which is only
   * the quiz. The dashboard renders its own `h1`, so rendering another here
   * would give the page two headings with the same name.
   */
  title: string
  focus?: boolean
  /** Replaces the nav in focus mode — typically an exit control. */
  focusAction?: ReactNode
}

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', end: true, Icon: Gauge },
  { to: '/app/quiz', label: 'Quiz & Test', end: false, Icon: CircleHelp },
] as const

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    'keyline-focus flex min-h-11 items-center gap-3 rounded-lg px-4 text-[14px] font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.99]',
    isActive
      ? 'bg-keyline-gold/[0.12] text-keyline-gold hover:bg-keyline-gold/[0.16]'
      : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
  ].join(' ')
}

function NavLinks() {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
          <item.Icon aria-hidden="true" size={18} />
          {item.label}
        </NavLink>
      ))}
    </>
  )
}

function AccountMenu() {
  const { user, signOut } = useAuthContext()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleSignOut = useCallback(async () => {
    if (busy) {
      return
    }

    setBusy(true)

    try {
      await signOut()
      // The next account to sign in on this tab must not see this one's numbers.
      clearProgressCache()
      navigate('/sign-in', { replace: true })
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }, [busy, navigate, signOut])

  const initials = (user?.email ?? '?').slice(0, 1).toUpperCase()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account"
        data-testid="account-menu-trigger"
        className="keyline-focus flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-keyline-plate text-[13px] font-bold text-white/85 transition-[background-color,border-color,transform] duration-150 hover:border-white/35 hover:bg-white/[0.06] active:scale-95"
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-[220px] rounded-lg border border-white/[0.14] bg-keyline-plate p-1.5 shadow-lg"
        >
          {user?.email ? (
            <p className="truncate px-3 py-2 font-mono text-[11px] tracking-field text-white/45">
              {user.email}
            </p>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              void handleSignOut()
            }}
            className="keyline-focus flex min-h-11 w-full cursor-pointer items-center rounded-md px-3 text-left text-[14px] font-semibold text-white/85 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function AppShell({
  children,
  title,
  focus = false,
  focusAction,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh w-full bg-keyline-page font-sans text-white">
      {focus ? null : (
        <nav
          aria-label="Main"
          className="hidden w-[240px] shrink-0 flex-col gap-1 border-r border-white/[0.08] bg-keyline-pane px-4 py-6 lg:flex"
        >
          <img src={logo} alt="SignMaster" className="mb-8 w-[150px] self-start" />
          <NavLinks />
          <div className="mt-auto border-t border-white/[0.08] pt-4">
            <p className="font-mono text-[10px] uppercase tracking-step text-white/40">
              Deck activated
            </p>
            <p className="mt-1 text-[13px] font-semibold text-white/70">
              All 101 signs unlocked
            </p>
          </div>
        </nav>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3.5 pt-[calc(14px+env(safe-area-inset-top))] lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={logo}
              alt="SignMaster"
              className={`w-[118px] shrink-0 ${focus ? '' : 'lg:hidden'}`}
            />
            {focus ? <h1 className="sr-only">{title}</h1> : null}
          </div>
          {focus ? focusAction : <AccountMenu />}
        </header>

        {focus ? null : (
          <nav
            aria-label="Main"
            className="flex gap-1 border-b border-white/[0.08] px-3 py-2 lg:hidden"
          >
            <NavLinks />
          </nav>
        )}

        <main className="min-w-0 flex-1 px-5 pb-[calc(40px+env(safe-area-inset-bottom))] pt-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}

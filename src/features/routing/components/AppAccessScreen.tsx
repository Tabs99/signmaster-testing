import PageShell from '../../../components/layout/PageShell'
import SignOutButton from '../../auth/components/SignOutButton'
import BrandLockup from '../../activation/components/BrandLockup'

/**
 * Minimal placeholder for the entitlement-gated area. Task 8 only proves that
 * routing grants access to an ACTIVE entitlement holder — the Dashboard, Quiz,
 * Learn, and Progress product features are deliberately NOT implemented here.
 */
export default function AppAccessScreen() {
  return (
    <PageShell>
      <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
        <BrandLockup variant="desktop" />
        <article
          className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-9 text-center backdrop-blur-xl"
          data-testid="app-access"
        >
          <div className="mx-auto mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-full bg-gradient-cta shadow-[0_4px_16px_rgba(240,192,74,0.3)]">
            <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26" fill="none">
              <path
                d="M6 13.5l5 5L20 8"
                stroke="#0a1628"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-white">
            SignMaster access is active.
          </h1>
          <p className="mx-auto mt-2 max-w-[320px] text-sm leading-relaxed text-white/65">
            Your companion learning app opens here in an upcoming update.
          </p>
        </article>
        <div className="mt-4 w-full">
          <SignOutButton />
        </div>
      </div>
    </PageShell>
  )
}

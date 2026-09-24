import { Link } from 'react-router-dom'
import logo from '../../../assets/signmaster-logo.png'

/**
 * The public front door at `/`, in the shape the client pointed at: the
 * Duolingo login page. One centred column, one heading, two big rounded
 * buttons with bold uppercase labels, an OR rule, and nothing else to read.
 *
 * Someone who scanned the QR on the thank-you card never sees this — that QR
 * points straight at `/activate`. This page is for everyone who typed the
 * address, and its only job is to make the order number the obvious next step.
 */

// Duolingo's buttons: a thick bottom edge that presses flat. Hover lifts a
// pixel and brightens; press sinks onto the edge.
const CHUNKY_BUTTON =
  'keyline-focus flex h-[56px] w-full cursor-pointer items-center justify-center rounded-2xl border-b-4 text-[15px] font-extrabold uppercase tracking-[0.08em] transition-[transform,background-color,box-shadow,border-color] duration-150 ease-out hover:-translate-y-px active:translate-y-[2px] active:border-b-2'

export default function LandingScreen() {
  return (
    <main className="flex min-h-dvh w-full flex-col bg-keyline-page font-sans text-white">
      <header className="flex items-center justify-end px-5 py-4 pt-[calc(16px+env(safe-area-inset-top))] sm:px-8">
        <Link
          to="/sign-in"
          className="keyline-focus rounded-2xl border-2 border-white/[0.16] px-5 py-3 text-[13px] font-extrabold uppercase tracking-[0.08em] text-keyline-gold transition-[background-color,border-color,transform] duration-150 hover:-translate-y-px hover:border-white/30 hover:bg-white/[0.05] active:translate-y-0"
          data-testid="landing-sign-in"
        >
          Sign in
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-16 sm:px-8">
        <div className="flex w-full max-w-[400px] flex-col items-center text-center">
          <img src={logo} alt="SignMaster" className="w-[190px] sm:w-[220px]" />

          <h1 className="mt-8 text-[30px] font-extrabold leading-[1.15] tracking-tight text-white sm:text-[36px]">
            Master the road.
            <br />
            One sign at a time.
          </h1>

          <p className="mt-4 text-[16px] leading-relaxed text-white/65">
            Practise all 101 UK road signs. Included with your flash cards.
          </p>

          <div className="mt-10 flex w-full flex-col gap-4">
            <Link
              to="/activate"
              className={`${CHUNKY_BUTTON} border-keyline-gold-pressed bg-keyline-gold text-keyline-gold-foreground hover:bg-[#edb945] hover:shadow-[0_8px_22px_-8px_rgba(233,178,60,0.6)] active:shadow-none`}
              data-testid="landing-activate"
            >
              Get started
            </Link>

            <div className="flex items-center gap-4" aria-hidden="true">
              <span className="h-px flex-1 bg-white/[0.14]" />
              <span className="font-mono text-[11px] font-bold uppercase tracking-step text-white/45">
                or
              </span>
              <span className="h-px flex-1 bg-white/[0.14]" />
            </div>

            <Link
              to="/sign-in"
              className={`${CHUNKY_BUTTON} border-white/[0.18] bg-keyline-plate text-white hover:border-white/30 hover:bg-white/[0.07]`}
            >
              I already have an account
            </Link>
          </div>

          <p className="mt-10 text-[13px] leading-relaxed text-white/45">
            Getting started needs the Amazon order number from your SignMaster
            pack.
          </p>
        </div>
      </div>

      <footer className="px-5 pb-[calc(24px+env(safe-area-inset-bottom))] text-center sm:px-8">
        <p className="text-[12px] text-white/40">
          Need help?{' '}
          <a
            href="mailto:support@signmastercards.co.uk"
            className="keyline-focus font-semibold text-white/60 underline decoration-white/30 underline-offset-[3px]"
          >
            support@signmastercards.co.uk
          </a>
        </p>
      </footer>
    </main>
  )
}

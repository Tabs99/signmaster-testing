import { BookOpen, CalendarDays, ChevronRight, TrendingUp, Trophy } from 'lucide-react'
import type { LearningStateCounts } from '../../../lib/api/progressApi'

/**
 * The three learning states, drawn as the client's dashboard mockup has them:
 * three plates reading left to right, each with a large ringed icon in its own
 * colour, a one-line description, and its review cadence, with dashed arrows
 * showing the direction a sign travels as the learner improves.
 *
 * Counts appear above the description once there is anything to count.
 */

export interface LearningTiersProps {
  counts: LearningStateCounts
}

const TIERS = [
  {
    key: 'needs_practice',
    title: 'Needs Practice',
    blurb: 'Signs you are still learning',
    cadence: 'Review daily',
    Icon: BookOpen,
    text: 'text-dash-blue',
    border: 'border-dash-blue/60',
    ring: 'border-dash-blue/80 bg-dash-blue/[0.08]',
  },
  {
    key: 'getting_better',
    title: 'Getting Better',
    blurb: 'Signs you usually recognise',
    cadence: 'Review every 3 days',
    Icon: TrendingUp,
    text: 'text-dash-gold',
    border: 'border-dash-gold/60',
    ring: 'border-dash-gold/80 bg-dash-gold/[0.08]',
  },
  {
    key: 'mastered',
    title: 'Mastered',
    blurb: 'Signs you know confidently',
    cadence: 'Review every 7 days',
    Icon: Trophy,
    text: 'text-dash-green',
    border: 'border-dash-green/60',
    ring: 'border-dash-green/80 bg-dash-green/[0.08]',
  },
] as const

function Arrow() {
  return (
    <div
      aria-hidden="true"
      className="hidden items-center justify-center text-white/30 sm:flex"
    >
      <span className="w-5 border-t-2 border-dashed border-current" />
      <ChevronRight size={20} className="-ml-2" />
    </div>
  )
}

export default function LearningTiers({ counts }: LearningTiersProps) {
  return (
    <ul className="grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch sm:gap-2">
      {TIERS.map((tier, index) => {
        const count = counts[tier.key]

        return (
          <li key={tier.key} data-testid={`learning-tier-${tier.key}`} className="contents">
            <div
              className={`flex flex-col items-center rounded-2xl border bg-keyline-pane px-5 py-8 text-center ${tier.border}`}
            >
              <span
                className={`flex h-[112px] w-[112px] items-center justify-center rounded-full border-2 ${tier.ring} ${tier.text}`}
              >
                <tier.Icon aria-hidden="true" size={48} strokeWidth={1.7} />
              </span>

              <p className={`mt-6 text-[20px] font-extrabold ${tier.text}`}>{tier.title}</p>

              {count > 0 ? (
                <p className="mt-1 text-[34px] font-extrabold leading-none text-white">
                  {count}
                </p>
              ) : null}

              <p className="mt-2 text-[14px] leading-snug text-white/70">{tier.blurb}</p>

              <span className="my-6 h-px w-full bg-white/[0.12]" />

              <p className="flex items-center gap-2.5 text-[15px] text-white/75">
                <CalendarDays aria-hidden="true" size={20} className={tier.text} />
                {tier.cadence}
              </p>
            </div>

            {index < TIERS.length - 1 ? <Arrow /> : null}
          </li>
        )
      })}
    </ul>
  )
}

import { useCallback, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleCheckBig, Flame, GraduationCap, Layers, Play } from 'lucide-react'
import AppShell from '../../app/components/AppShell'
import RetryPanel from '../../app/components/RetryPanel'
import PrimaryButton from '../../activation/components/PrimaryButton'
import DashboardSkeleton from './DashboardSkeleton'
import LearningTiers from './LearningTiers'
import { useProgressSummary } from '../hooks/useProgressSummary'
import type { ProgressRequestOptions, ProgressSummary } from '../../../lib/api/progressApi'

/**
 * Home for a signed-in learner, laid out as the client's dashboard mockup: the
 * page title with the streak opposite it, a band of four stat tiles, then one
 * panel holding the day's action and the three learning tiers.
 *
 * The layout is the same on day one and day fifty; only the numbers change.
 * That is how the client drew it, and it means a learner never meets a
 * different screen after their first quiz.
 */

export interface DashboardScreenProps {
  requestOptions?: ProgressRequestOptions
}

interface StatTileProps {
  label: string
  value: string
  suffix?: string
  Icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
  tint: string
  valueClass: string
}

function StatTile({ label, value, suffix, Icon, tint, valueClass }: StatTileProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/[0.1] bg-keyline-pane px-5 py-5">
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon aria-hidden={true} size={26} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-white/65">{label}</p>
        <p className="mt-1 text-[28px] font-extrabold leading-none">
          <span className={valueClass}>{value}</span>
          {suffix ? <span className="text-white/85">{suffix}</span> : null}
        </p>
      </div>
    </div>
  )
}

function Dashboard({ summary, onStart }: { summary: ProgressSummary; onStart: () => void }) {
  return (
    <div
      className="flex w-full flex-col gap-6"
      data-testid={summary.quizzesTaken === 0 ? 'dashboard-first-run' : 'dashboard-returning'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[32px] font-extrabold leading-none tracking-tight text-white">
          Dashboard
        </h1>
        <p
          className="flex items-center gap-2 text-[16px] font-bold text-keyline-gold"
          data-testid="streak-badge"
        >
          <Flame aria-hidden="true" size={20} />
          {summary.dailyStreak} Day Streak
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Learned"
          value={String(summary.totalLearned)}
          suffix={` / ${summary.deckSize}`}
          Icon={GraduationCap}
          tint="bg-dash-blue/[0.16] text-dash-blue"
          valueClass="text-dash-blue"
        />
        <StatTile
          label="Daily Streak"
          value={String(summary.dailyStreak)}
          suffix=" days"
          Icon={Flame}
          tint="bg-dash-violet/[0.16] text-dash-violet"
          valueClass="text-dash-violet"
        />
        <StatTile
          label="Need Review Today"
          value={String(summary.needReviewToday)}
          Icon={Layers}
          tint="bg-dash-red/[0.16] text-dash-red"
          valueClass="text-dash-red"
        />
        <StatTile
          label="Mastered"
          value={String(summary.states.mastered)}
          Icon={CircleCheckBig}
          tint="bg-dash-green/[0.16] text-dash-green"
          valueClass="text-dash-green"
        />
      </div>

      <section
        className="rounded-2xl border border-white/[0.1] bg-keyline-plate p-5 sm:p-7"
        aria-labelledby="learning-progress-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="learning-progress-heading"
              className="text-[22px] font-extrabold text-white"
            >
              Your Learning Progress
            </h2>
            <p className="mt-2 max-w-[600px] text-[15px] leading-relaxed text-white/65">
              Signs move to the next level as you improve. Incorrect answers return
              to Needs Practice.
            </p>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[240px]">
            <PrimaryButton onClick={onStart} data-testid="start-quiz">
              <span className="flex items-center justify-center gap-2.5">
                <Play aria-hidden="true" size={16} fill="currentColor" />
                Start Daily Review
              </span>
            </PrimaryButton>
          </div>
        </div>

        <div className="mt-7">
          <LearningTiers counts={summary.states} />
        </div>
      </section>

      {summary.quizzesTaken > 0 ? (
        <p className="text-[13px] text-white/45">
          {summary.quizzesTaken} {summary.quizzesTaken === 1 ? 'quiz' : 'quizzes'} taken
          {summary.bestScore !== null ? ` · best score ${summary.bestScore}/10` : ''}
        </p>
      ) : null}
    </div>
  )
}

export default function DashboardScreen({ requestOptions }: DashboardScreenProps) {
  const navigate = useNavigate()

  const { phase, reload } = useProgressSummary({
    onUnauthenticated: () => navigate('/sign-in', { replace: true }),
    onNotEntitled: () => navigate('/activate', { replace: true }),
    requestOptions,
  })

  const startQuiz = useCallback(() => {
    navigate('/app/quiz/play')
  }, [navigate])

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto w-full max-w-[1180px]">
        {phase.kind === 'loading' ? <DashboardSkeleton /> : null}

        {phase.kind === 'failed' ? (
          <RetryPanel
            testId="dashboard-error"
            heading="We couldn’t load your progress"
            message={
              phase.reason === 'offline'
                ? 'Check your connection and try again.'
                : 'SignMaster is having a moment. Please try again shortly.'
            }
            onRetry={reload}
            secondaryLabel="Go to the quiz"
            onSecondary={startQuiz}
          />
        ) : null}

        {phase.kind === 'loaded' ? (
          <Dashboard summary={phase.summary} onStart={startQuiz} />
        ) : null}
      </div>
    </AppShell>
  )
}

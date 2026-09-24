import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import AppShell from '../../app/components/AppShell'
import RetryPanel from '../../app/components/RetryPanel'
import Skeleton from '../../app/components/Skeleton'
import PrimaryButton from '../../activation/components/PrimaryButton'
import { useProgressSummary } from '../../dashboard/hooks/useProgressSummary'
import type { ProgressRequestOptions, ProgressSummary } from '../../../lib/api/progressApi'

/**
 * The Quiz & Test page — the quiz mockup's M1/D1 screen.
 *
 * One plate, one gold button, the numbers stated up front. A quiz is only
 * started when the learner presses Start, never by arriving here: opening a
 * tab must not burn a quiz index or write a session to the database.
 *
 * The mockup also lists future modes beneath this plate. The client has taken
 * those out of scope, so there is nothing to advertise and nothing here that a
 * learner cannot use.
 */

export interface QuizHomeScreenProps {
  requestOptions?: ProgressRequestOptions
}

const FACTS = [
  { value: '10', label: 'Questions' },
  { value: '101', label: 'Sign pool' },
  { value: '3–5', label: 'Minutes' },
] as const

function HistoryLine({ summary }: { summary: ProgressSummary }) {
  if (summary.quizzesTaken === 0) {
    return null
  }

  return (
    <p className="mt-4 text-[13px] text-white/55" data-testid="quiz-history">
      {summary.bestScore !== null ? `Best score ${summary.bestScore}/10 · ` : ''}
      {summary.quizzesTaken} {summary.quizzesTaken === 1 ? 'quiz' : 'quizzes'} taken
    </p>
  )
}

export default function QuizHomeScreen({ requestOptions }: QuizHomeScreenProps) {
  const navigate = useNavigate()

  const { phase, reload } = useProgressSummary({
    onUnauthenticated: () => navigate('/sign-in', { replace: true }),
    onNotEntitled: () => navigate('/activate', { replace: true }),
    requestOptions,
  })

  const start = useCallback(() => {
    navigate('/app/quiz/play')
  }, [navigate])

  return (
    <AppShell title="Quiz & Test">
      <div className="mx-auto w-full max-w-[800px]">
        <p className="font-mono text-[10px] uppercase tracking-step text-keyline-gold">
          Practice
        </p>
        <h1 className="mt-2 text-[32px] font-extrabold leading-none tracking-tight text-white">
          Quiz &amp; Test
        </h1>
        <p className="mt-3 max-w-[520px] text-[15px] leading-relaxed text-white/65">
          Test yourself on the 101 signs in your deck. No timer, no limit on
          retakes.
        </p>

        <section
          className="keyline-plate mt-8"
          aria-labelledby="quick-quiz-heading"
          data-testid="quick-quiz-plate"
        >
          <div className="keyline-plate-inner p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="quick-quiz-heading" className="text-[22px] font-extrabold text-white">
                  Quick Quiz
                </h2>
                <p className="mt-1.5 max-w-[460px] text-[14px] leading-relaxed text-white/65">
                  Ten signs picked from your deck, four possible meanings each, and
                  feedback on every answer.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-keyline-gold/40 px-2.5 py-1 font-mono text-[9px] uppercase tracking-step text-keyline-gold">
                MVP
              </span>
            </div>

            <dl className="mt-6 grid grid-cols-3 gap-3">
              {FACTS.map((fact) => (
                <div
                  key={fact.label}
                  className="rounded-lg border border-white/[0.1] bg-keyline-pane px-3 py-3 text-center"
                >
                  <dd className="text-[22px] font-extrabold leading-none text-white">
                    {fact.value}
                  </dd>
                  <dt className="mt-1.5 font-mono text-[9px] uppercase tracking-step text-white/50">
                    {fact.label}
                  </dt>
                </div>
              ))}
            </dl>

            <div className="mt-6 max-w-[320px]">
              <PrimaryButton onClick={start} data-testid="start-quiz">
                <span className="flex items-center justify-center gap-2.5">
                  <Play aria-hidden="true" size={16} fill="currentColor" />
                  Start Quiz
                </span>
              </PrimaryButton>
            </div>

            {phase.kind === 'loading' ? (
              <Skeleton className="mt-4 h-3.5 w-[200px]" />
            ) : phase.kind === 'loaded' ? (
              <HistoryLine summary={phase.summary} />
            ) : null}
          </div>
        </section>

        {phase.kind === 'failed' ? (
          // The plate above still works without history; this only offers to
          // fetch it again rather than blocking the quiz behind it.
          <div className="mt-6">
            <RetryPanel
              testId="quiz-home-error"
              heading="We couldn’t load your history"
              message={
                phase.reason === 'offline'
                  ? 'Check your connection and try again. You can still start a quiz.'
                  : 'SignMaster is having a moment. You can still start a quiz.'
              }
              onRetry={reload}
              secondaryLabel="Back to dashboard"
              onSecondary={() => navigate('/app')}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}

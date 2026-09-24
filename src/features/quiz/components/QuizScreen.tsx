import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../../app/components/AppShell'
import RetryPanel from '../../app/components/RetryPanel'
import PrimaryButton from '../../activation/components/PrimaryButton'
import SecondaryButton from '../../activation/components/SecondaryButton'
import AnswerOption, { type AnswerOptionState } from './AnswerOption'
import QuizProgressRule from './QuizProgressRule'
import QuizSkeleton from './QuizSkeleton'
import ReviewList from './ReviewList'
import ScoreSummary from './ScoreSummary'
import SignStage from './SignStage'
import { useQuizSession } from '../hooks/useQuizSession'
import type { QuizQuestion, QuizRequestOptions } from '../../../lib/api/quizApi'

/**
 * The quiz.
 *
 * Ten signs, four meanings each, feedback the moment an answer is tapped. The
 * navigation is hidden throughout: mid-quiz every destination is a way to lose
 * the session, so there is one deliberate exit with a confirm instead of
 * several ambient ones.
 *
 * The layout is built around the tightest case, a 375 by 667 screen. Answering
 * shrinks the sign and moves it beside the feedback, which is what pays for the
 * action bar without anything scrolling or being covered.
 */

export interface QuizScreenProps {
  requestOptions?: QuizRequestOptions
}

function optionState(
  optionIndex: number,
  question: QuizQuestion,
  chosen: number | undefined,
): AnswerOptionState {
  if (chosen === undefined) {
    return 'idle'
  }

  if (optionIndex === question.correctOptionIndex) {
    return optionIndex === chosen ? 'correct_chosen' : 'correct_revealed'
  }

  if (optionIndex === chosen) {
    return 'incorrect_chosen'
  }

  return 'muted'
}

function ExitConfirm({
  onLeave,
  onStay,
}: {
  onLeave: () => void
  onStay: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-quiz-heading"
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-5 sm:items-center"
      data-testid="exit-confirm"
    >
      <div className="keyline-plate w-full max-w-[420px]">
        <div className="keyline-plate-inner">
          <h2 id="exit-quiz-heading" className="text-[17px] font-bold text-white">
            Leave this quiz?
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-white/65">
            Your answers so far will not be saved.
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            <PrimaryButton onClick={onStay} autoFocus>
              Keep going
            </PrimaryButton>
            <SecondaryButton onClick={onLeave}>Leave quiz</SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function QuizScreen({ requestOptions }: QuizScreenProps) {
  const navigate = useNavigate()
  const [confirmingExit, setConfirmingExit] = useState(false)

  const goToDashboard = useCallback(() => {
    navigate('/app')
  }, [navigate])

  const {
    phase,
    session,
    currentIndex,
    answers,
    answerCurrent,
    goToNext,
    restart,
    retrySubmit,
  } = useQuizSession({
    onUnauthenticated: () => navigate('/sign-in', { replace: true }),
    onNotEntitled: () => navigate('/activate', { replace: true }),
    requestOptions,
  })

  const question = session?.questions[currentIndex]
  const chosen = answers.get(currentIndex)
  const answered = chosen !== undefined
  const isLastQuestion =
    session !== null && currentIndex === session.questions.length - 1

  // Keyboard shortcuts, desktop only in practice: 1 to 4 answers, Enter
  // advances, Escape offers the exit.
  useEffect(() => {
    if (phase.kind !== 'asking' || !question) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmingExit(true)
        return
      }

      if (confirmingExit) {
        return
      }

      if (!answered && /^[1-4]$/.test(event.key)) {
        const index = Number.parseInt(event.key, 10) - 1

        if (index < question.options.length) {
          event.preventDefault()
          answerCurrent(index)
        }

        return
      }

      if (answered && event.key === 'Enter') {
        event.preventDefault()
        goToNext()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [answerCurrent, answered, confirmingExit, goToNext, phase.kind, question])

  if (phase.kind === 'loading') {
    return (
      <AppShell title="Quiz" focus>
        <QuizSkeleton />
      </AppShell>
    )
  }

  if (phase.kind === 'failed_to_start' || phase.kind === 'failed_to_submit') {
    const isSubmit = phase.kind === 'failed_to_submit'

    return (
      <AppShell title="Quiz" focus>
        <RetryPanel
          testId="quiz-error"
          heading={isSubmit ? "We couldn't save your score" : "We couldn't load your quiz"}
          message={
            phase.reason === 'offline'
              ? 'Check your connection and try again — nothing has been lost.'
              : 'SignMaster is having a moment. Please try again shortly.'
          }
          onRetry={isSubmit ? retrySubmit : restart}
          secondaryLabel="Back to dashboard"
          onSecondary={goToDashboard}
        />
      </AppShell>
    )
  }

  if (phase.kind === 'scored') {
    const { result } = phase

    return (
      <AppShell title="Quiz results">
        <div className="mx-auto flex w-full max-w-[620px] flex-col items-center gap-6 py-2">
          <ScoreSummary score={result.score} total={result.totalQuestions} />

          <div className="flex w-full flex-col gap-2.5">
            <PrimaryButton onClick={restart}>Try another quiz</PrimaryButton>
            <SecondaryButton onClick={goToDashboard}>Back to dashboard</SecondaryButton>
          </div>

          <ReviewList outcomes={result.outcomes} />
        </div>
      </AppShell>
    )
  }

  if (!session || !question) {
    return null
  }

  const submitting = phase.kind === 'submitting'

  return (
    <AppShell
      title="Quiz"
      focus
      focusAction={
        <button
          type="button"
          onClick={() => setConfirmingExit(true)}
          className="keyline-focus keyline-text-action"
          data-testid="quiz-exit"
        >
          Exit quiz
        </button>
      }
    >
      {/*
        On a wide screen the question is centred in the viewport rather than
        pinned to the top, so the sign and the answers sit together in the eye
        line instead of leaving a void beneath them.
      */}
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 lg:min-h-[calc(100dvh-200px)] lg:justify-center">
        <QuizProgressRule currentIndex={currentIndex} total={session.questions.length} />

        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-12">
          <div
            // On a wide screen this column is pinned to the sign's width so the
            // feedback text wraps beneath it instead of stretching the column
            // and squeezing the answers.
            className={`flex min-w-0 gap-4 ${answered ? 'items-center' : 'flex-col items-center'} lg:w-[320px] lg:shrink-0 lg:flex-col lg:items-center`}
          >
            <SignStage
              images={question.images}
              // Until the question is answered the alternative text must not
              // describe the sign, or a screen reader would read out the answer.
              label={answered ? question.meaning : 'Road sign to identify'}
              size={answered ? 'answered' : 'asked'}
            />

            {answered ? (
              <div role="status" aria-live="polite" className="min-w-0 flex-1 lg:w-full lg:flex-none lg:text-center">
                <p
                  className={`text-[16px] font-bold ${
                    chosen === question.correctOptionIndex
                      ? 'text-success-text'
                      : 'text-error-text'
                  }`}
                >
                  {chosen === question.correctOptionIndex ? 'Correct' : 'Not quite'}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-step text-white/45">
                  This sign means
                </p>
                <p className="mt-1 text-[14px] leading-snug text-white/85">
                  {question.meaning}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {answered ? null : (
              <p className="text-[17px] font-bold leading-snug text-white">
                {question.prompt}
              </p>
            )}

            <div
              role="group"
              aria-label={question.prompt}
              className="flex flex-col gap-[9px]"
            >
              {question.options.map((option, index) => (
                <AnswerOption
                  key={option}
                  label={option}
                  index={index}
                  state={optionState(index, question, chosen)}
                  disabled={answered || submitting}
                  onSelect={() => answerCurrent(index)}
                />
              ))}
            </div>

            {answered ? (
              <div className="mt-1 flex flex-col gap-1.5">
                <PrimaryButton onClick={goToNext} loading={submitting}>
                  {submitting
                    ? 'Scoring…'
                    : isLastQuestion
                      ? 'Finish quiz'
                      : 'Next question'}
                </PrimaryButton>
                {isLastQuestion && !submitting ? (
                  // Decorative, and the one line that does not fit under the
                  // action bar on a 375×667 phone, so it only appears from `sm`.
                  <p className="hidden text-center text-[12px] text-white/45 sm:block">
                    You will see your score next.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {confirmingExit ? (
        <ExitConfirm onLeave={goToDashboard} onStay={() => setConfirmingExit(false)} />
      ) : null}
    </AppShell>
  )
}

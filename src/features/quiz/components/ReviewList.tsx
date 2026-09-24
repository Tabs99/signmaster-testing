import SignStage from './SignStage'
import type { QuestionOutcome } from '../../../lib/api/quizApi'

/**
 * The misses, and only the misses.
 *
 * Each row carries the sign, what it actually means in the client's own full
 * wording, and what the learner chose. Reviewing changes nothing about the
 * score, which the note at the end says plainly — otherwise the first question
 * this screen provokes is whether the score can still be fixed.
 */

export interface ReviewListProps {
  outcomes: QuestionOutcome[]
}

export default function ReviewList({ outcomes }: ReviewListProps) {
  const missed = outcomes.filter((outcome) => !outcome.isCorrect)

  if (missed.length === 0) {
    return null
  }

  return (
    <div className="w-full" data-testid="review-list">
      <p className="font-mono text-[11px] uppercase tracking-step text-white/55">
        Review · {missed.length} {missed.length === 1 ? 'sign' : 'signs'}
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {missed.map((outcome) => (
          <li
            key={outcome.questionIndex}
            className="flex gap-4 rounded-lg border border-white/[0.1] bg-keyline-plate p-3"
          >
            <SignStage images={outcome.images} label={outcome.meaning} size="thumbnail" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-snug text-success-text">
                {outcome.correctAnswer}
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-error-text">
                You said:{' '}
                {outcome.chosenAnswer ?? 'nothing — this one was left unanswered'}
              </p>
              {outcome.meaning !== outcome.correctAnswer ? (
                <p className="mt-2 text-[13px] leading-relaxed text-white/60">
                  {outcome.meaning}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[12px] text-white/45">
        Review only — your score stays as it is.
      </p>
    </div>
  )
}

/**
 * The question counter and the segment rule beneath it, as one unit so the two
 * can never disagree about where the learner is.
 *
 * The rule itself is decorative: the counter already says the same thing in
 * words, and a ten segment bar read aloud is noise.
 */

export interface QuizProgressRuleProps {
  /** 0-based index of the question on screen. */
  currentIndex: number
  total: number
}

export default function QuizProgressRule({ currentIndex, total }: QuizProgressRuleProps) {
  const isLast = currentIndex === total - 1

  return (
    <div className="w-full">
      <p
        aria-live="polite"
        className="font-mono text-[11px] uppercase tracking-step text-white/60"
        data-testid="quiz-counter"
      >
        Question {currentIndex + 1} of {total}
        {isLast ? ' · Last one' : ''}
      </p>
      <div aria-hidden="true" className="mt-2 flex gap-1">
        {Array.from({ length: total }, (_unused, index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full ${
              index < currentIndex
                ? 'bg-white/35'
                : index === currentIndex
                  ? 'bg-keyline-gold'
                  : 'bg-white/[0.12]'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

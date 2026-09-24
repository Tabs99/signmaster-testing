import Skeleton from '../../app/components/Skeleton'

/**
 * The question screen's shape while the ten questions are fetched: counter
 * and progress rule, the sign stage, the prompt, and four answer rows. Sizes
 * match the real components so the first question appears in place rather
 * than pushing a spinner out of the way.
 */
export default function QuizSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Preparing your quiz"
      className="mx-auto flex w-full max-w-[980px] flex-col gap-5 lg:min-h-[calc(100dvh-200px)] lg:justify-center"
      data-testid="quiz-loading"
    >
      <div className="w-full">
        <Skeleton className="h-3 w-[140px]" />
        <div aria-hidden="true" className="mt-2 flex gap-1">
          {Array.from({ length: 10 }, (_unused, index) => (
            <span key={index} className="h-1 flex-1 rounded-full bg-white/[0.08]" />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-12">
        <div className="mx-auto shrink-0 lg:mx-0">
          <Skeleton className="h-[160px] w-[160px] rounded-lg sm:h-[200px] sm:w-[200px] lg:h-[330px] lg:w-[330px]" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Skeleton className="h-5 w-[260px] max-w-full" />
          <div className="flex flex-col gap-[9px]">
            {Array.from({ length: 4 }, (_unused, index) => (
              <Skeleton key={index} className="h-[56px] w-full" />
            ))}
          </div>
        </div>
      </div>

      <p className="sr-only">Picking ten signs from your deck.</p>
    </div>
  )
}

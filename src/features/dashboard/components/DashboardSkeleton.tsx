import Skeleton from '../../app/components/Skeleton'

/**
 * The dashboard's shape while its numbers load: title row, four stat tiles,
 * then the progress panel with its three tier cards. Sizes match the real
 * components so the finished page slots in without moving anything.
 */
export default function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading your progress"
      className="flex w-full flex-col gap-6"
      data-testid="dashboard-loading"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-[180px]" />
        <Skeleton className="h-5 w-[120px]" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_unused, index) => (
          <div
            key={index}
            className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-keyline-pane px-5 py-5"
          >
            <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-[100px]" />
              <Skeleton className="h-7 w-[70px]" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-keyline-plate p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-6 w-[240px]" />
            <Skeleton className="h-4 w-[360px] max-w-full" />
          </div>
          <Skeleton className="h-[52px] w-full rounded-md sm:w-[240px]" />
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_unused, index) => (
            <div
              key={index}
              className="flex flex-col items-center rounded-2xl border border-white/[0.08] bg-keyline-pane px-5 py-8"
            >
              <Skeleton className="h-[112px] w-[112px] rounded-full" />
              <Skeleton className="mt-6 h-5 w-[140px]" />
              <Skeleton className="mt-3 h-3.5 w-[170px]" />
              <span className="my-6 h-px w-full bg-white/[0.08]" />
              <Skeleton className="h-4 w-[130px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

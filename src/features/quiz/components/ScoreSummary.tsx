/**
 * The score, and one honest sentence about it.
 *
 * No charts, no badge, no confetti. The number is the message; the line under
 * it is the only analysis the screen attempts, and it is keyed to bands rather
 * than generated, so it can never congratulate someone on a bad round.
 */

export interface ScoreSummaryProps {
  score: number
  total: number
}

export function encouragementFor(score: number, total: number): string {
  const share = total === 0 ? 0 : score / total

  if (share === 1) {
    return 'Every one. That is the whole round clean.'
  }

  if (share >= 0.8) {
    const missed = total - score
    return `Strong round — you are ${missed} ${missed === 1 ? 'sign' : 'signs'} off a clean sweep.`
  }

  if (share >= 0.5) {
    return 'Solid. The ones below are the ones worth another look.'
  }

  return 'Early days with these. Go through the misses and try another round.'
}

export default function ScoreSummary({ score, total }: ScoreSummaryProps) {
  const percentage = total === 0 ? 0 : Math.round((score / total) * 100)
  const missed = total - score

  return (
    <div className="keyline-plate w-full" data-testid="score-summary">
      <div className="keyline-plate-inner flex flex-col items-center py-7 text-center">
        <p className="font-mono text-[11px] uppercase tracking-step text-white/55">
          Quiz complete
        </p>
        <p className="mt-3 text-[56px] font-extrabold leading-none tracking-tight text-white">
          {score}
          <span className="text-[28px] text-white/45">/{total}</span>
        </p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-step text-white/55">
          {percentage}% · Signs identified
        </p>

        <div className="mt-5 flex items-center gap-5 text-[13px] font-semibold">
          <span className="text-success-text">{score} correct</span>
          <span className="text-white/20">·</span>
          <span className="text-error-text">
            {missed} to review
          </span>
        </div>

        <p className="mt-5 max-w-[320px] text-[14px] leading-relaxed text-white/70">
          {encouragementFor(score, total)}
        </p>
      </div>
    </div>
  )
}

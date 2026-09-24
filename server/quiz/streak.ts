/**
 * The daily streak shown on the dashboard.
 *
 * Derived from the days a learner finished a quiz rather than stored, so it can
 * never drift from what they actually did and needs no nightly job to expire
 * it.
 *
 * Today counts if they have finished a quiz today. A streak that ended
 * yesterday is still alive, because a learner who practised yesterday evening
 * and opens the app this morning has not broken anything yet — they would only
 * lose it by going a whole day without practising. Anything older is zero.
 */

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/** A calendar day in UTC, as `YYYY-MM-DD`. */
export function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10)
}

function daysBetween(earlier: string, later: string): number {
  const from = Date.parse(`${earlier}T00:00:00Z`)
  const to = Date.parse(`${later}T00:00:00Z`)

  return Math.round((to - from) / MILLISECONDS_PER_DAY)
}

/**
 * @param completedDates distinct days a quiz was finished, most recent first
 * @param now the moment the dashboard is being rendered
 */
export function currentStreak(
  completedDates: readonly string[],
  now: Date,
): number {
  if (completedDates.length === 0) {
    return 0
  }

  const today = utcDay(now)
  const gapToMostRecent = daysBetween(completedDates[0], today)

  if (gapToMostRecent > 1) {
    return 0
  }

  let streak = 1

  for (let index = 1; index < completedDates.length; index += 1) {
    if (daysBetween(completedDates[index], completedDates[index - 1]) !== 1) {
      break
    }

    streak += 1
  }

  return streak
}

import {
  authorizedFetch,
  isRecord,
  readResponseBody,
  type AuthorizedRequestOptions,
} from './authorizedRequest'

/**
 * Client for the dashboard's progress summary.
 *
 * Same boundary as the quiz endpoints: bearer token out, counts back. The
 * response carries no order id, entitlement id or user id, so nothing here can
 * put identifying data on a screen.
 */

export const PROGRESS_ME_PATH = '/api/progress/me'

export interface LearningStateCounts {
  needs_practice: number
  getting_better: number
  mastered: number
}

export interface ProgressSummary {
  totalLearned: number
  deckSize: number
  dailyStreak: number
  needReviewToday: number
  states: LearningStateCounts
  quizzesTaken: number
  bestScore: number | null
}

export type ProgressResult =
  | { kind: 'loaded'; summary: ProgressSummary }
  | { kind: 'unauthenticated' }
  | { kind: 'not_entitled' }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export type ProgressRequestOptions = AuthorizedRequestOptions

function isCounts(value: unknown): value is LearningStateCounts {
  return (
    isRecord(value) &&
    typeof value.needs_practice === 'number' &&
    typeof value.getting_better === 'number' &&
    typeof value.mastered === 'number'
  )
}

export async function fetchProgress(
  options: ProgressRequestOptions = {},
): Promise<ProgressResult> {
  try {
    const response = await authorizedFetch(PROGRESS_ME_PATH, { method: 'GET' }, options)

    if (!response) {
      return { kind: 'unauthenticated' }
    }

    if (response.status === 401) {
      return { kind: 'unauthenticated' }
    }

    if (response.status === 403) {
      return { kind: 'not_entitled' }
    }

    if (!response.ok) {
      return { kind: 'service_unavailable' }
    }

    const body = await readResponseBody(response)

    if (
      isRecord(body) &&
      body.status === 'OK' &&
      typeof body.totalLearned === 'number' &&
      typeof body.deckSize === 'number' &&
      typeof body.dailyStreak === 'number' &&
      typeof body.needReviewToday === 'number' &&
      typeof body.quizzesTaken === 'number' &&
      (body.bestScore === null || typeof body.bestScore === 'number') &&
      isCounts(body.states)
    ) {
      return {
        kind: 'loaded',
        summary: {
          totalLearned: body.totalLearned,
          deckSize: body.deckSize,
          dailyStreak: body.dailyStreak,
          needReviewToday: body.needReviewToday,
          states: body.states,
          quizzesTaken: body.quizzesTaken,
          bestScore: body.bestScore,
        },
      }
    }

    return { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  }
}

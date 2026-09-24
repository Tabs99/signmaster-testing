import { useCallback, useEffect, useState } from 'react'
import {
  fetchProgress as fetchProgressRequest,
  type ProgressRequestOptions,
  type ProgressSummary,
} from '../../../lib/api/progressApi'
import { useAuthContext } from '../../auth/context/AuthProvider'

/**
 * Loads the dashboard's numbers.
 *
 * The last summary is kept in memory for the life of the tab, so coming back
 * to the dashboard — from the quiz, most often — shows the numbers at once
 * and refreshes them in the background. Only the very first visit, or a visit
 * after signing out, shows the skeleton. A quiz that has just been finished
 * still shows up: the background refresh replaces the numbers when it lands.
 *
 * The cache is keyed to the signed-in user so one account's numbers can never
 * flash on screen for another.
 */

export type ProgressPhase =
  | { kind: 'loading' }
  | { kind: 'loaded'; summary: ProgressSummary }
  | { kind: 'failed'; reason: 'offline' | 'unavailable' }

export interface UseProgressSummaryOptions {
  onUnauthenticated: () => void
  onNotEntitled: () => void
  requestOptions?: ProgressRequestOptions
  fetchProgress?: typeof fetchProgressRequest
}

export interface ProgressSummaryState {
  phase: ProgressPhase
  /** True while a background refresh is running behind an already-shown summary. */
  refreshing: boolean
  reload: () => void
}

interface CachedSummary {
  userId: string
  summary: ProgressSummary
}

let cached: CachedSummary | null = null

/** Drops the remembered summary. Called on sign-out and by tests. */
export function clearProgressCache(): void {
  cached = null
}

function cachedFor(userId: string | null): ProgressSummary | null {
  return cached && userId !== null && cached.userId === userId ? cached.summary : null
}

export function useProgressSummary(
  options: UseProgressSummaryOptions,
): ProgressSummaryState {
  const {
    onUnauthenticated,
    onNotEntitled,
    requestOptions,
    fetchProgress = fetchProgressRequest,
  } = options

  const { user } = useAuthContext()
  const userId = user?.id ?? null
  const remembered = cachedFor(userId)

  const [phase, setPhase] = useState<ProgressPhase>(
    remembered ? { kind: 'loaded', summary: remembered } : { kind: 'loading' },
  )
  const [refreshing, setRefreshing] = useState(remembered !== null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    const haveSummary = cachedFor(userId) !== null

    // With nothing remembered this is a first load and the skeleton shows.
    // With a summary on screen the request runs quietly behind it.
    if (haveSummary) {
      setRefreshing(true)
    } else {
      setPhase({ kind: 'loading' })
    }

    void (async () => {
      const result = await fetchProgress(requestOptions)

      if (cancelled) {
        return
      }

      setRefreshing(false)

      switch (result.kind) {
        case 'loaded':
          if (userId !== null) {
            cached = { userId, summary: result.summary }
          }
          setPhase({ kind: 'loaded', summary: result.summary })
          return
        case 'unauthenticated':
          clearProgressCache()
          onUnauthenticated()
          return
        case 'not_entitled':
          clearProgressCache()
          onNotEntitled()
          return
        case 'connection_error':
          // A failed refresh behind real numbers is not worth an error screen;
          // the numbers stay and the next visit tries again.
          if (!haveSummary) {
            setPhase({ kind: 'failed', reason: 'offline' })
          }
          return
        default:
          if (!haveSummary) {
            setPhase({ kind: 'failed', reason: 'unavailable' })
          }
      }
    })()

    return () => {
      cancelled = true
    }
    // `reloadToken` is the retry signal; the callbacks are stable by contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, userId])

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  return { phase, refreshing, reload }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  claimActivationEntitlement,
  type ActivationClaimOutcome,
  type ActivationClaimResult,
} from '../../../lib/api/activationClaimApi'

export type ActivationClaimState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'outcome'; outcome: ActivationClaimOutcome }
  | { kind: 'rate_limited'; retryAfterMs: number | null }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export interface UseActivationClaimWhenReadyOptions {
  ready: boolean
  claim?: (options?: {
    fetchFn?: typeof fetch
    getAccessToken?: () => Promise<string | null>
  }) => Promise<ActivationClaimResult>
}

export interface UseActivationClaimWhenReadyResult {
  state: ActivationClaimState
  /**
   * Re-attempts the claim after a transient service/connection failure. A
   * definitive outcome (success/already_claimed) is terminal and cannot be
   * retried, and a retry is ignored while a request is in flight, so the claim
   * still runs at most once per definitive result and never issues duplicate
   * concurrent requests.
   */
  retry: () => void
}

function mapClaimResult(result: ActivationClaimResult): ActivationClaimState {
  if (result.kind === 'outcome') {
    return { kind: 'outcome', outcome: result.outcome }
  }

  if (result.kind === 'rate_limited') {
    return { kind: 'rate_limited', retryAfterMs: result.retryAfterMs }
  }

  return { kind: result.kind }
}

export function useActivationClaimWhenReady(
  options: UseActivationClaimWhenReadyOptions,
): UseActivationClaimWhenReadyResult {
  const claim = options.claim ?? claimActivationEntitlement
  const [state, setState] = useState<ActivationClaimState>({ kind: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const inFlightRef = useRef(false)
  const completedRef = useRef(false)

  useEffect(() => {
    if (!options.ready || inFlightRef.current || completedRef.current) {
      return
    }

    inFlightRef.current = true
    setState({ kind: 'loading' })

    void (async () => {
      const result = await claim()

      if (
        result.kind === 'outcome' &&
        (result.outcome === 'success' || result.outcome === 'already_claimed')
      ) {
        completedRef.current = true
      }

      setState(mapClaimResult(result))
      inFlightRef.current = false
    })()
  }, [claim, options.ready, attempt])

  const retry = useCallback(() => {
    if (inFlightRef.current || completedRef.current) {
      return
    }

    setAttempt((current) => current + 1)
  }, [])

  return { state, retry }
}

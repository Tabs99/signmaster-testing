import { useEffect, useRef, useState } from 'react'
import {
  claimActivationEntitlement,
  type ActivationClaimOutcome,
  type ActivationClaimResult,
} from '../../../lib/api/activationClaimApi'

export type ActivationClaimState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'outcome'; outcome: ActivationClaimOutcome }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export interface UseActivationClaimWhenReadyOptions {
  ready: boolean
  claim?: (options?: {
    fetchFn?: typeof fetch
    getAccessToken?: () => Promise<string | null>
  }) => Promise<ActivationClaimResult>
}

function mapClaimResult(result: ActivationClaimResult): ActivationClaimState {
  if (result.kind === 'outcome') {
    return { kind: 'outcome', outcome: result.outcome }
  }

  return { kind: result.kind }
}

export function useActivationClaimWhenReady(
  options: UseActivationClaimWhenReadyOptions,
): ActivationClaimState {
  const claim = options.claim ?? claimActivationEntitlement
  const [state, setState] = useState<ActivationClaimState>({ kind: 'idle' })
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
  }, [claim, options.ready])

  return state
}

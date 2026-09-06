import { useCallback, useRef, useState } from 'react'
import {
  completeActivation,
  type ActivationCompletionOutcome,
  type ActivationCompletionResult,
} from '../../../lib/api/activationCompletionApi'

export type ActivationCompletionState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'outcome'; outcome: ActivationCompletionOutcome }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export interface UseActivationCompletionOptions {
  complete?: (options?: {
    fetchFn?: typeof fetch
    getAccessToken?: () => Promise<string | null>
  }) => Promise<ActivationCompletionResult>
}

export interface UseActivationCompletionResult {
  state: ActivationCompletionState
  /**
   * Finalises the activation once. Repeated calls are ignored while a request is
   * in flight or after a definitive outcome has been received, so Continue /
   * Retry can never launch duplicate concurrent completion requests. A transient
   * service/connection failure leaves the completion retryable.
   */
  run: () => void
}

function mapCompletionResult(result: ActivationCompletionResult): ActivationCompletionState {
  if (result.kind === 'outcome') {
    return { kind: 'outcome', outcome: result.outcome }
  }

  return { kind: result.kind }
}

export function useActivationCompletion(
  options: UseActivationCompletionOptions = {},
): UseActivationCompletionResult {
  const complete = options.complete ?? completeActivation
  const [state, setState] = useState<ActivationCompletionState>({ kind: 'idle' })
  const inFlightRef = useRef(false)
  const completedRef = useRef(false)

  const run = useCallback(() => {
    if (inFlightRef.current || completedRef.current) {
      return
    }

    inFlightRef.current = true
    setState({ kind: 'loading' })

    void (async () => {
      const result = await complete()

      if (result.kind === 'outcome') {
        completedRef.current = true
      }

      setState(mapCompletionResult(result))
      inFlightRef.current = false
    })()
  }, [complete])

  return { state, run }
}

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
   * in flight, and are permanently disabled after a *terminal* outcome, so
   * Continue / Retry can never launch duplicate concurrent completion requests.
   *
   * Terminal outcomes are `completed` and `no_context` (already finalised).
   * Non-terminal outcomes — `not_eligible`, `email_not_confirmed`,
   * `unauthenticated` — plus transient service/connection failures leave the
   * completion retryable so the user can recover (e.g. after re-auth or email
   * confirmation) via an explicit action. There is no automatic retry loop.
   */
  run: () => void
}

/**
 * Outcomes that permanently close the completion lifecycle. Everything else is
 * a recoverable state the user can retry from with an explicit action.
 */
const TERMINAL_COMPLETION_OUTCOMES: ReadonlySet<ActivationCompletionOutcome> = new Set([
  'completed',
  'no_context',
])

function isTerminalOutcome(result: ActivationCompletionResult): boolean {
  return result.kind === 'outcome' && TERMINAL_COMPLETION_OUTCOMES.has(result.outcome)
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

      if (isTerminalOutcome(result)) {
        completedRef.current = true
      }

      setState(mapCompletionResult(result))
      inFlightRef.current = false
    })()
  }, [complete])

  return { state, run }
}

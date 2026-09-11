import { useCallback, useEffect, useRef, useState } from 'react'
import {
  resolveActivationContext,
  type ActivationContextResolutionStatus,
  type ActivationContextResolveResult,
} from '../../../lib/api/activationContextApi'

export interface UseActivationContextResolutionResult {
  status: ActivationContextResolutionStatus | null
  isLoading: boolean
  error: boolean
  retry: () => void
}

export interface UseActivationContextResolutionOptions {
  resolveContext?: (
    options?: Parameters<typeof resolveActivationContext>[0],
  ) => Promise<ActivationContextResolveResult>
  /**
   * When false, the hook does not resolve the activation context (no network
   * call) and reports a non-loading, unresolved state. Used by protected
   * routing to only resolve the context once it is actually needed (entitlement
   * is NONE). Defaults to true so existing callers are unchanged.
   */
  enabled?: boolean
}

export function useActivationContextResolution(
  options: UseActivationContextResolutionOptions = {},
): UseActivationContextResolutionResult {
  const resolveContext = options.resolveContext ?? resolveActivationContext
  const enabled = options.enabled ?? true
  const [status, setStatus] = useState<ActivationContextResolutionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState(false)
  const activeRef = useRef(true)
  const inFlightRef = useRef(false)

  const loadContext = useCallback(async () => {
    if (inFlightRef.current) {
      return
    }

    inFlightRef.current = true
    setIsLoading(true)

    const result = await resolveContext()

    if (!activeRef.current) {
      inFlightRef.current = false
      return
    }

    if (result.kind === 'status') {
      setStatus(result.status)
      setError(false)
    } else {
      setStatus(null)
      setError(true)
    }

    setIsLoading(false)
    inFlightRef.current = false
  }, [resolveContext])

  useEffect(() => {
    activeRef.current = true

    if (enabled) {
      void loadContext()
    } else {
      setIsLoading(false)
    }

    return () => {
      activeRef.current = false
    }
  }, [enabled, loadContext])

  const retry = useCallback(() => {
    if (!enabled) {
      return
    }

    void loadContext()
  }, [enabled, loadContext])

  return { status, isLoading, error, retry }
}

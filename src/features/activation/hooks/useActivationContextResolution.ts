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
}

export function useActivationContextResolution(
  options: UseActivationContextResolutionOptions = {},
): UseActivationContextResolutionResult {
  const resolveContext = options.resolveContext ?? resolveActivationContext
  const [status, setStatus] = useState<ActivationContextResolutionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
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
    void loadContext()

    return () => {
      activeRef.current = false
    }
  }, [loadContext])

  const retry = useCallback(() => {
    void loadContext()
  }, [loadContext])

  return { status, isLoading, error, retry }
}

import { useEffect, useState } from 'react'
import {
  resolveActivationContext,
  type ActivationContextResolutionStatus,
} from '../../../lib/api/activationContextApi'

export interface UseActivationContextResolutionResult {
  status: ActivationContextResolutionStatus | null
  isLoading: boolean
  error: boolean
}

export function useActivationContextResolution(): UseActivationContextResolutionResult {
  const [status, setStatus] = useState<ActivationContextResolutionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true

    async function loadContext() {
      const result = await resolveActivationContext()

      if (!active) {
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
    }

    void loadContext()

    return () => {
      active = false
    }
  }, [])

  return { status, isLoading, error }
}

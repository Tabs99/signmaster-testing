import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchEntitlement,
  type EntitlementRequestOptions,
  type EntitlementResult,
} from '../../../lib/api/entitlementApi'
import type { EntitlementPhase } from '../../../lib/routing/protectedRouteResolver'

export interface UseEntitlementResolutionOptions {
  /**
   * Only fetch when enabled (i.e. the user is authenticated). When false the
   * hook stays idle and issues no network call. Re-enabling triggers a fresh
   * fetch — the entitlement authority always comes from the backend, never from
   * a browser cache.
   */
  enabled: boolean
  getEntitlement?: (
    options?: EntitlementRequestOptions,
  ) => Promise<EntitlementResult>
}

export interface UseEntitlementResolutionResult {
  phase: EntitlementPhase
  retry: () => void
}

function mapResult(result: EntitlementResult): EntitlementPhase {
  switch (result.kind) {
    case 'active':
      return { kind: 'active' }
    case 'none':
      return { kind: 'none' }
    case 'unauthenticated':
      return { kind: 'unauthenticated' }
    case 'service_unavailable':
    case 'connection_error':
      return { kind: 'error' }
  }
}

export function useEntitlementResolution(
  options: UseEntitlementResolutionOptions,
): UseEntitlementResolutionResult {
  const getEntitlement = options.getEntitlement ?? fetchEntitlement
  const { enabled } = options
  const [phase, setPhase] = useState<EntitlementPhase>(
    enabled ? { kind: 'loading' } : { kind: 'idle' },
  )
  const activeRef = useRef(true)
  const inFlightRef = useRef(false)

  const load = useCallback(async () => {
    if (inFlightRef.current) {
      return
    }

    inFlightRef.current = true
    setPhase({ kind: 'loading' })

    const result = await getEntitlement()

    if (!activeRef.current) {
      inFlightRef.current = false
      return
    }

    setPhase(mapResult(result))
    inFlightRef.current = false
  }, [getEntitlement])

  useEffect(() => {
    activeRef.current = true

    if (enabled) {
      void load()
    } else {
      setPhase({ kind: 'idle' })
    }

    return () => {
      activeRef.current = false
    }
  }, [enabled, load])

  const retry = useCallback(() => {
    if (!enabled) {
      return
    }

    void load()
  }, [enabled, load])

  return { phase, retry }
}

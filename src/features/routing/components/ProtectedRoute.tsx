import { useCallback, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import PageShell from '../../../components/layout/PageShell'
import BrandLockup from '../../activation/components/BrandLockup'
import LoadingSpinner from '../../activation/components/LoadingSpinner'
import ActivationStatusPlate from '../../activation/components/ActivationStatusPlate'
import { useActivationContextResolution } from '../../activation/hooks/useActivationContextResolution'
import { useAuthContext } from '../../auth/context/AuthProvider'
import {
  resolveProtectedRouteState,
  type ActivationContextPhase,
} from '../../../lib/routing/protectedRouteResolver'
import type {
  ActivationContextRequestOptions,
  ActivationContextResolutionStatus,
  ActivationContextResolveResult,
} from '../../../lib/api/activationContextApi'
import type { EntitlementRequestOptions, EntitlementResult } from '../../../lib/api/entitlementApi'
import { useEntitlementResolution } from '../hooks/useEntitlementResolution'
import ActivationRequiredScreen from './ActivationRequiredScreen'

export interface ProtectedRouteProps {
  children: ReactNode
  signInPath?: string
  resumeActivationPath?: string
  activatePath?: string
  getEntitlement?: (options?: EntitlementRequestOptions) => Promise<EntitlementResult>
  resolveContext?: (
    options?: ActivationContextRequestOptions,
  ) => Promise<ActivationContextResolveResult>
}

function ProtectedRouteLoading() {
  return (
    <PageShell>
      <div
        className="my-auto flex w-full max-w-[420px] flex-col items-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid="protected-route-loading"
      >
        <BrandLockup variant="desktop" />
        <div className="flex items-center gap-3 rounded-md border border-white/20 bg-keyline-pane px-4 py-4 text-white/80">
          <LoadingSpinner />
          <p className="text-[14px] font-semibold leading-snug">Checking your access…</p>
        </div>
      </div>
    </PageShell>
  )
}

function ProtectedRouteError({ onRetry }: { onRetry: () => void }) {
  return (
    <PageShell>
      <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
        <BrandLockup variant="desktop" />
        <div className="w-full" data-testid="protected-route-error">
          <ActivationStatusPlate
            tone="neutral"
            heading="We couldn't check your access"
            body={[
              "SignMaster is temporarily unavailable and we couldn't confirm your access.",
              'Please try again in a moment.',
            ]}
            primaryAction={{ label: 'Try again', onClick: onRetry }}
          />
        </div>
      </div>
    </PageShell>
  )
}

function toActivationContextPhase(
  enabled: boolean,
  status: ActivationContextResolutionStatus | null,
  error: boolean,
): ActivationContextPhase {
  if (!enabled) {
    return { kind: 'idle' }
  }

  if (error) {
    return { kind: 'error' }
  }

  if (status === 'VALID') {
    return { kind: 'resumable' }
  }

  if (status === 'EXPIRED' || status === 'NONE') {
    return { kind: 'not_resumable' }
  }

  return { kind: 'loading' }
}

/**
 * Entitlement-aware route guard and post-auth resolver.
 *
 * It renders exactly one outcome per pass from a pure state machine
 * (`resolveProtectedRouteState`), so there are never competing redirects. While
 * any authority is still resolving it shows a neutral loading screen and never
 * the protected content — so protected content cannot flash before access is
 * confirmed. The entitlement authority is fetched fresh from the backend on
 * every mount; nothing is read from localStorage/sessionStorage.
 */
export default function ProtectedRoute({
  children,
  signInPath = '/sign-in',
  resumeActivationPath = '/create-account',
  activatePath = '/activate',
  getEntitlement,
  resolveContext,
}: ProtectedRouteProps) {
  const { isInitializing, isAuthenticated, signOut } = useAuthContext()
  const navigate = useNavigate()

  const entitlementEnabled = !isInitializing && isAuthenticated
  const { phase: entitlementPhase, retry: retryEntitlement } = useEntitlementResolution({
    enabled: entitlementEnabled,
    getEntitlement,
  })

  const contextEnabled = entitlementPhase.kind === 'none'
  const {
    status: contextStatus,
    error: contextError,
    retry: retryContext,
  } = useActivationContextResolution({
    enabled: contextEnabled,
    resolveContext,
  })

  const activationContext = toActivationContextPhase(
    contextEnabled,
    contextStatus,
    contextError,
  )

  const state = resolveProtectedRouteState({
    authInitializing: isInitializing,
    isAuthenticated,
    entitlement: entitlementPhase,
    activationContext,
  })

  const handleRetry = useCallback(() => {
    retryEntitlement()
    retryContext()
  }, [retryEntitlement, retryContext])

  const handleUseAnotherAccount = useCallback(async () => {
    await signOut()
    navigate(signInPath, { replace: true })
  }, [navigate, signInPath, signOut])

  const handleVerifyOrder = useCallback(() => {
    navigate(activatePath)
  }, [activatePath, navigate])

  switch (state) {
    case 'checking_auth':
    case 'checking_entitlement':
    case 'checking_activation_context':
      return <ProtectedRouteLoading />
    case 'signed_out':
      return <Navigate to={signInPath} replace />
    case 'resume_activation':
      return <Navigate to={resumeActivationPath} replace />
    case 'active':
      return <>{children}</>
    case 'activation_required':
      return (
        <ActivationRequiredScreen
          onVerifyOrder={handleVerifyOrder}
          onUseAnotherAccount={() => {
            void handleUseAnotherAccount()
          }}
        />
      )
    case 'retryable_error':
      return <ProtectedRouteError onRetry={handleRetry} />
  }
}

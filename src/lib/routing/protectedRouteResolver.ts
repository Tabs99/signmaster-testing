/**
 * Pure state machine for entitlement-aware protected routing.
 *
 * Given the current auth phase, the server-authoritative entitlement phase, and
 * (only when relevant) the activation-context phase, this resolves to a single
 * routing state. Keeping it pure means every branch is unit-testable without a
 * DOM, and the guard component renders exactly one outcome per pass — so there
 * are never two competing redirects in flight.
 *
 * Authority ordering (fail closed at every step):
 *   auth → entitlement → activation context
 *
 * - Auth is still initialising                     → checking_auth
 * - Not authenticated                              → signed_out
 * - Entitlement not yet known                      → checking_entitlement
 * - Entitlement ACTIVE                             → active
 * - Server rejected the token (unauthenticated)    → signed_out
 * - Entitlement lookup failed (transient)          → retryable_error
 * - Entitlement NONE, context not yet known        → checking_activation_context
 * - Entitlement NONE, context resumable (VALID)    → resume_activation
 * - Entitlement NONE, context lookup failed        → retryable_error
 * - Entitlement NONE, context not resumable        → activation_required
 */

export type ProtectedRouteState =
  | 'checking_auth'
  | 'signed_out'
  | 'checking_entitlement'
  | 'active'
  | 'checking_activation_context'
  | 'resume_activation'
  | 'activation_required'
  | 'retryable_error'

export type EntitlementPhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'active' }
  | { kind: 'none' }
  | { kind: 'unauthenticated' }
  | { kind: 'error' }

export type ActivationContextPhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'resumable' }
  | { kind: 'not_resumable' }
  | { kind: 'error' }

export interface ProtectedRouteResolverInput {
  authInitializing: boolean
  isAuthenticated: boolean
  entitlement: EntitlementPhase
  activationContext: ActivationContextPhase
}

export function resolveProtectedRouteState(
  input: ProtectedRouteResolverInput,
): ProtectedRouteState {
  const { authInitializing, isAuthenticated, entitlement, activationContext } = input

  if (authInitializing) {
    return 'checking_auth'
  }

  if (!isAuthenticated) {
    return 'signed_out'
  }

  switch (entitlement.kind) {
    case 'idle':
    case 'loading':
      return 'checking_entitlement'
    case 'active':
      return 'active'
    case 'unauthenticated':
      // The session looked valid client-side but the backend rejected the
      // token. Treat as signed out rather than granting or erroring.
      return 'signed_out'
    case 'error':
      return 'retryable_error'
    case 'none':
      break
  }

  switch (activationContext.kind) {
    case 'idle':
    case 'loading':
      return 'checking_activation_context'
    case 'resumable':
      return 'resume_activation'
    case 'error':
      return 'retryable_error'
    case 'not_resumable':
      return 'activation_required'
  }
}

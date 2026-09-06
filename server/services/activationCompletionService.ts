import {
  fetchEntitlementByOrderId,
  resolveExistingEntitlementOwnership,
  type ActivationClaimClient,
} from './activationClaimService.ts'
import {
  invalidateActivationContext,
  resolveActivationContextWithOrderId,
  type ActivationContextClient,
} from './activationContextService.ts'

/**
 * Task 6 activation finalisation.
 *
 * Runs strictly after a successful Task 5 claim. It confirms — using only the
 * server-side activation context cookie and the authenticated user id — that the
 * entitlement for the resolved order exists, belongs to the caller, and is
 * active, then invalidates the activation context so it can no longer be reused.
 *
 * The routine never trusts a browser-supplied order id/user id, never
 * transfers or recreates entitlements, and never surfaces the Amazon Order ID,
 * context token, or entitlement row identity to callers.
 */
export type ActivationCompletionOutcome = 'COMPLETED' | 'NO_CONTEXT' | 'NOT_ELIGIBLE'

export type ActivationCompletionClient = ActivationClaimClient & ActivationContextClient

export interface FinalizeActivationCompletionDeps {
  resolveContextWithOrderId: typeof resolveActivationContextWithOrderId
  fetchEntitlement: typeof fetchEntitlementByOrderId
  invalidateContext: typeof invalidateActivationContext
}

export const defaultFinalizeActivationCompletionDeps: FinalizeActivationCompletionDeps = {
  resolveContextWithOrderId: resolveActivationContextWithOrderId,
  fetchEntitlement: fetchEntitlementByOrderId,
  invalidateContext: invalidateActivationContext,
}

export interface FinalizeActivationCompletionInput {
  supabaseClient: ActivationCompletionClient
  userId: string
  token: string
  now?: Date
  deps?: FinalizeActivationCompletionDeps
}

export async function finalizeActivationCompletion(
  input: FinalizeActivationCompletionInput,
): Promise<ActivationCompletionOutcome> {
  const { supabaseClient, userId, token, now } = input
  const deps = input.deps ?? defaultFinalizeActivationCompletionDeps

  const resolution = await deps.resolveContextWithOrderId({
    supabaseClient,
    token,
    now,
    // The context is about to be invalidated; refreshing its expiry would waste
    // a write and muddy the finalisation semantics.
    touchOnValid: false,
  })

  if (resolution.status !== 'VALID') {
    // NONE (missing/unknown token) and EXPIRED (expired or already invalidated)
    // both mean there is nothing left to finalise. This is the safe idempotent
    // path for a repeated completion after the context has already been cleared.
    return 'NO_CONTEXT'
  }

  const entitlement = await deps.fetchEntitlement(supabaseClient, resolution.amazonOrderId)

  if (!entitlement) {
    return 'NOT_ELIGIBLE'
  }

  // Reuse the frozen Task 5 ownership rules: only an entitlement that is owned
  // by the caller AND active may be finalised. Other-user or revoked
  // entitlements collapse to a single safe NOT_ELIGIBLE outcome with no leak of
  // which case occurred.
  const ownership = resolveExistingEntitlementOwnership(entitlement, userId)

  if (ownership !== 'SUCCESS') {
    return 'NOT_ELIGIBLE'
  }

  // Invalidate last. If this write fails the caller receives an error and the
  // context is left intact so completion can be retried. If the response is lost
  // after a successful invalidation, a retry resolves the context as EXPIRED and
  // returns NO_CONTEXT, which the client treats as an already-finalised success.
  await deps.invalidateContext(token, { supabaseClient, now })

  return 'COMPLETED'
}

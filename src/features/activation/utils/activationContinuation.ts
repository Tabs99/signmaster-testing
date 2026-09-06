import type { ActivationClaimState } from '../hooks/useActivationClaimWhenReady'
import type { ActivationCompletionState } from '../hooks/useActivationCompletion'

/**
 * Task 6 continuation view model.
 *
 * This is a pure projection of the frozen Task 5 claim result and the Task 6
 * completion result into a single view the claim-result UI renders. It composes
 * existing outcomes; it does not re-derive the resume/resolver logic.
 */
export type ActivationContinuationView =
  | 'idle'
  | 'claiming'
  | 'activated_pending_finalize'
  | 'finalizing'
  | 'activated'
  | 'finalize_retryable_error'
  | 'already_claimed'
  | 'not_eligible'
  | 'no_context'
  | 'context_expired'
  | 'email_not_confirmed'
  | 'unauthenticated'
  | 'claim_retryable_error'

export function resolveActivationContinuationView(
  claim: ActivationClaimState,
  completion: ActivationCompletionState,
): ActivationContinuationView {
  if (claim.kind === 'idle') {
    return 'idle'
  }

  if (claim.kind === 'loading') {
    return 'claiming'
  }

  if (claim.kind === 'service_unavailable' || claim.kind === 'connection_error') {
    return 'claim_retryable_error'
  }

  switch (claim.outcome) {
    case 'success':
      return resolveSuccessView(completion)
    case 'already_claimed':
      return 'already_claimed'
    case 'not_eligible':
      return 'not_eligible'
    case 'no_context':
      return 'no_context'
    case 'context_expired':
      return 'context_expired'
    case 'email_not_confirmed':
      return 'email_not_confirmed'
    case 'unauthenticated':
      return 'unauthenticated'
  }
}

function resolveSuccessView(
  completion: ActivationCompletionState,
): ActivationContinuationView {
  if (completion.kind === 'idle') {
    return 'activated_pending_finalize'
  }

  if (completion.kind === 'loading') {
    return 'finalizing'
  }

  if (
    completion.kind === 'service_unavailable' ||
    completion.kind === 'connection_error'
  ) {
    // The claim already granted the entitlement, so the user is genuinely
    // activated; only the finalisation cleanup failed and can be retried.
    return 'finalize_retryable_error'
  }

  // Any definitive completion outcome (completed / no_context / and the
  // defensive not_eligible|email_not_confirmed|unauthenticated races) resolves to
  // the terminal activated state: the claim was the authority for access and a
  // completion no_context simply means the context was already finalised.
  return 'activated'
}

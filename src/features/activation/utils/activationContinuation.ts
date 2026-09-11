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
  | 'finalize_not_eligible'
  | 'finalize_email_not_confirmed'
  | 'finalize_unauthenticated'
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

  // The completion endpoint re-checks ownership/active status at finalisation
  // time and is authoritative. A stale claim SUCCESS must NOT paper over a
  // negative completion outcome.
  switch (completion.outcome) {
    case 'completed':
      return 'activated'
    case 'no_context':
      // Deliberate recovery semantics: after a successful claim, an empty
      // activation context means finalisation already happened (the cookie was
      // cleared on a previous COMPLETED response), so we treat it as activated.
      // See ARCHITECTURE.md "repeated completion semantics".
      return 'activated'
    case 'not_eligible':
      // Entitlement is no longer active/owned at finalisation (e.g. revoked
      // between claim and completion). Never show activated.
      return 'finalize_not_eligible'
    case 'email_not_confirmed':
      return 'finalize_email_not_confirmed'
    case 'unauthenticated':
      return 'finalize_unauthenticated'
  }
}

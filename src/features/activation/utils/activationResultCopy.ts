/**
 * Customer-facing copy for Task 6 activation claim/completion result states.
 *
 * B7B ineligibility copy is centralised here. The Task 5 claim endpoint
 * intentionally collapses every ineligible reason into a single `not_eligible`
 * outcome and never leaks the internal status, so the claim-result UI uses the
 * neutral `fallback` copy. The `cancelled` / `returned` strings are retained for
 * reuse by any surface that can safely present a specific reason without leaking
 * internal statuses.
 */
export const ACTIVATION_INELIGIBLE_COPY = {
  cancelled:
    'This order was cancelled after we checked it, so it can no longer be used to activate SignMaster.',
  returned:
    'It looks like the qualifying SignMaster pack was returned after we checked it, so this order can no longer be used to activate access.',
  fallback: 'This order can no longer be used to activate SignMaster.',
} as const

export type ActivationIneligibleReason = keyof typeof ACTIVATION_INELIGIBLE_COPY

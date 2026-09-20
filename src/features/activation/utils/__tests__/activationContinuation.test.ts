import { describe, expect, it } from 'vitest'
import { resolveActivationContinuationView } from '../activationContinuation'
import type { ActivationClaimState } from '../../hooks/useActivationClaimWhenReady'
import type { ActivationCompletionState } from '../../hooks/useActivationCompletion'

const idleCompletion: ActivationCompletionState = { kind: 'idle' }

function claimOutcome(
  outcome: Extract<ActivationClaimState, { kind: 'outcome' }>['outcome'],
): ActivationClaimState {
  return { kind: 'outcome', outcome }
}

describe('resolveActivationContinuationView', () => {
  it('is idle before the claim starts', () => {
    expect(resolveActivationContinuationView({ kind: 'idle' }, idleCompletion)).toBe('idle')
  })

  it('shows claiming while the claim is in flight', () => {
    expect(resolveActivationContinuationView({ kind: 'loading' }, idleCompletion)).toBe(
      'claiming',
    )
  })

  it('maps rate-limited claim errors to a dedicated view', () => {
    expect(
      resolveActivationContinuationView(
        { kind: 'rate_limited', retryAfterMs: 60_000 },
        idleCompletion,
      ),
    ).toBe('claim_rate_limited')
    expect(
      resolveActivationContinuationView(
        { kind: 'rate_limited', retryAfterMs: null },
        idleCompletion,
      ),
    ).toBe('claim_rate_limited')
  })

  it('maps transient claim errors to a retryable claim error', () => {
    expect(
      resolveActivationContinuationView({ kind: 'service_unavailable' }, idleCompletion),
    ).toBe('claim_retryable_error')
    expect(
      resolveActivationContinuationView({ kind: 'connection_error' }, idleCompletion),
    ).toBe('claim_retryable_error')
  })

  it('maps non-success claim outcomes to their dedicated views', () => {
    expect(resolveActivationContinuationView(claimOutcome('already_claimed'), idleCompletion)).toBe(
      'already_claimed',
    )
    expect(resolveActivationContinuationView(claimOutcome('not_eligible'), idleCompletion)).toBe(
      'not_eligible',
    )
    expect(resolveActivationContinuationView(claimOutcome('no_context'), idleCompletion)).toBe(
      'no_context',
    )
    expect(resolveActivationContinuationView(claimOutcome('context_expired'), idleCompletion)).toBe(
      'context_expired',
    )
    expect(
      resolveActivationContinuationView(claimOutcome('email_not_confirmed'), idleCompletion),
    ).toBe('email_not_confirmed')
    expect(resolveActivationContinuationView(claimOutcome('unauthenticated'), idleCompletion)).toBe(
      'unauthenticated',
    )
  })

  describe('when the claim succeeds', () => {
    const success = claimOutcome('success')

    it('awaits finalisation before finalising', () => {
      expect(resolveActivationContinuationView(success, { kind: 'idle' })).toBe(
        'activated_pending_finalize',
      )
    })

    it('shows finalizing while completion is loading', () => {
      expect(resolveActivationContinuationView(success, { kind: 'loading' })).toBe('finalizing')
    })

    it('is activated on a completed finalisation', () => {
      expect(
        resolveActivationContinuationView(success, { kind: 'outcome', outcome: 'completed' }),
      ).toBe('activated')
    })

    it('is activated when the context was already finalised (no_context)', () => {
      expect(
        resolveActivationContinuationView(success, { kind: 'outcome', outcome: 'no_context' }),
      ).toBe('activated')
    })

    it('surfaces a retryable finalisation error without losing activation', () => {
      expect(
        resolveActivationContinuationView(success, { kind: 'service_unavailable' }),
      ).toBe('finalize_retryable_error')
      expect(
        resolveActivationContinuationView(success, { kind: 'connection_error' }),
      ).toBe('finalize_retryable_error')
    })

    it('does NOT show activated when completion is not_eligible', () => {
      const view = resolveActivationContinuationView(success, {
        kind: 'outcome',
        outcome: 'not_eligible',
      })
      expect(view).toBe('finalize_not_eligible')
      expect(view).not.toBe('activated')
    })

    it('does NOT show activated when completion reports email not confirmed', () => {
      const view = resolveActivationContinuationView(success, {
        kind: 'outcome',
        outcome: 'email_not_confirmed',
      })
      expect(view).toBe('finalize_email_not_confirmed')
      expect(view).not.toBe('activated')
    })

    it('does NOT show activated when completion reports unauthenticated', () => {
      const view = resolveActivationContinuationView(success, {
        kind: 'outcome',
        outcome: 'unauthenticated',
      })
      expect(view).toBe('finalize_unauthenticated')
      expect(view).not.toBe('activated')
    })
  })
})

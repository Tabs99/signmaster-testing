import { describe, expect, it, vi } from 'vitest'
import {
  finalizeActivationCompletion,
  type FinalizeActivationCompletionDeps,
} from '../activationCompletionService.ts'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const FIXTURE_TOKEN = 'fixture-opaque-token-123456789012345678901234567890'
const CURRENT_USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'

function createDeps(
  overrides: Partial<FinalizeActivationCompletionDeps> = {},
): FinalizeActivationCompletionDeps {
  return {
    resolveContextWithOrderId: vi.fn(),
    fetchEntitlement: vi.fn(),
    invalidateContext: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function run(deps: FinalizeActivationCompletionDeps) {
  return finalizeActivationCompletion({
    supabaseClient: {} as never,
    userId: CURRENT_USER_ID,
    token: FIXTURE_TOKEN,
    deps,
  })
}

describe('finalizeActivationCompletion', () => {
  it('completes and invalidates the context for an owned active entitlement', async () => {
    const invalidateContext = vi.fn().mockResolvedValue(undefined)
    const deps = createDeps({
      resolveContextWithOrderId: vi
        .fn()
        .mockResolvedValue({ status: 'VALID', amazonOrderId: FIXTURE_ORDER_ID }),
      fetchEntitlement: vi.fn().mockResolvedValue({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: CURRENT_USER_ID,
        status: 'active',
      }),
      invalidateContext,
    })

    await expect(run(deps)).resolves.toBe('COMPLETED')
    expect(invalidateContext).toHaveBeenCalledTimes(1)
    expect(invalidateContext).toHaveBeenCalledWith(
      FIXTURE_TOKEN,
      expect.objectContaining({ supabaseClient: expect.anything() }),
    )
  })

  it('does not touch/refresh the context expiry while resolving for completion', async () => {
    const resolveContextWithOrderId = vi
      .fn()
      .mockResolvedValue({ status: 'VALID', amazonOrderId: FIXTURE_ORDER_ID })
    const deps = createDeps({
      resolveContextWithOrderId,
      fetchEntitlement: vi.fn().mockResolvedValue({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: CURRENT_USER_ID,
        status: 'active',
      }),
    })

    await run(deps)

    expect(resolveContextWithOrderId).toHaveBeenCalledWith(
      expect.objectContaining({ touchOnValid: false }),
    )
  })

  it('returns NO_CONTEXT when the context is missing', async () => {
    const invalidateContext = vi.fn().mockResolvedValue(undefined)
    const deps = createDeps({
      resolveContextWithOrderId: vi.fn().mockResolvedValue({ status: 'NONE' }),
      invalidateContext,
    })

    await expect(run(deps)).resolves.toBe('NO_CONTEXT')
    expect(invalidateContext).not.toHaveBeenCalled()
  })

  it('returns NO_CONTEXT when the context is expired or already invalidated', async () => {
    const deps = createDeps({
      resolveContextWithOrderId: vi.fn().mockResolvedValue({ status: 'EXPIRED' }),
    })

    await expect(run(deps)).resolves.toBe('NO_CONTEXT')
  })

  it('returns NOT_ELIGIBLE when no entitlement exists for the order', async () => {
    const invalidateContext = vi.fn().mockResolvedValue(undefined)
    const deps = createDeps({
      resolveContextWithOrderId: vi
        .fn()
        .mockResolvedValue({ status: 'VALID', amazonOrderId: FIXTURE_ORDER_ID }),
      fetchEntitlement: vi.fn().mockResolvedValue(null),
      invalidateContext,
    })

    await expect(run(deps)).resolves.toBe('NOT_ELIGIBLE')
    expect(invalidateContext).not.toHaveBeenCalled()
  })

  it('returns NOT_ELIGIBLE for an entitlement owned by another user', async () => {
    const invalidateContext = vi.fn().mockResolvedValue(undefined)
    const deps = createDeps({
      resolveContextWithOrderId: vi
        .fn()
        .mockResolvedValue({ status: 'VALID', amazonOrderId: FIXTURE_ORDER_ID }),
      fetchEntitlement: vi.fn().mockResolvedValue({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: OTHER_USER_ID,
        status: 'active',
      }),
      invalidateContext,
    })

    await expect(run(deps)).resolves.toBe('NOT_ELIGIBLE')
    expect(invalidateContext).not.toHaveBeenCalled()
  })

  it('returns NOT_ELIGIBLE for a revoked entitlement owned by the user', async () => {
    const deps = createDeps({
      resolveContextWithOrderId: vi
        .fn()
        .mockResolvedValue({ status: 'VALID', amazonOrderId: FIXTURE_ORDER_ID }),
      fetchEntitlement: vi.fn().mockResolvedValue({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: CURRENT_USER_ID,
        status: 'revoked',
      }),
    })

    await expect(run(deps)).resolves.toBe('NOT_ELIGIBLE')
  })

  it('propagates cleanup failures so completion can be retried with the context intact', async () => {
    const deps = createDeps({
      resolveContextWithOrderId: vi
        .fn()
        .mockResolvedValue({ status: 'VALID', amazonOrderId: FIXTURE_ORDER_ID }),
      fetchEntitlement: vi.fn().mockResolvedValue({
        id: 'entitlement-1',
        amazon_order_id: FIXTURE_ORDER_ID,
        user_id: CURRENT_USER_ID,
        status: 'active',
      }),
      invalidateContext: vi.fn().mockRejectedValue(new Error('invalidate failed')),
    })

    await expect(run(deps)).rejects.toThrow('invalidate failed')
  })
})

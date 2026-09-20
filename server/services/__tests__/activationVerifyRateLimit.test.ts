import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVATION_VERIFY_IP_ATTEMPT_LIMIT,
  ACTIVATION_VERIFY_ORDER_ATTEMPT_LIMIT,
  ACTIVATION_VERIFY_RATE_WINDOW_SECONDS,
  ActivationVerifyRateLimitError,
  CHECK_ACTIVATION_VERIFY_ATTEMPT_FN,
  checkAndRecordActivationVerifyAttempt,
} from '../activationVerifyRateLimit.ts'

describe('checkAndRecordActivationVerifyAttempt', () => {
  it('returns allowed when RPC succeeds', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: null },
      error: null,
    })
    const supabaseClient = { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await checkAndRecordActivationVerifyAttempt({
      supabaseClient,
      ipBucketKey: 'ip:abc',
      orderBucketKey: 'oid:def',
    })

    expect(result).toEqual({ allowed: true, retryAfterSeconds: null })
    expect(rpc).toHaveBeenCalledWith(CHECK_ACTIVATION_VERIFY_ATTEMPT_FN, {
      p_ip_bucket: 'ip:abc',
      p_order_bucket: 'oid:def',
      p_now: expect.any(String),
      p_window_seconds: ACTIVATION_VERIFY_RATE_WINDOW_SECONDS,
      p_ip_limit: ACTIVATION_VERIFY_IP_ATTEMPT_LIMIT,
      p_order_limit: ACTIVATION_VERIFY_ORDER_ATTEMPT_LIMIT,
    })
  })

  it('returns limited with retry hint', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: false, retry_after_seconds: 120 },
      error: null,
    })
    const supabaseClient = { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await checkAndRecordActivationVerifyAttempt({
      supabaseClient,
      ipBucketKey: 'ip:abc',
      orderBucketKey: null,
    })

    expect(result).toEqual({ allowed: false, retryAfterSeconds: 120 })
  })

  it('throws ActivationVerifyRateLimitError when RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'function not found', code: '42883' },
    })
    const supabaseClient = { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient

    await expect(
      checkAndRecordActivationVerifyAttempt({
        supabaseClient,
        ipBucketKey: 'ip:abc',
        orderBucketKey: null,
      }),
    ).rejects.toBeInstanceOf(ActivationVerifyRateLimitError)
  })
})

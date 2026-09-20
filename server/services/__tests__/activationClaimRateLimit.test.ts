import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVATION_CLAIM_CONTEXT_ATTEMPT_LIMIT,
  ACTIVATION_CLAIM_IP_ATTEMPT_LIMIT,
  ACTIVATION_CLAIM_RATE_WINDOW_SECONDS,
  ACTIVATION_CLAIM_USER_ATTEMPT_LIMIT,
  ActivationClaimRateLimitError,
  CHECK_ACTIVATION_CLAIM_ATTEMPT_FN,
  checkAndRecordActivationClaimAttempt,
} from '../activationClaimRateLimit.ts'

describe('checkAndRecordActivationClaimAttempt', () => {
  it('calls the claim RPC with hashed bucket keys', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: null },
      error: null,
    })
    const supabaseClient = { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient

    await checkAndRecordActivationClaimAttempt({
      supabaseClient,
      ipBucketKey: 'claim-ip:abc',
      userBucketKey: 'claim-uid:def',
      contextBucketKey: 'claim-ctx:ghi',
    })

    expect(rpc).toHaveBeenCalledWith(CHECK_ACTIVATION_CLAIM_ATTEMPT_FN, {
      p_ip_bucket: 'claim-ip:abc',
      p_user_bucket: 'claim-uid:def',
      p_context_bucket: 'claim-ctx:ghi',
      p_now: expect.any(String),
      p_window_seconds: ACTIVATION_CLAIM_RATE_WINDOW_SECONDS,
      p_ip_limit: ACTIVATION_CLAIM_IP_ATTEMPT_LIMIT,
      p_user_limit: ACTIVATION_CLAIM_USER_ATTEMPT_LIMIT,
      p_context_limit: ACTIVATION_CLAIM_CONTEXT_ATTEMPT_LIMIT,
    })
  })

  it('throws when RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'missing function', code: '42883' },
    })
    const supabaseClient = { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient

    await expect(
      checkAndRecordActivationClaimAttempt({
        supabaseClient,
        ipBucketKey: 'claim-ip:abc',
        userBucketKey: null,
        contextBucketKey: null,
      }),
    ).rejects.toBeInstanceOf(ActivationClaimRateLimitError)
  })
})

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ActivationVerifyRateLimitError,
  normalizeActivationRateLimitRpcPayload,
  type ActivationVerifyRateLimitResult,
} from './activationRateLimitRpc.ts'

export const CHECK_ACTIVATION_VERIFY_ATTEMPT_FN = 'check_and_record_activation_verify_attempt'

/** 15-minute sliding windows — enough for typos without enabling sustained guessing. */
export const ACTIVATION_VERIFY_RATE_WINDOW_SECONDS = 900

/** Per client IP (hashed bucket) within the window. */
export const ACTIVATION_VERIFY_IP_ATTEMPT_LIMIT = 40

/** Per Order ID (hashed bucket) within the window. */
export const ACTIVATION_VERIFY_ORDER_ATTEMPT_LIMIT = 15

export interface ActivationVerifyRateLimitInput {
  supabaseClient: SupabaseClient
  ipBucketKey: string
  orderBucketKey: string | null
  now?: Date
}

export type { ActivationVerifyRateLimitResult }
export { ActivationVerifyRateLimitError }

export async function checkAndRecordActivationVerifyAttempt(
  input: ActivationVerifyRateLimitInput,
): Promise<ActivationVerifyRateLimitResult> {
  const now = input.now ?? new Date()

  const { data, error } = await input.supabaseClient.rpc(CHECK_ACTIVATION_VERIFY_ATTEMPT_FN, {
    p_ip_bucket: input.ipBucketKey,
    p_order_bucket: input.orderBucketKey,
    p_now: now.toISOString(),
    p_window_seconds: ACTIVATION_VERIFY_RATE_WINDOW_SECONDS,
    p_ip_limit: ACTIVATION_VERIFY_IP_ATTEMPT_LIMIT,
    p_order_limit: ACTIVATION_VERIFY_ORDER_ATTEMPT_LIMIT,
  })

  if (error) {
    throw new ActivationVerifyRateLimitError(
      'Activation verify rate limit check failed',
      error.code,
    )
  }

  return normalizeActivationRateLimitRpcPayload(data)
}

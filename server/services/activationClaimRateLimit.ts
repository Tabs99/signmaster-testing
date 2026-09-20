import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type ActivationVerifyRateLimitResult,
  ActivationVerifyRateLimitError,
  normalizeActivationRateLimitRpcPayload,
} from './activationRateLimitRpc.ts'

export const CHECK_ACTIVATION_CLAIM_ATTEMPT_FN = 'check_and_record_activation_claim_attempt'

export const ACTIVATION_CLAIM_RATE_WINDOW_SECONDS = 900

/** Per IP (hashed) — includes unauthenticated POST /claim attempts. */
export const ACTIVATION_CLAIM_IP_ATTEMPT_LIMIT = 40

/** Per authenticated user (hashed) — generous for idempotent retries after transient errors. */
export const ACTIVATION_CLAIM_USER_ATTEMPT_LIMIT = 60

/** Per activation context token (hashed) — ties to server-side order without storing Order ID. */
export const ACTIVATION_CLAIM_CONTEXT_ATTEMPT_LIMIT = 45

export interface ActivationClaimRateLimitInput {
  supabaseClient: SupabaseClient
  ipBucketKey: string
  userBucketKey: string | null
  contextBucketKey: string | null
  now?: Date
}

export class ActivationClaimRateLimitError extends ActivationVerifyRateLimitError {
  constructor(message: string, code?: string) {
    super(message, code)
    this.name = 'ActivationClaimRateLimitError'
  }
}

export async function checkAndRecordActivationClaimAttempt(
  input: ActivationClaimRateLimitInput,
): Promise<ActivationVerifyRateLimitResult> {
  const now = input.now ?? new Date()

  const { data, error } = await input.supabaseClient.rpc(CHECK_ACTIVATION_CLAIM_ATTEMPT_FN, {
    p_ip_bucket: input.ipBucketKey,
    p_user_bucket: input.userBucketKey,
    p_context_bucket: input.contextBucketKey,
    p_now: now.toISOString(),
    p_window_seconds: ACTIVATION_CLAIM_RATE_WINDOW_SECONDS,
    p_ip_limit: ACTIVATION_CLAIM_IP_ATTEMPT_LIMIT,
    p_user_limit: ACTIVATION_CLAIM_USER_ATTEMPT_LIMIT,
    p_context_limit: ACTIVATION_CLAIM_CONTEXT_ATTEMPT_LIMIT,
  })

  if (error) {
    throw new ActivationClaimRateLimitError(
      'Activation claim rate limit check failed',
      error.code,
    )
  }

  return normalizeActivationRateLimitRpcPayload(data)
}

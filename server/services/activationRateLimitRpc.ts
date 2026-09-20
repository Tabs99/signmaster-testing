export interface ActivationRateLimitResult {
  allowed: boolean
  retryAfterSeconds: number | null
}

export class ActivationRateLimitError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ActivationRateLimitError'
    this.code = code
  }
}

/** @deprecated Use ActivationRateLimitError — kept for verify imports. */
export class ActivationVerifyRateLimitError extends ActivationRateLimitError {
  constructor(message: string, code?: string) {
    super(message, code)
    this.name = 'ActivationVerifyRateLimitError'
  }
}

export type ActivationVerifyRateLimitResult = ActivationRateLimitResult

export function normalizeActivationRateLimitRpcPayload(
  data: unknown,
): ActivationRateLimitResult {
  if (!data || typeof data !== 'object') {
    throw new ActivationRateLimitError('Invalid rate limit RPC response shape')
  }

  const record = data as Record<string, unknown>
  const allowed = record.allowed === true
  const retryRaw = record.retry_after_seconds

  let retryAfterSeconds: number | null = null
  if (typeof retryRaw === 'number' && Number.isFinite(retryRaw) && retryRaw > 0) {
    retryAfterSeconds = Math.ceil(retryRaw)
  }

  return { allowed, retryAfterSeconds }
}

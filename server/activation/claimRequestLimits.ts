import {
  estimateActivationVerifyBodyBytes,
  parseContentLengthHeader,
} from './verifyRequestLimits.ts'

/** Bodyless POST — allow only absent/null/empty JSON object. */
export const ACTIVATION_CLAIM_MAX_BODY_BYTES = 256

export function isActivationClaimBodyAllowed(body: unknown): boolean {
  if (body === undefined || body === null) {
    return true
  }

  if (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0) {
    return true
  }

  return false
}

export function isActivationClaimBodyTooLarge(
  headers: Record<string, string | string[] | undefined> | undefined,
  body: unknown,
): boolean {
  const contentLength = parseContentLengthHeader(headers)
  if (contentLength !== null && contentLength > ACTIVATION_CLAIM_MAX_BODY_BYTES) {
    return true
  }

  return estimateActivationVerifyBodyBytes(body) > ACTIVATION_CLAIM_MAX_BODY_BYTES
}

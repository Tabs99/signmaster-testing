import { createHash, randomBytes } from 'node:crypto'

/**
 * Cross-device activation continuation reference.
 *
 * This is a short-lived, opaque, single-use token embedded in the account
 * confirmation email link (`emailRedirectTo`). It lets the activation journey
 * resume on a *different* browser/device after email confirmation, where the
 * original HttpOnly activation-context cookie is not present.
 *
 * The raw reference is only ever a random opaque string. It never encodes the
 * Amazon Order ID, the activation-context token, a user id, an email, or any
 * reusable credential — the server stores only its SHA-256 hash and resolves
 * all continuation state server-side.
 */
export const ACTIVATION_CONTINUATION_REFERENCE_BYTES = 32

/** Continuation references are intentionally short-lived. */
export const ACTIVATION_CONTINUATION_LIFETIME_SECONDS = 30 * 60

export function generateActivationContinuationReference(): string {
  return randomBytes(ACTIVATION_CONTINUATION_REFERENCE_BYTES).toString('base64url')
}

export function hashActivationContinuationReference(reference: string): string {
  return createHash('sha256').update(reference, 'utf8').digest('hex')
}

export function isValidActivationContinuationReferenceFormat(
  reference: string,
): boolean {
  if (!reference || reference.length < 32 || reference.length > 128) {
    return false
  }

  return /^[A-Za-z0-9_-]+$/.test(reference)
}

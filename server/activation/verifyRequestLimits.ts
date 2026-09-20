/** Max JSON body size for POST /api/activation/verify ({ "orderId": "…" } only). */
export const ACTIVATION_VERIFY_MAX_BODY_BYTES = 1024

export function parseContentLengthHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
): number | null {
  if (!headers) {
    return null
  }

  const value = headers['content-length']
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !raw.trim()) {
    return null
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

export function estimateActivationVerifyBodyBytes(body: unknown): number {
  if (body === undefined || body === null) {
    return 0
  }

  try {
    return new TextEncoder().encode(JSON.stringify(body)).length
  } catch {
    return ACTIVATION_VERIFY_MAX_BODY_BYTES + 1
  }
}

export function isActivationVerifyBodyTooLarge(
  headers: Record<string, string | string[] | undefined> | undefined,
  body: unknown,
): boolean {
  const contentLength = parseContentLengthHeader(headers)
  if (contentLength !== null && contentLength > ACTIVATION_VERIFY_MAX_BODY_BYTES) {
    return true
  }

  return estimateActivationVerifyBodyBytes(body) > ACTIVATION_VERIFY_MAX_BODY_BYTES
}

/**
 * Client IP for rate limiting on Vercel serverless.
 *
 * Precedence (first non-empty wins):
 * 1. `x-vercel-forwarded-for` — set by Vercel's edge with the connecting client IP (preferred in production).
 * 2. `x-forwarded-for` — first comma-separated hop only (local proxies / legacy); not trusted from arbitrary clients off-platform.
 * 3. `x-real-ip`
 * 4. `unknown` — shared bucket for local dev without proxy headers (deterministic).
 *
 * `@vercel/functions` `ipAddress(request)` is not used here: the verify handler receives a
 * header map (Vercel Node adapter), not a Web `Request`, and the package is not a runtime dependency.
 */
export function readRequestHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  if (!headers) {
    return null
  }

  const value = headers[name]
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') {
    return null
  }

  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function firstForwardedHop(forwarded: string): string | null {
  const first = forwarded.split(',')[0]?.trim()
  return first && first.length > 0 ? first : null
}

export function getActivationVerifyClientIp(
  headers: Record<string, string | string[] | undefined> | undefined,
): string {
  const vercelForwarded = readRequestHeader(headers, 'x-vercel-forwarded-for')
  if (vercelForwarded) {
    return vercelForwarded
  }

  const forwarded = readRequestHeader(headers, 'x-forwarded-for')
  if (forwarded) {
    const firstHop = firstForwardedHop(forwarded)
    if (firstHop) {
      return firstHop
    }
  }

  const realIp = readRequestHeader(headers, 'x-real-ip')
  if (realIp) {
    return realIp
  }

  return 'unknown'
}

export const ACTIVATION_CONTEXT_COOKIE_NAME = 'sm_activation_ctx'
export const ACTIVATION_CONTEXT_LIFETIME_SECONDS = 60 * 60

export interface ActivationContextCookieOptions {
  secure?: boolean
  maxAgeSeconds?: number
}

export function buildActivationContextSetCookie(
  token: string,
  options: ActivationContextCookieOptions = {},
): string {
  const maxAge = options.maxAgeSeconds ?? ACTIVATION_CONTEXT_LIFETIME_SECONDS
  const parts = [
    `${ACTIVATION_CONTEXT_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
  ]

  if (options.secure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

export function buildActivationContextClearCookie(
  options: Pick<ActivationContextCookieOptions, 'secure'> = {},
): string {
  const parts = [
    `${ACTIVATION_CONTEXT_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    'SameSite=Lax',
  ]

  if (options.secure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

export function parseActivationContextCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) {
    return null
  }

  const cookies = cookieHeader.split(';')

  for (const cookie of cookies) {
    const trimmed = cookie.trim()
    if (!trimmed.startsWith(`${ACTIVATION_CONTEXT_COOKIE_NAME}=`)) {
      continue
    }

    const value = trimmed.slice(ACTIVATION_CONTEXT_COOKIE_NAME.length + 1)
    if (!value) {
      return null
    }

    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }

  return null
}

export function shouldUseSecureActivationContextCookie(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.ACTIVATION_CONTEXT_COOKIE_SECURE === 'true') {
    return true
  }

  if (env.ACTIVATION_CONTEXT_COOKIE_SECURE === 'false') {
    return false
  }

  return env.NODE_ENV === 'production' || Boolean(env.VERCEL)
}

const SAFE_OAUTH_RETURN_PATHS = new Set([
  '/activate',
  '/sign-in',
  '/create-account',
])

/**
 * Builds the OAuth `redirectTo` URL for Supabase Google sign-in.
 *
 * Uses only the app origin and a path — never query params — so the URL cannot
 * carry Amazon Order IDs, activation-context tokens, or other sensitive
 * identifiers.
 */
export function buildOAuthReturnUrl(options?: { origin?: string; pathname?: string }): string {
  const origin =
    options?.origin ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  const rawPath =
    options?.pathname ??
    (typeof window !== 'undefined' ? window.location.pathname : '/sign-in')

  const pathname = rawPath.startsWith('/') ? rawPath : '/sign-in'
  const safePath = SAFE_OAUTH_RETURN_PATHS.has(pathname) ? pathname : '/sign-in'

  return `${origin}${safePath}`
}

/** Dedicated app route the password-recovery email links back to. */
export const PASSWORD_RESET_ROUTE = '/reset-password'

/**
 * Builds the `redirectTo` URL for the password-recovery email.
 *
 * The URL points only at the dedicated reset route on the current app origin.
 * Supabase appends the recovery session itself; we deliberately add no query
 * params, so it carries no user id, Amazon Order ID, activation-context token,
 * entitlement id, or any other sensitive identifier.
 */
export function buildPasswordResetRedirect(origin?: string): string {
  const resolvedOrigin = origin ?? window.location.origin
  return `${resolvedOrigin}${PASSWORD_RESET_ROUTE}`
}

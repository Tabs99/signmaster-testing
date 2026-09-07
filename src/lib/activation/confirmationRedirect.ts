import { requestActivationContinuation } from '../api/activationContinuationApi'

/** Client route the account confirmation email links to. */
export const ACTIVATION_CONTINUE_ROUTE = '/activation/continue'

export interface BuildConfirmationRedirectOptions {
  origin?: string
  request?: typeof requestActivationContinuation
}

/**
 * Builds the `emailRedirectTo` URL used for account confirmation.
 *
 * When a valid activation context exists in the current browser it mints an
 * opaque, single-use continuation reference and embeds it as `?ref=...` so the
 * activation journey can resume on the confirming device (cross-device). When
 * there is no context (or minting fails) it returns the plain continue route,
 * leaving the same-device flow unaffected. The reference is opaque and carries
 * no order id, context token, user id, or email.
 */
export async function buildConfirmationContinuationRedirect(
  email: string,
  options: BuildConfirmationRedirectOptions = {},
): Promise<string> {
  const origin = options.origin ?? window.location.origin
  const request = options.request ?? requestActivationContinuation
  const base = `${origin}${ACTIVATION_CONTINUE_ROUTE}`

  try {
    const result = await request(email)

    if (result.kind === 'created') {
      const url = new URL(base)
      url.searchParams.set('ref', result.reference)
      return url.toString()
    }
  } catch {
    // Fall through to the plain continue route; same-device confirmation still works.
  }

  return base
}

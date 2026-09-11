import { parseActivationContextCookie } from '../../server/activation/contextCookie.ts'
import {
  buildActivationContextClearCookie,
  shouldUseSecureActivationContextCookie,
} from '../../server/activation/contextCookie.ts'
import { ActivationConfigError } from '../../server/activation/config.ts'
import { ActivationClaimError } from '../../server/services/activationClaimService.ts'
import { ActivationContextError } from '../../server/services/activationContextService.ts'
import {
  finalizeActivationCompletion,
  type ActivationCompletionClient,
} from '../../server/services/activationCompletionService.ts'
import {
  getAuthenticatedUserFromRequest,
} from '../../server/supabase/requestAuth.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'

export type ActivationCompleteResponseStatus =
  | 'COMPLETED'
  | 'NO_CONTEXT'
  | 'NOT_ELIGIBLE'
  | 'EMAIL_NOT_CONFIRMED'
  | 'UNAUTHENTICATED'
  | 'ERROR'

export interface VercelLikeRequest {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

export interface VercelLikeResponse {
  setHeader(name: string, value: string | string[]): void
  status(code: number): VercelLikeResponse
  json(body: unknown): void
}

export interface ActivationCompleteHandlerDeps {
  createClient: () => ActivationCompletionClient
  getAuthenticatedUser: typeof getAuthenticatedUserFromRequest
  finalizeCompletion: typeof finalizeActivationCompletion
  shouldUseSecureCookie: typeof shouldUseSecureActivationContextCookie
}

const defaultDeps: ActivationCompleteHandlerDeps = {
  createClient: () => createServiceRoleClientFromEnv() as unknown as ActivationCompletionClient,
  getAuthenticatedUser: getAuthenticatedUserFromRequest,
  finalizeCompletion: finalizeActivationCompletion,
  shouldUseSecureCookie: shouldUseSecureActivationContextCookie,
}

function getCookieHeader(req: VercelLikeRequest): string | undefined {
  const cookie = req.headers?.cookie
  if (typeof cookie === 'string') {
    return cookie
  }

  if (Array.isArray(cookie)) {
    return cookie.join('; ')
  }

  return undefined
}

export async function handleActivationComplete(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: ActivationCompleteHandlerDeps = defaultDeps,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  try {
    const authenticatedUser = await deps.getAuthenticatedUser(req.headers)

    if (!authenticatedUser) {
      res.status(401).json({ status: 'UNAUTHENTICATED' })
      return
    }

    if (!authenticatedUser.emailConfirmed) {
      res.status(200).json({ status: 'EMAIL_NOT_CONFIRMED' })
      return
    }

    const contextToken = parseActivationContextCookie(getCookieHeader(req))

    if (!contextToken) {
      // Nothing to finalise and no cookie to clear. This is the safe repeat path
      // once the activation context has already been cleared from this browser.
      res.status(200).json({ status: 'NO_CONTEXT' })
      return
    }

    const supabaseClient = deps.createClient()
    const outcome = await deps.finalizeCompletion({
      supabaseClient,
      userId: authenticatedUser.id,
      token: contextToken,
    })

    const secure = deps.shouldUseSecureCookie()

    if (outcome === 'COMPLETED') {
      res.setHeader('Set-Cookie', buildActivationContextClearCookie({ secure }))
      res.status(200).json({ status: 'COMPLETED' })
      return
    }

    if (outcome === 'NO_CONTEXT') {
      // The cookie referenced a context that is gone/expired/invalidated. Clear
      // the stale cookie so the browser stops presenting it.
      res.setHeader('Set-Cookie', buildActivationContextClearCookie({ secure }))
      res.status(200).json({ status: 'NO_CONTEXT' })
      return
    }

    // NOT_ELIGIBLE: leave the cookie intact so Task 5 claim retry idempotency is
    // preserved and no completion side effect occurred.
    res.status(200).json({ status: 'NOT_ELIGIBLE' })
  } catch (error) {
    if (
      error instanceof ActivationClaimError ||
      error instanceof ActivationContextError ||
      error instanceof ActivationConfigError ||
      error instanceof Error
    ) {
      res.status(500).json({ status: 'ERROR' })
      return
    }

    res.status(500).json({ status: 'ERROR' })
  }
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  await handleActivationComplete(req, res)
}

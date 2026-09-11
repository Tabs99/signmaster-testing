import {
  buildActivationContextSetCookie,
  shouldUseSecureActivationContextCookie,
  ACTIVATION_CONTEXT_LIFETIME_SECONDS,
} from '../../server/activation/contextCookie.ts'
import { ActivationConfigError } from '../../server/activation/config.ts'
import { ActivationContextError } from '../../server/services/activationContextService.ts'
import {
  ActivationContinuationError,
  consumeActivationContinuation,
  type ActivationContinuationConsumeClient,
} from '../../server/services/activationContinuationService.ts'
import { getAuthenticatedUserFromRequest } from '../../server/supabase/requestAuth.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'

export type ActivationContinueStatus =
  | 'CONTINUED'
  | 'INVALID'
  | 'EXPIRED'
  | 'ALREADY_CONSUMED'
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

export interface ActivationContinueHandlerDeps {
  createClient: () => ActivationContinuationConsumeClient
  getAuthenticatedUser: typeof getAuthenticatedUserFromRequest
  consumeContinuation: typeof consumeActivationContinuation
  shouldUseSecureCookie: typeof shouldUseSecureActivationContextCookie
}

const defaultDeps: ActivationContinueHandlerDeps = {
  createClient: () =>
    createServiceRoleClientFromEnv() as unknown as ActivationContinuationConsumeClient,
  getAuthenticatedUser: getAuthenticatedUserFromRequest,
  consumeContinuation: consumeActivationContinuation,
  shouldUseSecureCookie: shouldUseSecureActivationContextCookie,
}

export function parseContinueBody(body: unknown): { ref: string } | null {
  if (!body || typeof body !== 'object' || !('ref' in body)) {
    return null
  }

  const ref = (body as { ref: unknown }).ref

  if (typeof ref !== 'string' || ref.trim().length === 0) {
    return null
  }

  return { ref: ref.trim() }
}

export async function handleActivationContinue(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: ActivationContinueHandlerDeps = defaultDeps,
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

    const parsedBody = parseContinueBody(req.body)

    if (!parsedBody) {
      res.status(200).json({ status: 'INVALID' })
      return
    }

    const supabaseClient = deps.createClient()
    const result = await deps.consumeContinuation({
      supabaseClient,
      reference: parsedBody.ref,
      email: authenticatedUser.email,
    })

    if (result.status === 'CONTINUED') {
      const secure = deps.shouldUseSecureCookie()
      res.setHeader(
        'Set-Cookie',
        buildActivationContextSetCookie(result.contextToken, {
          secure,
          maxAgeSeconds: ACTIVATION_CONTEXT_LIFETIME_SECONDS,
        }),
      )
      res.status(200).json({ status: 'CONTINUED' })
      return
    }

    res.status(200).json({ status: result.status })
  } catch (error) {
    if (
      error instanceof ActivationContinuationError ||
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
  await handleActivationContinue(req, res)
}

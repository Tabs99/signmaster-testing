import { parseActivationContextCookie } from '../../server/activation/contextCookie.ts'
import { ActivationConfigError } from '../../server/activation/config.ts'
import { ActivationContextError } from '../../server/services/activationContextService.ts'
import {
  ActivationContinuationError,
  createActivationContinuation,
  type ActivationContinuationCreateClient,
} from '../../server/services/activationContinuationService.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'

export type ActivationContinuationCreateStatus = 'CREATED' | 'NO_CONTEXT' | 'ERROR'

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

export interface ActivationContinuationCreateHandlerDeps {
  createClient: () => ActivationContinuationCreateClient
  createContinuation: typeof createActivationContinuation
}

const defaultDeps: ActivationContinuationCreateHandlerDeps = {
  createClient: () =>
    createServiceRoleClientFromEnv() as unknown as ActivationContinuationCreateClient,
  createContinuation: createActivationContinuation,
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

export function parseContinuationCreateBody(
  body: unknown,
): { email: string } | null {
  if (!body || typeof body !== 'object' || !('email' in body)) {
    return null
  }

  const email = (body as { email: unknown }).email

  if (typeof email !== 'string' || email.trim().length === 0) {
    return null
  }

  return { email: email.trim() }
}

export async function handleActivationContinuationCreate(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: ActivationContinuationCreateHandlerDeps = defaultDeps,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  const parsedBody = parseContinuationCreateBody(req.body)

  if (!parsedBody) {
    res.status(400).json({ error: 'INVALID_REQUEST' })
    return
  }

  const contextToken = parseActivationContextCookie(getCookieHeader(req))

  if (!contextToken) {
    // No activation context in this browser — nothing to hand off cross-device.
    res.status(200).json({ status: 'NO_CONTEXT' })
    return
  }

  try {
    const supabaseClient = deps.createClient()
    const result = await deps.createContinuation({
      supabaseClient,
      contextToken,
      email: parsedBody.email,
    })

    if (result.status === 'CREATED') {
      res.status(200).json({ status: 'CREATED', reference: result.reference })
      return
    }

    res.status(200).json({ status: 'NO_CONTEXT' })
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
  await handleActivationContinuationCreate(req, res)
}

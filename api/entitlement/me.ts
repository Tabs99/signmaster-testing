import {
  EntitlementServiceError,
  checkUserEntitlement,
} from '../../server/services/entitlementService.ts'
import { getAuthenticatedUserFromRequest } from '../../server/supabase/requestAuth.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'

/**
 * GET /api/entitlement/me — server-authoritative entitlement check for the
 * currently authenticated user.
 *
 * Security boundary:
 * - The browser sends a Supabase bearer token ONLY. The user id is derived
 *   server-side from that verified token — never trusted from the request body
 *   or query string.
 * - The entitlement lookup runs with service-role authority via
 *   `server/services/entitlementService.ts`.
 * - Only `status = 'active'` grants access. Missing/revoked → NONE.
 * - Fail closed: any dependency error returns a generic ERROR (never access).
 * - The response is a minimal status enum. It exposes no Amazon Order ID,
 *   entitlement id, user id, timestamps, revocation reason, or database errors.
 */
export type EntitlementResponseStatus = 'ACTIVE' | 'NONE'

export interface EntitlementSuccessResponse {
  status: EntitlementResponseStatus
}

export interface EntitlementUnauthenticatedResponse {
  status: 'UNAUTHENTICATED'
}

export interface EntitlementErrorResponse {
  status: 'ERROR'
}

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

export interface EntitlementHandlerDeps {
  createClient: typeof createServiceRoleClientFromEnv
  getAuthenticatedUser: typeof getAuthenticatedUserFromRequest
  checkEntitlement: typeof checkUserEntitlement
}

const defaultDeps: EntitlementHandlerDeps = {
  createClient: createServiceRoleClientFromEnv,
  getAuthenticatedUser: getAuthenticatedUserFromRequest,
  checkEntitlement: checkUserEntitlement,
}

export async function handleEntitlementMe(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: EntitlementHandlerDeps = defaultDeps,
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  try {
    const authenticatedUser = await deps.getAuthenticatedUser(req.headers)

    if (!authenticatedUser) {
      res.status(401).json({ status: 'UNAUTHENTICATED' })
      return
    }

    const supabaseClient = deps.createClient()
    const result = await deps.checkEntitlement({
      supabaseClient,
      userId: authenticatedUser.id,
    })

    res.status(200).json({ status: result } satisfies EntitlementSuccessResponse)
  } catch (error) {
    if (error instanceof EntitlementServiceError || error instanceof Error) {
      res.status(500).json({ status: 'ERROR' } satisfies EntitlementErrorResponse)
      return
    }

    res.status(500).json({ status: 'ERROR' } satisfies EntitlementErrorResponse)
  }
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  await handleEntitlementMe(req, res)
}

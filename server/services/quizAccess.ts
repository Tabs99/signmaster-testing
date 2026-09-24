import {
  checkUserEntitlement,
  type EntitlementClient,
} from './entitlementService.ts'
import {
  getAuthenticatedUserFromRequest,
  type AuthenticatedRequestUser,
} from '../supabase/requestAuth.ts'
import { createServiceRoleClientFromEnv } from '../supabase/client.ts'
import type { VercelLikeResponse } from '../http/vercel.ts'

/**
 * The gate every quiz endpoint sits behind.
 *
 * Authentication and entitlement are separate questions (see ARCHITECTURE.md,
 * "Authentication versus entitlement"): a valid session does not imply a
 * purchase. The quiz is what the customer paid for, so both have to hold.
 *
 * Fails closed. Anything other than a confirmed active entitlement is refused,
 * including a dependency error, so a database wobble can never open access.
 */

export type QuizAccessOutcome =
  | { kind: 'allowed'; user: AuthenticatedRequestUser }
  | { kind: 'unauthenticated' }
  | { kind: 'not_entitled' }

export interface QuizAccessDeps {
  getAuthenticatedUser: typeof getAuthenticatedUserFromRequest
  createClient: () => EntitlementClient
  checkEntitlement: typeof checkUserEntitlement
}

export const defaultQuizAccessDeps: QuizAccessDeps = {
  getAuthenticatedUser: getAuthenticatedUserFromRequest,
  createClient: createServiceRoleClientFromEnv,
  checkEntitlement: checkUserEntitlement,
}

export async function resolveQuizAccess(
  headers: Record<string, string | string[] | undefined> | undefined,
  deps: QuizAccessDeps = defaultQuizAccessDeps,
): Promise<QuizAccessOutcome> {
  const user = await deps.getAuthenticatedUser(headers)

  if (!user) {
    return { kind: 'unauthenticated' }
  }

  const entitlement = await deps.checkEntitlement({
    supabaseClient: deps.createClient(),
    userId: user.id,
  })

  if (entitlement !== 'ACTIVE') {
    return { kind: 'not_entitled' }
  }

  return { kind: 'allowed', user }
}

/**
 * Applies the gate for a handler. Returns the user when they may proceed, or
 * writes the refusal to the response and returns null. Every quiz endpoint
 * answers a refused request the same way, so the mapping lives here once.
 */
export async function requireQuizAccess(
  headers: Record<string, string | string[] | undefined> | undefined,
  res: VercelLikeResponse,
  deps: QuizAccessDeps = defaultQuizAccessDeps,
): Promise<AuthenticatedRequestUser | null> {
  const access = await resolveQuizAccess(headers, deps)

  if (access.kind === 'unauthenticated') {
    res.status(401).json({ status: 'UNAUTHENTICATED' })
    return null
  }

  if (access.kind === 'not_entitled') {
    res.status(403).json({ status: 'NOT_ENTITLED' })
    return null
  }

  return access.user
}

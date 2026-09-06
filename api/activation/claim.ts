import { parseActivationContextCookie } from '../../server/activation/contextCookie.ts'
import {
  ActivationConfigError,
  getActivationTargetAsin,
} from '../../server/activation/config.ts'
import {
  ActivationClaimError,
  claimActivationEntitlement,
  fetchEntitlementByOrderId,
  resolveExistingEntitlementOwnership,
} from '../../server/services/activationClaimService.ts'
import {
  ActivationContextError,
  resolveActivationContextWithOrderId,
} from '../../server/services/activationContextService.ts'
import {
  ActivationVerificationError,
  verifyActivationEligibility,
} from '../../server/services/activationVerification.ts'
import {
  getAuthenticatedUserFromRequest,
  type AuthenticatedRequestUser,
} from '../../server/supabase/requestAuth.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'

export type ActivationClaimResponseStatus =
  | 'SUCCESS'
  | 'ALREADY_CLAIMED'
  | 'NO_CONTEXT'
  | 'CONTEXT_EXPIRED'
  | 'EMAIL_NOT_CONFIRMED'
  | 'UNAUTHENTICATED'
  | 'NOT_ELIGIBLE'
  | 'ERROR'

export interface ActivationClaimSuccessResponse {
  status: Exclude<
    ActivationClaimResponseStatus,
    'ERROR' | 'UNAUTHENTICATED'
  >
}

export interface ActivationClaimUnauthenticatedResponse {
  status: 'UNAUTHENTICATED'
}

export interface ActivationClaimErrorResponse {
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

export interface ActivationClaimHandlerDeps {
  createClient: typeof createServiceRoleClientFromEnv
  getTargetAsin: () => string
  getAuthenticatedUser: typeof getAuthenticatedUserFromRequest
  resolveContextWithOrderId: typeof resolveActivationContextWithOrderId
  verifyEligibility: typeof verifyActivationEligibility
  claimEntitlement: typeof claimActivationEntitlement
  fetchEntitlement: typeof fetchEntitlementByOrderId
}

const defaultDeps: ActivationClaimHandlerDeps = {
  createClient: createServiceRoleClientFromEnv,
  getTargetAsin: () => getActivationTargetAsin(),
  getAuthenticatedUser: getAuthenticatedUserFromRequest,
  resolveContextWithOrderId: resolveActivationContextWithOrderId,
  verifyEligibility: verifyActivationEligibility,
  claimEntitlement: claimActivationEntitlement,
  fetchEntitlement: fetchEntitlementByOrderId,
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

function isEligibleForClaim(status: string): boolean {
  return status === 'ELIGIBLE'
}

export async function handleActivationClaim(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: ActivationClaimHandlerDeps = defaultDeps,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

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
    res.status(200).json({ status: 'NO_CONTEXT' })
    return
  }

  try {
    const supabaseClient = deps.createClient()
    const contextResolution = await deps.resolveContextWithOrderId({
      supabaseClient,
      token: contextToken,
    })

    if (contextResolution.status === 'NONE') {
      res.status(200).json({ status: 'NO_CONTEXT' })
      return
    }

    if (contextResolution.status === 'EXPIRED') {
      res.status(200).json({ status: 'CONTEXT_EXPIRED' })
      return
    }

    const claimResult = await performActivationClaim({
      authenticatedUser,
      amazonOrderId: contextResolution.amazonOrderId,
      deps,
      supabaseClient,
    })

    if (claimResult === 'SUCCESS') {
      res.status(200).json({ status: 'SUCCESS' })
      return
    }

    if (claimResult === 'ALREADY_CLAIMED') {
      res.status(200).json({ status: 'ALREADY_CLAIMED' })
      return
    }

    res.status(200).json({ status: 'NOT_ELIGIBLE' })
  } catch (error) {
    if (
      error instanceof ActivationVerificationError ||
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

export async function performActivationClaim(input: {
  authenticatedUser: AuthenticatedRequestUser
  amazonOrderId: string
  deps: ActivationClaimHandlerDeps
  supabaseClient: ReturnType<typeof createServiceRoleClientFromEnv>
}): Promise<'SUCCESS' | 'ALREADY_CLAIMED' | 'NOT_ELIGIBLE'> {
  const { authenticatedUser, amazonOrderId, deps, supabaseClient } = input

  const existingEntitlement = await deps.fetchEntitlement(
    supabaseClient,
    amazonOrderId,
  )

  if (existingEntitlement) {
    return resolveExistingEntitlementOwnership(
      existingEntitlement,
      authenticatedUser.id,
    )
  }

  const verification = await deps.verifyEligibility(amazonOrderId, {
    supabaseClient,
    targetAsin: deps.getTargetAsin(),
  })

  if (verification.status === 'ALREADY_CLAIMED') {
    const racedEntitlement = await deps.fetchEntitlement(
      supabaseClient,
      amazonOrderId,
    )

    if (racedEntitlement) {
      return resolveExistingEntitlementOwnership(
        racedEntitlement,
        authenticatedUser.id,
      )
    }

    return 'ALREADY_CLAIMED'
  }

  if (!isEligibleForClaim(verification.status)) {
    return 'NOT_ELIGIBLE'
  }

  const claimResult = await deps.claimEntitlement({
    supabaseClient,
    userId: authenticatedUser.id,
    amazonOrderId,
  })

  return claimResult
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  await handleActivationClaim(req, res)
}

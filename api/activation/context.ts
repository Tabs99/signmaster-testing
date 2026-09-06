import {
  isValidAmazonOrderId,
  normalizeAmazonOrderId,
} from '../../server/activation/orderIdValidation.ts'
import {
  ACTIVATION_CONTEXT_LIFETIME_SECONDS,
  buildActivationContextClearCookie,
  buildActivationContextSetCookie,
  parseActivationContextCookie,
  shouldUseSecureActivationContextCookie,
} from '../../server/activation/contextCookie.ts'
import {
  ActivationConfigError,
  getActivationTargetAsin,
} from '../../server/activation/config.ts'
import {
  ActivationVerificationError,
  verifyActivationEligibility,
} from '../../server/services/activationVerification.ts'
import {
  ActivationContextError,
  createActivationContext,
  resolveActivationContext,
} from '../../server/services/activationContextService.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'

export interface ActivationContextCreateRequestBody {
  orderId?: unknown
}

export interface ActivationContextCreateSuccessResponse {
  status: 'CREATED'
}

export interface ActivationContextResolveSuccessResponse {
  status: 'VALID' | 'EXPIRED' | 'NONE'
}

export interface ActivationContextValidationErrorResponse {
  error: 'INVALID_ORDER_ID' | 'NOT_ELIGIBLE'
}

export interface ActivationContextErrorResponse {
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

export interface ActivationContextHandlerDeps {
  createClient: typeof createServiceRoleClientFromEnv
  getTargetAsin: () => string
  verifyEligibility: typeof verifyActivationEligibility
  createContext: typeof createActivationContext
  resolveContext: typeof resolveActivationContext
  shouldUseSecureCookie: typeof shouldUseSecureActivationContextCookie
}

const defaultDeps: ActivationContextHandlerDeps = {
  createClient: createServiceRoleClientFromEnv,
  getTargetAsin: () => getActivationTargetAsin(),
  verifyEligibility: verifyActivationEligibility,
  createContext: createActivationContext,
  resolveContext: resolveActivationContext,
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

export function parseActivationContextCreateRequestBody(
  body: unknown,
): { orderId: string } | null {
  if (!body || typeof body !== 'object' || !('orderId' in body)) {
    return null
  }

  const orderId = body.orderId

  if (typeof orderId !== 'string') {
    return null
  }

  const normalized = normalizeAmazonOrderId(orderId)

  if (!isValidAmazonOrderId(normalized)) {
    return null
  }

  return { orderId: normalized }
}

export async function handleActivationContextCreate(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: ActivationContextHandlerDeps = defaultDeps,
): Promise<void> {
  const parsedBody = parseActivationContextCreateRequestBody(req.body)

  if (!parsedBody) {
    res.status(400).json({ error: 'INVALID_ORDER_ID' })
    return
  }

  try {
    const supabaseClient = deps.createClient()
    const verification = await deps.verifyEligibility(parsedBody.orderId, {
      supabaseClient,
      targetAsin: deps.getTargetAsin(),
    })

    if (verification.status !== 'ELIGIBLE') {
      res.status(400).json({ error: 'NOT_ELIGIBLE' })
      return
    }

    const created = await deps.createContext(parsedBody.orderId, {
      supabaseClient,
    })

    const secure = deps.shouldUseSecureCookie()
    res.setHeader(
      'Set-Cookie',
      buildActivationContextSetCookie(created.token, {
        secure,
        maxAgeSeconds: ACTIVATION_CONTEXT_LIFETIME_SECONDS,
      }),
    )
    res.status(200).json({ status: 'CREATED' } satisfies ActivationContextCreateSuccessResponse)
  } catch (error) {
    if (
      error instanceof ActivationVerificationError ||
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

export async function handleActivationContextResolve(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: ActivationContextHandlerDeps = defaultDeps,
): Promise<void> {
  const token = parseActivationContextCookie(getCookieHeader(req))

  if (!token) {
    res.status(200).json({ status: 'NONE' } satisfies ActivationContextResolveSuccessResponse)
    return
  }

  try {
    const resolution = await deps.resolveContext({
      supabaseClient: deps.createClient(),
      token,
    })

    if (resolution === 'VALID') {
      const secure = deps.shouldUseSecureCookie()
      res.setHeader(
        'Set-Cookie',
        buildActivationContextSetCookie(token, {
          secure,
          maxAgeSeconds: ACTIVATION_CONTEXT_LIFETIME_SECONDS,
        }),
      )
    }

    if (resolution === 'NONE') {
      const secure = deps.shouldUseSecureCookie()
      res.setHeader('Set-Cookie', buildActivationContextClearCookie({ secure }))
    }

    res.status(200).json({ status: resolution } satisfies ActivationContextResolveSuccessResponse)
  } catch (error) {
    if (error instanceof ActivationContextError || error instanceof Error) {
      res.status(500).json({ status: 'ERROR' })
      return
    }

    res.status(500).json({ status: 'ERROR' })
  }
}

export async function handleActivationContext(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: ActivationContextHandlerDeps = defaultDeps,
): Promise<void> {
  if (req.method === 'POST') {
    await handleActivationContextCreate(req, res, deps)
    return
  }

  if (req.method === 'GET') {
    await handleActivationContextResolve(req, res, deps)
    return
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  await handleActivationContext(req, res)
}

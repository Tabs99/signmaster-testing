import {
  isValidAmazonOrderId,
  normalizeAmazonOrderId,
} from '../../server/activation/orderIdValidation.ts'
import { getSpApiConfig } from '../../server/amazon/spApiConfig.ts'
import {
  ActivationVerificationError,
  verifyActivationEligibility,
} from '../../server/services/activationVerification.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'

export interface ActivationVerifyRequestBody {
  orderId?: unknown
}

export interface ActivationVerifySuccessResponse {
  status: string
}

export interface ActivationVerifyValidationErrorResponse {
  error: 'INVALID_ORDER_ID'
}

export interface ActivationVerifyErrorResponse {
  status: 'ERROR'
}

export interface VercelLikeRequest {
  method?: string
  body?: unknown
}

export interface VercelLikeResponse {
  setHeader(name: string, value: string): void
  status(code: number): VercelLikeResponse
  json(body: unknown): void
}

export interface ActivationVerifyHandlerDeps {
  createClient: typeof createServiceRoleClientFromEnv
  getTargetAsin: () => string
  verifyEligibility: typeof verifyActivationEligibility
}

const defaultDeps: ActivationVerifyHandlerDeps = {
  createClient: createServiceRoleClientFromEnv,
  getTargetAsin: () => getSpApiConfig().targetAsin,
  verifyEligibility: verifyActivationEligibility,
}

export function parseActivationVerifyRequestBody(
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

export async function handleActivationVerify(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: ActivationVerifyHandlerDeps = defaultDeps,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  const parsedBody = parseActivationVerifyRequestBody(req.body)

  if (!parsedBody) {
    res.status(400).json({ error: 'INVALID_ORDER_ID' })
    return
  }

  try {
    const result = await deps.verifyEligibility(parsedBody.orderId, {
      supabaseClient: deps.createClient(),
      targetAsin: deps.getTargetAsin(),
    })

    res.status(200).json({ status: result.status })
  } catch (error) {
    if (
      error instanceof ActivationVerificationError ||
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
  await handleActivationVerify(req, res)
}

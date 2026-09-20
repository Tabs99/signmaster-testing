import {
  isValidAmazonOrderId,
  normalizeAmazonOrderId,
} from '../../server/activation/orderIdValidation.ts'
import {
  ActivationConfigError,
  getActivationTargetAsin,
} from '../../server/activation/config.ts'
import { getActivationVerifyClientIp } from '../../server/activation/verifyClientIp.ts'
import {
  buildActivationVerifyIpBucketKey,
  buildActivationVerifyOrderBucketKey,
} from '../../server/activation/verifyRateLimitBuckets.ts'
import { isActivationVerifyBodyTooLarge } from '../../server/activation/verifyRequestLimits.ts'
import {
  ActivationVerificationError,
  verifyActivationEligibility,
} from '../../server/services/activationVerification.ts'
import {
  ActivationVerifyRateLimitError,
  checkAndRecordActivationVerifyAttempt,
} from '../../server/services/activationVerifyRateLimit.ts'
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

export interface ActivationVerifyPayloadTooLargeResponse {
  error: 'REQUEST_TOO_LARGE'
}

export interface ActivationVerifyRateLimitedResponse {
  error: 'RATE_LIMITED'
}

export interface ActivationVerifyErrorResponse {
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

export interface ActivationVerifyHandlerDeps {
  createClient: typeof createServiceRoleClientFromEnv
  getTargetAsin: () => string
  verifyEligibility: typeof verifyActivationEligibility
  checkRateLimit: typeof checkAndRecordActivationVerifyAttempt
  getClientIp: typeof getActivationVerifyClientIp
}

const defaultDeps: ActivationVerifyHandlerDeps = {
  createClient: createServiceRoleClientFromEnv,
  getTargetAsin: () => getActivationTargetAsin(),
  verifyEligibility: verifyActivationEligibility,
  checkRateLimit: checkAndRecordActivationVerifyAttempt,
  getClientIp: getActivationVerifyClientIp,
}

export function parseActivationVerifyRequestBody(
  body: unknown,
): { orderId: string } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }

  const record = body as Record<string, unknown>
  const keys = Object.keys(record)

  if (keys.length !== 1 || keys[0] !== 'orderId') {
    return null
  }

  const orderId = record.orderId

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

  if (isActivationVerifyBodyTooLarge(req.headers, req.body)) {
    res.status(413).json({ error: 'REQUEST_TOO_LARGE' })
    return
  }

  const parsedBody = parseActivationVerifyRequestBody(req.body)
  const clientIp = deps.getClientIp(req.headers)
  const ipBucketKey = buildActivationVerifyIpBucketKey(clientIp)
  const orderBucketKey = parsedBody
    ? buildActivationVerifyOrderBucketKey(parsedBody.orderId)
    : null

  try {
    const rateLimit = await deps.checkRateLimit({
      supabaseClient: deps.createClient(),
      ipBucketKey,
      orderBucketKey,
    })

    if (!rateLimit.allowed) {
      if (rateLimit.retryAfterSeconds !== null) {
        res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
      }
      res.status(429).json({ error: 'RATE_LIMITED' })
      return
    }
  } catch (error) {
    if (error instanceof ActivationVerifyRateLimitError) {
      res.status(503).json({ status: 'ERROR' })
      return
    }

    res.status(503).json({ status: 'ERROR' })
    return
  }

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
  await handleActivationVerify(req, res)
}

import {
  getProgressSummary,
  type ProgressSummary,
} from '../../server/services/quizService.ts'
import { createSupabaseQuizStore } from '../../server/services/quizStore.ts'
import {
  defaultQuizAccessDeps,
  requireQuizAccess,
  type QuizAccessDeps,
} from '../../server/services/quizAccess.ts'
import type { VercelLikeRequest, VercelLikeResponse } from '../../server/http/vercel.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'

/**
 * GET /api/progress/me — everything the dashboard shows about one learner.
 *
 * Security boundary:
 * - Bearer token only; the user id comes from the verified token.
 * - An active entitlement is required, so the dashboard cannot be used to read
 *   progress for an account whose access has been revoked.
 * - The response carries counts and a streak. No order id, no entitlement id,
 *   no user id, no timestamps.
 */

export interface ProgressSuccessResponse extends ProgressSummary {
  status: 'OK'
}

export interface ProgressRefusedResponse {
  status: 'UNAUTHENTICATED' | 'NOT_ENTITLED' | 'ERROR'
}

export interface ProgressHandlerDeps {
  access: QuizAccessDeps
  createStore: () => ReturnType<typeof createSupabaseQuizStore>
}

const defaultDeps: ProgressHandlerDeps = {
  access: defaultQuizAccessDeps,
  createStore: () => createSupabaseQuizStore(createServiceRoleClientFromEnv()),
}

export async function handleProgressMe(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: ProgressHandlerDeps = defaultDeps,
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  try {
    const user = await requireQuizAccess(req.headers, res, deps.access)

    if (!user) {
      return
    }

    const summary = await getProgressSummary(user.id, {
      store: deps.createStore(),
    })

    res.status(200).json({ status: 'OK', ...summary } satisfies ProgressSuccessResponse)
  } catch {
    res.status(500).json({ status: 'ERROR' } satisfies ProgressRefusedResponse)
  }
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  await handleProgressMe(req, res)
}

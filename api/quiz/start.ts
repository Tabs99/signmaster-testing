import { startQuiz } from '../../server/services/quizService.ts'
import { createSupabaseQuizStore } from '../../server/services/quizStore.ts'
import {
  defaultQuizAccessDeps,
  requireQuizAccess,
  type QuizAccessDeps,
} from '../../server/services/quizAccess.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'
import type { QuizQuestion } from '../../server/quiz/questions.ts'
import type { VercelLikeRequest, VercelLikeResponse } from '../../server/http/vercel.ts'

export type { VercelLikeRequest, VercelLikeResponse }

/**
 * POST /api/quiz/start — chooses ten signs for this learner and returns the
 * questions.
 *
 * Security boundary:
 * - The browser sends a Supabase bearer token only. The user id is derived
 *   server-side from that verified token, never from the request.
 * - An active entitlement is required: the quiz is the thing the customer
 *   bought.
 * - Which signs are asked is decided here, not requested by the client, and is
 *   written down before the questions are returned so the answers can be scored
 *   against a record the client never touched.
 */

export interface QuizStartSuccessResponse {
  status: 'OK'
  quizId: string
  quizIndex: number
  questions: QuizQuestion[]
}

export interface QuizStartRefusedResponse {
  status: 'UNAUTHENTICATED' | 'NOT_ENTITLED' | 'ERROR'
}

export interface QuizStartHandlerDeps {
  access: QuizAccessDeps
  createStore: () => ReturnType<typeof createSupabaseQuizStore>
}

const defaultDeps: QuizStartHandlerDeps = {
  access: defaultQuizAccessDeps,
  createStore: () => createSupabaseQuizStore(createServiceRoleClientFromEnv()),
}

export async function handleQuizStart(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: QuizStartHandlerDeps = defaultDeps,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  try {
    const user = await requireQuizAccess(req.headers, res, deps.access)

    if (!user) {
      return
    }

    const quiz = await startQuiz(user.id, { store: deps.createStore() })

    res.status(201).json({
      status: 'OK',
      quizId: quiz.quizId,
      quizIndex: quiz.quizIndex,
      questions: quiz.questions,
    } satisfies QuizStartSuccessResponse)
  } catch {
    // The real reason is worth logging but never worth showing: it would
    // describe the database to anyone who can reach the endpoint.
    res.status(500).json({ status: 'ERROR' } satisfies QuizStartRefusedResponse)
  }
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  await handleQuizStart(req, res)
}

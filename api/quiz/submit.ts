import {
  QuizServiceError,
  submitQuiz,
  type QuestionOutcome,
} from '../../server/services/quizService.ts'
import { createSupabaseQuizStore } from '../../server/services/quizStore.ts'
import {
  defaultQuizAccessDeps,
  requireQuizAccess,
  type QuizAccessDeps,
} from '../../server/services/quizAccess.ts'
import type { VercelLikeRequest, VercelLikeResponse } from '../../server/http/vercel.ts'
import {
  isQuizSubmitBodyTooLarge,
  parseQuizSubmitBody,
} from '../../server/quiz/submitRequest.ts'
import { createServiceRoleClientFromEnv } from '../../server/supabase/client.ts'

/**
 * POST /api/quiz/submit — scores a quiz and updates what the learner knows.
 *
 * Security boundary:
 * - Bearer token only; the user id comes from the verified token.
 * - An active entitlement is required.
 * - The submission says which option was chosen for each question. It cannot
 *   say whether that was right: the server rebuilds the quiz from its own
 *   record and decides. A quiz belonging to another learner, or one already
 *   submitted, is refused.
 */

export interface QuizSubmitSuccessResponse {
  status: 'OK'
  quizId: string
  score: number
  totalQuestions: number
  outcomes: QuestionOutcome[]
}

export interface QuizSubmitRefusedResponse {
  status:
    | 'UNAUTHENTICATED'
    | 'NOT_ENTITLED'
    | 'NOT_FOUND'
    | 'ALREADY_COMPLETED'
    | 'INVALID_SUBMISSION'
    | 'ERROR'
}

export interface QuizSubmitHandlerDeps {
  access: QuizAccessDeps
  createStore: () => ReturnType<typeof createSupabaseQuizStore>
}

const defaultDeps: QuizSubmitHandlerDeps = {
  access: defaultQuizAccessDeps,
  createStore: () => createSupabaseQuizStore(createServiceRoleClientFromEnv()),
}

export async function handleQuizSubmit(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
  deps: QuizSubmitHandlerDeps = defaultDeps,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  if (isQuizSubmitBodyTooLarge(req.headers, req.body)) {
    res.status(413).json({ error: 'REQUEST_TOO_LARGE' })
    return
  }

  const submission = parseQuizSubmitBody(req.body)

  if (!submission) {
    res
      .status(400)
      .json({ status: 'INVALID_SUBMISSION' } satisfies QuizSubmitRefusedResponse)
    return
  }

  try {
    const user = await requireQuizAccess(req.headers, res, deps.access)

    if (!user) {
      return
    }

    const result = await submitQuiz(
      user.id,
      submission.quizId,
      submission.answers,
      { store: deps.createStore() },
    )

    res.status(200).json({
      status: 'OK',
      quizId: result.quizId,
      score: result.score,
      totalQuestions: result.totalQuestions,
      outcomes: result.outcomes,
    } satisfies QuizSubmitSuccessResponse)
  } catch (error) {
    if (error instanceof QuizServiceError) {
      if (error.reason === 'not_found') {
        // Deliberately the same answer whether the quiz does not exist or
        // belongs to someone else: the difference is not the caller's business.
        res
          .status(404)
          .json({ status: 'NOT_FOUND' } satisfies QuizSubmitRefusedResponse)
        return
      }

      if (error.reason === 'already_completed') {
        res
          .status(409)
          .json({ status: 'ALREADY_COMPLETED' } satisfies QuizSubmitRefusedResponse)
        return
      }

      res
        .status(400)
        .json({ status: 'INVALID_SUBMISSION' } satisfies QuizSubmitRefusedResponse)
      return
    }

    res.status(500).json({ status: 'ERROR' } satisfies QuizSubmitRefusedResponse)
  }
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  await handleQuizSubmit(req, res)
}

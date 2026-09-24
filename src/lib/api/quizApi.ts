import {
  authorizedFetch,
  isRecord,
  readResponseBody,
  type AuthorizedRequestOptions,
} from './authorizedRequest'

/**
 * Client for the quiz endpoints.
 *
 * The browser sends its Supabase bearer token and nothing else; the server
 * derives who is asking. Every failure collapses into a small set of categories
 * the UI knows how to show, so no database or network detail reaches a screen.
 */

export const QUIZ_START_PATH = '/api/quiz/start'
export const QUIZ_SUBMIT_PATH = '/api/quiz/submit'

export interface QuizQuestion {
  signId: string
  index: number
  prompt: string
  /** Artwork filenames under `/signs/`. More than one is a merged sign. */
  images: string[]
  options: string[]
  correctOptionIndex: number
  /** The full meaning, shown after answering. */
  meaning: string
}

export interface QuizSession {
  quizId: string
  quizIndex: number
  questions: QuizQuestion[]
}

export interface QuestionOutcome {
  signId: string
  questionIndex: number
  images: string[]
  chosenOptionIndex: number | null
  correctOptionIndex: number
  isCorrect: boolean
  chosenAnswer: string | null
  correctAnswer: string
  meaning: string
}

export interface QuizResult {
  quizId: string
  score: number
  totalQuestions: number
  outcomes: QuestionOutcome[]
}

export interface SubmittedAnswer {
  questionIndex: number
  chosenOptionIndex: number | null
}

/**
 * `unauthenticated` and `not_entitled` are definitive answers that the caller
 * should route on. `service_unavailable` and `connection_error` are transient
 * and must be shown as "try again", never as a lost quiz.
 */
export type QuizStartResult =
  | { kind: 'started'; session: QuizSession }
  | { kind: 'unauthenticated' }
  | { kind: 'not_entitled' }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export type QuizSubmitResult =
  | { kind: 'scored'; result: QuizResult }
  | { kind: 'unauthenticated' }
  | { kind: 'not_entitled' }
  | { kind: 'already_completed' }
  | { kind: 'not_found' }
  | { kind: 'service_unavailable' }
  | { kind: 'connection_error' }

export type QuizRequestOptions = AuthorizedRequestOptions

function isQuestion(value: unknown): value is QuizQuestion {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.signId === 'string' &&
    typeof value.index === 'number' &&
    typeof value.prompt === 'string' &&
    Array.isArray(value.images) &&
    value.images.every((image) => typeof image === 'string') &&
    Array.isArray(value.options) &&
    value.options.length === 4 &&
    value.options.every((option) => typeof option === 'string') &&
    typeof value.correctOptionIndex === 'number' &&
    typeof value.meaning === 'string'
  )
}

function isOutcome(value: unknown): value is QuestionOutcome {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.signId === 'string' &&
    typeof value.questionIndex === 'number' &&
    Array.isArray(value.images) &&
    typeof value.correctOptionIndex === 'number' &&
    typeof value.isCorrect === 'boolean' &&
    typeof value.correctAnswer === 'string' &&
    typeof value.meaning === 'string'
  )
}

export async function startQuiz(
  options: QuizRequestOptions = {},
): Promise<QuizStartResult> {
  try {
    const response = await authorizedFetch(QUIZ_START_PATH, { method: 'POST' }, options)

    if (!response) {
      return { kind: 'unauthenticated' }
    }

    if (response.status === 401) {
      return { kind: 'unauthenticated' }
    }

    if (response.status === 403) {
      return { kind: 'not_entitled' }
    }

    if (!response.ok) {
      return { kind: 'service_unavailable' }
    }

    const body = await readResponseBody(response)

    if (
      isRecord(body) &&
      body.status === 'OK' &&
      typeof body.quizId === 'string' &&
      typeof body.quizIndex === 'number' &&
      Array.isArray(body.questions) &&
      body.questions.length > 0 &&
      body.questions.every(isQuestion)
    ) {
      return {
        kind: 'started',
        session: {
          quizId: body.quizId,
          quizIndex: body.quizIndex,
          questions: body.questions,
        },
      }
    }

    // A malformed payload must never be shown as a quiz: a question with no
    // options is worse than an error screen.
    return { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  }
}

export async function submitQuiz(
  quizId: string,
  answers: readonly SubmittedAnswer[],
  options: QuizRequestOptions = {},
): Promise<QuizSubmitResult> {
  try {
    const response = await authorizedFetch(
      QUIZ_SUBMIT_PATH,
      { method: 'POST', body: { quizId, answers } },
      options,
    )

    if (!response) {
      return { kind: 'unauthenticated' }
    }

    if (response.status === 401) {
      return { kind: 'unauthenticated' }
    }

    if (response.status === 403) {
      return { kind: 'not_entitled' }
    }

    if (response.status === 404) {
      return { kind: 'not_found' }
    }

    if (response.status === 409) {
      return { kind: 'already_completed' }
    }

    if (!response.ok) {
      return { kind: 'service_unavailable' }
    }

    const body = await readResponseBody(response)

    if (
      isRecord(body) &&
      body.status === 'OK' &&
      typeof body.quizId === 'string' &&
      typeof body.score === 'number' &&
      typeof body.totalQuestions === 'number' &&
      Array.isArray(body.outcomes) &&
      body.outcomes.every(isOutcome)
    ) {
      return {
        kind: 'scored',
        result: {
          quizId: body.quizId,
          score: body.score,
          totalQuestions: body.totalQuestions,
          outcomes: body.outcomes,
        },
      }
    }

    return { kind: 'service_unavailable' }
  } catch {
    return { kind: 'connection_error' }
  }
}

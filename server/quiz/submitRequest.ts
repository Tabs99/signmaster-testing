import { parseContentLengthHeader } from '../activation/verifyRequestLimits.ts'
import { OPTIONS_PER_QUESTION } from './distractors.ts'
import { QUESTIONS_PER_QUIZ } from './selection.ts'
import type { SubmittedAnswer } from '../services/quizService.ts'

/**
 * Parsing and bounding a quiz submission.
 *
 * The body is small and completely predictable — a quiz id and up to ten
 * answers, each a question index and an option index — so it is checked against
 * that shape before anything touches the database. Rejecting an oversized or
 * malformed body here keeps a hostile request from reaching the scorer at all.
 */

/** A UUID, ten answers of two small integers each, and JSON punctuation. */
export const QUIZ_SUBMIT_MAX_BODY_BYTES = 2048

export interface ParsedQuizSubmission {
  quizId: string
  answers: SubmittedAnswer[]
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isQuizSubmitBodyTooLarge(
  headers: Record<string, string | string[] | undefined> | undefined,
  body: unknown,
): boolean {
  const contentLength = parseContentLengthHeader(headers)

  if (contentLength !== null && contentLength > QUIZ_SUBMIT_MAX_BODY_BYTES) {
    return true
  }

  if (body === undefined || body === null) {
    return false
  }

  const serialised = typeof body === 'string' ? body : JSON.stringify(body)

  return Buffer.byteLength(serialised ?? '', 'utf8') > QUIZ_SUBMIT_MAX_BODY_BYTES
}

/** Returns null for anything that is not a well-formed submission. */
export function parseQuizSubmitBody(body: unknown): ParsedQuizSubmission | null {
  const raw = typeof body === 'string' ? safeJsonParse(body) : body

  if (!isRecord(raw)) {
    return null
  }

  const quizId = raw.quizId

  if (typeof quizId !== 'string' || !UUID_PATTERN.test(quizId)) {
    return null
  }

  const rawAnswers = raw.answers

  if (!Array.isArray(rawAnswers) || rawAnswers.length > QUESTIONS_PER_QUIZ) {
    return null
  }

  const answers: SubmittedAnswer[] = []

  for (const entry of rawAnswers) {
    if (!isRecord(entry)) {
      return null
    }

    const questionIndex = entry.questionIndex

    if (
      typeof questionIndex !== 'number' ||
      !Number.isInteger(questionIndex) ||
      questionIndex < 0 ||
      questionIndex >= QUESTIONS_PER_QUIZ
    ) {
      return null
    }

    const chosen = entry.chosenOptionIndex

    if (chosen === null || chosen === undefined) {
      answers.push({ questionIndex, chosenOptionIndex: null })
      continue
    }

    if (
      typeof chosen !== 'number' ||
      !Number.isInteger(chosen) ||
      chosen < 0 ||
      chosen >= OPTIONS_PER_QUESTION
    ) {
      return null
    }

    answers.push({ questionIndex, chosenOptionIndex: chosen })
  }

  return { quizId, answers }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

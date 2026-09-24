import type { SupabaseClient } from '@supabase/supabase-js'
import type { SignProgress } from '../quiz/progress.ts'

/**
 * Database access for the quiz.
 *
 * The service depends on this interface rather than on Supabase directly, so
 * the selection, scoring and progress rules can be tested against an in-memory
 * store without a database. The Supabase implementation below is the only place
 * that knows about table and column names.
 */

export class QuizStoreError extends Error {
  readonly supabaseCode?: string

  constructor(message: string, supabaseCode?: string) {
    super(message)
    this.name = 'QuizStoreError'
    this.supabaseCode = supabaseCode
  }
}

export interface QuizSessionRecord {
  id: string
  userId: string
  quizIndex: number
  signIds: string[]
  totalQuestions: number
  startedAt: string
  completedAt: string | null
  score: number | null
}

export interface NewQuizSession {
  id: string
  userId: string
  quizIndex: number
  signIds: string[]
  totalQuestions: number
}

export interface AnswerRecord {
  quizSessionId: string
  userId: string
  signId: string
  questionIndex: number
  chosenOptionIndex: number | null
  correctOptionIndex: number
  isCorrect: boolean
}

export interface QuizHistory {
  /** Completed quiz count. */
  quizzesTaken: number
  /** Highest score across completed quizzes, or null if there are none. */
  bestScore: number | null
  /**
   * Distinct UTC dates (YYYY-MM-DD) on which the learner completed a quiz,
   * most recent first. The daily streak is derived from these.
   */
  completedDates: string[]
}

export interface QuizStore {
  getSignProgress(userId: string): Promise<SignProgress[]>
  getNextQuizIndex(userId: string): Promise<number>
  /**
   * Returns false when this learner already has a session at that quiz index,
   * which is how a double-tapped start is detected rather than crashed on.
   */
  createSession(session: NewQuizSession): Promise<boolean>
  getSession(userId: string, sessionId: string): Promise<QuizSessionRecord | null>
  recordAnswers(answers: readonly AnswerRecord[]): Promise<void>
  saveSignProgress(userId: string, rows: readonly SignProgress[]): Promise<void>
  completeSession(userId: string, sessionId: string, score: number): Promise<void>
  getHistory(userId: string): Promise<QuizHistory>
}

interface SignProgressRow {
  sign_id: string
  times_seen: number
  times_correct: number
  times_incorrect: number
  streak: number
  last_quiz_index: number
  review_due_quiz_index: number | null
}

interface SessionRow {
  id: string
  user_id: string
  quiz_index: number
  sign_ids: string[]
  total_questions: number
  started_at: string
  completed_at: string | null
  score: number | null
}

const UNIQUE_VIOLATION = '23505'

function fail(message: string, error: { code?: string; message?: string }): never {
  throw new QuizStoreError(`${message}: ${error.message ?? 'unknown error'}`, error.code)
}

function toSignProgress(row: SignProgressRow): SignProgress {
  return {
    signId: row.sign_id,
    timesSeen: row.times_seen,
    timesCorrect: row.times_correct,
    timesIncorrect: row.times_incorrect,
    streak: row.streak,
    lastQuizIndex: row.last_quiz_index,
    reviewDueQuizIndex: row.review_due_quiz_index,
  }
}

function toSession(row: SessionRow): QuizSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    quizIndex: row.quiz_index,
    signIds: row.sign_ids,
    totalQuestions: row.total_questions,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    score: row.score,
  }
}

export function createSupabaseQuizStore(client: SupabaseClient): QuizStore {
  return {
    async getSignProgress(userId) {
      const { data, error } = await client
        .from('sign_progress')
        .select(
          'sign_id, times_seen, times_correct, times_incorrect, streak, last_quiz_index, review_due_quiz_index',
        )
        .eq('user_id', userId)

      if (error) {
        fail('Could not read sign progress', error)
      }

      return ((data ?? []) as SignProgressRow[]).map(toSignProgress)
    },

    async getNextQuizIndex(userId) {
      const { data, error } = await client
        .from('quiz_sessions')
        .select('quiz_index')
        .eq('user_id', userId)
        .order('quiz_index', { ascending: false })
        .limit(1)

      if (error) {
        fail('Could not read the last quiz index', error)
      }

      const rows = (data ?? []) as { quiz_index: number }[]

      return (rows[0]?.quiz_index ?? 0) + 1
    },

    async createSession(session) {
      const { error } = await client.from('quiz_sessions').insert({
        id: session.id,
        user_id: session.userId,
        quiz_index: session.quizIndex,
        sign_ids: session.signIds,
        total_questions: session.totalQuestions,
      })

      if (error) {
        // 23505 is a unique violation, which here means another start for this
        // learner claimed the same quiz index between reading it and writing.
        if (error.code === UNIQUE_VIOLATION) {
          return false
        }

        fail('Could not start the quiz', error)
      }

      return true
    },

    async getSession(userId, sessionId) {
      const { data, error } = await client
        .from('quiz_sessions')
        .select(
          'id, user_id, quiz_index, sign_ids, total_questions, started_at, completed_at, score',
        )
        .eq('id', sessionId)
        .eq('user_id', userId)
        .limit(1)

      if (error) {
        fail('Could not read the quiz', error)
      }

      const rows = (data ?? []) as SessionRow[]

      return rows[0] ? toSession(rows[0]) : null
    },

    async recordAnswers(answers) {
      if (answers.length === 0) {
        return
      }

      const { error } = await client.from('quiz_answers').insert(
        answers.map((answer) => ({
          quiz_session_id: answer.quizSessionId,
          user_id: answer.userId,
          sign_id: answer.signId,
          question_index: answer.questionIndex,
          chosen_option_index: answer.chosenOptionIndex,
          correct_option_index: answer.correctOptionIndex,
          is_correct: answer.isCorrect,
        })),
      )

      if (error) {
        fail('Could not record the answers', error)
      }
    },

    async saveSignProgress(userId, rows) {
      if (rows.length === 0) {
        return
      }

      const { error } = await client.from('sign_progress').upsert(
        rows.map((row) => ({
          user_id: userId,
          sign_id: row.signId,
          times_seen: row.timesSeen,
          times_correct: row.timesCorrect,
          times_incorrect: row.timesIncorrect,
          streak: row.streak,
          last_quiz_index: row.lastQuizIndex,
          review_due_quiz_index: row.reviewDueQuizIndex,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'user_id,sign_id' },
      )

      if (error) {
        fail('Could not save progress', error)
      }
    },

    async completeSession(userId, sessionId, score) {
      const { error } = await client
        .from('quiz_sessions')
        .update({ score, completed_at: new Date().toISOString() })
        .eq('id', sessionId)
        // Ownership is already checked before this runs; matching on it here
        // too means a mistake upstream cannot write to someone else's quiz.
        .eq('user_id', userId)

      if (error) {
        fail('Could not finish the quiz', error)
      }
    },

    async getHistory(userId) {
      const { data, error } = await client
        .from('quiz_sessions')
        .select('score, completed_at')
        .eq('user_id', userId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })

      if (error) {
        fail('Could not read quiz history', error)
      }

      const rows = (data ?? []) as { score: number; completed_at: string }[]
      const completedDates: string[] = []

      for (const row of rows) {
        const day = row.completed_at.slice(0, 10)

        if (completedDates[completedDates.length - 1] !== day) {
          completedDates.push(day)
        }
      }

      return {
        quizzesTaken: rows.length,
        bestScore: rows.length > 0 ? Math.max(...rows.map((row) => row.score)) : null,
        completedDates,
      }
    },
  }
}

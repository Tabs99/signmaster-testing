import type { SignProgress } from '../../quiz/progress.ts'
import type {
  AnswerRecord,
  NewQuizSession,
  QuizHistory,
  QuizSessionRecord,
  QuizStore,
} from '../quizStore.ts'

/**
 * An in-memory {@link QuizStore} for tests, so the selection, scoring and
 * progress rules can be exercised without a database.
 */
export interface InMemoryQuizStore extends QuizStore {
  readonly sessions: Map<string, QuizSessionRecord>
  readonly answers: AnswerRecord[]
  readonly progress: Map<string, SignProgress>
  seedProgress(rows: readonly SignProgress[]): void
}

export function createInMemoryQuizStore(options: { now?: () => Date } = {}): InMemoryQuizStore {
  const now = options.now ?? (() => new Date())
  const sessions = new Map<string, QuizSessionRecord>()
  const answers: AnswerRecord[] = []
  const progress = new Map<string, SignProgress>()

  return {
    sessions,
    answers,
    progress,

    seedProgress(rows) {
      for (const row of rows) {
        progress.set(row.signId, { ...row })
      }
    },

    async getSignProgress() {
      return [...progress.values()].map((row) => ({ ...row }))
    },

    async getNextQuizIndex(userId) {
      const indexes = [...sessions.values()]
        .filter((session) => session.userId === userId)
        .map((session) => session.quizIndex)

      return (indexes.length > 0 ? Math.max(...indexes) : 0) + 1
    },

    async createSession(session: NewQuizSession) {
      const clash = [...sessions.values()].some(
        (existing) =>
          existing.userId === session.userId &&
          existing.quizIndex === session.quizIndex,
      )

      if (clash) {
        return false
      }

      sessions.set(session.id, {
        ...session,
        startedAt: now().toISOString(),
        completedAt: null,
        score: null,
      })

      return true
    },

    async getSession(userId, sessionId) {
      const session = sessions.get(sessionId)

      if (!session || session.userId !== userId) {
        return null
      }

      return { ...session }
    },

    async recordAnswers(records) {
      answers.push(...records.map((record) => ({ ...record })))
    },

    async saveSignProgress(_userId, rows) {
      for (const row of rows) {
        progress.set(row.signId, { ...row })
      }
    },

    async completeSession(userId, sessionId, score) {
      const session = sessions.get(sessionId)

      if (!session || session.userId !== userId) {
        throw new Error(`No session ${sessionId} for ${userId}`)
      }

      sessions.set(sessionId, {
        ...session,
        score,
        completedAt: now().toISOString(),
      })
    },

    async getHistory(userId): Promise<QuizHistory> {
      const completed = [...sessions.values()]
        .filter(
          (session) => session.userId === userId && session.completedAt !== null,
        )
        .sort((left, right) =>
          (right.completedAt ?? '').localeCompare(left.completedAt ?? ''),
        )

      const completedDates: string[] = []

      for (const session of completed) {
        const day = (session.completedAt ?? '').slice(0, 10)

        if (completedDates[completedDates.length - 1] !== day) {
          completedDates.push(day)
        }
      }

      return {
        quizzesTaken: completed.length,
        bestScore:
          completed.length > 0
            ? Math.max(...completed.map((session) => session.score ?? 0))
            : null,
        completedDates,
      }
    },
  }
}

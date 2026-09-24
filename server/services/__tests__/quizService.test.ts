import { describe, expect, it } from 'vitest'
import { loadSigns } from '../../content/signs.ts'
import { QUESTIONS_PER_QUIZ } from '../../quiz/selection.ts'
import { MASTERED_STREAK } from '../../quiz/progress.ts'
import {
  QuizServiceError,
  getProgressSummary,
  startQuiz,
  submitQuiz,
  type QuizServiceDeps,
  type SubmittedAnswer,
} from '../quizService.ts'
import { createInMemoryQuizStore } from './inMemoryQuizStore.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '22222222-2222-4222-8222-222222222222'
const deck = loadSigns()

function makeDeps(options: { now?: Date } = {}): QuizServiceDeps & {
  store: ReturnType<typeof createInMemoryQuizStore>
} {
  let counter = 0
  const now = options.now ?? new Date('2026-09-22T10:00:00.000Z')
  const store = createInMemoryQuizStore({ now: () => now })

  return {
    store,
    now: () => now,
    newId: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`,
  }
}

/** Answers every question, correct where `isCorrect` says so. */
function answersFor(
  questions: readonly { index: number; correctOptionIndex: number }[],
  isCorrect: (index: number) => boolean,
): SubmittedAnswer[] {
  return questions.map((question) => ({
    questionIndex: question.index,
    chosenOptionIndex: isCorrect(question.index)
      ? question.correctOptionIndex
      : (question.correctOptionIndex + 1) % 4,
  }))
}

describe('startQuiz', () => {
  it('hands back ten answerable questions', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    expect(quiz.quizIndex).toBe(1)
    expect(quiz.questions).toHaveLength(QUESTIONS_PER_QUIZ)

    for (const question of quiz.questions) {
      expect(question.options).toHaveLength(4)
      expect(question.options[question.correctOptionIndex]).toBeTruthy()
      expect(question.images.length).toBeGreaterThan(0)
      expect(question.meaning.length).toBeGreaterThan(0)
      expect(question.prompt).toBe('What does this road sign mean?')
    }
  })

  it('records what it asked before the learner answers', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)
    const session = deps.store.sessions.get(quiz.quizId)

    expect(session?.signIds).toEqual(quiz.questions.map((q) => q.signId))
    expect(session?.completedAt).toBeNull()
    expect(session?.score).toBeNull()
  })

  it('counts up a quiz index per learner', async () => {
    const deps = makeDeps()

    await startQuiz(USER, deps)
    await startQuiz(OTHER_USER, deps)

    expect((await startQuiz(USER, deps)).quizIndex).toBe(2)
    expect((await startQuiz(OTHER_USER, deps)).quizIndex).toBe(2)
  })

  it('claims a different quiz index when two starts race', async () => {
    const deps = makeDeps()

    // Model the double-tap: the first start has written its session by the time
    // the second one tries to insert at the same index.
    const realCreate = deps.store.createSession.bind(deps.store)
    let firstAttempt = true

    deps.store.createSession = async (session) => {
      if (firstAttempt) {
        firstAttempt = false
        await realCreate({ ...session, id: `${session.id}-rival` })
        return realCreate(session)
      }

      return realCreate(session)
    }

    const quiz = await startQuiz(USER, deps)

    expect(quiz.quizIndex).toBe(2)
    expect(quiz.questions).toHaveLength(QUESTIONS_PER_QUIZ)
  })

  it('gives up rather than looping when the index never frees up', async () => {
    const deps = makeDeps()

    deps.store.createSession = async () => false

    await expect(startQuiz(USER, deps)).rejects.toMatchObject({
      reason: 'start_failed',
    })
  })

  it('never asks the same sign twice in one quiz', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)
    const signIds = quiz.questions.map((question) => question.signId)

    expect(new Set(signIds).size).toBe(signIds.length)
  })
})

describe('submitQuiz', () => {
  it('scores from the choices, not from anything the client claims', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)
    const result = await submitQuiz(
      USER,
      quiz.quizId,
      answersFor(quiz.questions, (index) => index < 7),
      deps,
    )

    expect(result.score).toBe(7)
    expect(result.totalQuestions).toBe(QUESTIONS_PER_QUIZ)
    expect(result.outcomes.filter((outcome) => outcome.isCorrect)).toHaveLength(7)
  })

  it('rebuilds the same options it served', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)
    const result = await submitQuiz(
      USER,
      quiz.quizId,
      answersFor(quiz.questions, () => true),
      deps,
    )

    for (const outcome of result.outcomes) {
      const question = quiz.questions[outcome.questionIndex]

      expect(outcome.correctOptionIndex).toBe(question.correctOptionIndex)
      expect(outcome.correctAnswer).toBe(
        question.options[question.correctOptionIndex],
      )
    }
  })

  it('treats an unanswered question as wrong without crediting a choice', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)
    const result = await submitQuiz(
      USER,
      quiz.quizId,
      [{ questionIndex: 0, chosenOptionIndex: null }],
      deps,
    )

    expect(result.score).toBe(0)
    expect(result.outcomes[0].chosenAnswer).toBeNull()
    expect(result.outcomes[0].isCorrect).toBe(false)
  })

  it('scores questions the client left out of the submission', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)
    const result = await submitQuiz(
      USER,
      quiz.quizId,
      answersFor(quiz.questions.slice(0, 3), () => true),
      deps,
    )

    expect(result.outcomes).toHaveLength(QUESTIONS_PER_QUIZ)
    expect(result.score).toBe(3)
  })

  it('returns the full meaning alongside the shortened option', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)
    const result = await submitQuiz(USER, quiz.quizId, [], deps)

    for (const outcome of result.outcomes) {
      const sign = deck.find((candidate) => candidate.id === outcome.signId)

      expect(outcome.meaning).toBe(sign?.meaning)
    }
  })

  it('refuses a quiz that belongs to someone else', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    await expect(submitQuiz(OTHER_USER, quiz.quizId, [], deps)).rejects.toThrow(
      QuizServiceError,
    )
  })

  it('refuses a quiz that has already been submitted', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    await submitQuiz(USER, quiz.quizId, [], deps)

    await expect(submitQuiz(USER, quiz.quizId, [], deps)).rejects.toMatchObject({
      reason: 'already_completed',
    })
  })

  it('refuses a question index that is not in the quiz', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    await expect(
      submitQuiz(USER, quiz.quizId, [{ questionIndex: 99, chosenOptionIndex: 0 }], deps),
    ).rejects.toMatchObject({ reason: 'invalid_submission' })
  })

  it('refuses an option index that is not on offer', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    await expect(
      submitQuiz(USER, quiz.quizId, [{ questionIndex: 0, chosenOptionIndex: 9 }], deps),
    ).rejects.toMatchObject({ reason: 'invalid_submission' })
  })

  it('refuses the same question answered twice', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    await expect(
      submitQuiz(
        USER,
        quiz.quizId,
        [
          { questionIndex: 0, chosenOptionIndex: 0 },
          { questionIndex: 0, chosenOptionIndex: 1 },
        ],
        deps,
      ),
    ).rejects.toMatchObject({ reason: 'invalid_submission' })
  })
})

describe('what a submitted quiz changes', () => {
  it('records one answer row per question', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    await submitQuiz(USER, quiz.quizId, answersFor(quiz.questions, () => true), deps)

    expect(deps.store.answers).toHaveLength(QUESTIONS_PER_QUIZ)
    expect(deps.store.answers.every((row) => row.userId === USER)).toBe(true)
  })

  it('builds a streak of correct answers and clears the review flag', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    await submitQuiz(USER, quiz.quizId, answersFor(quiz.questions, () => true), deps)

    const signId = quiz.questions[0].signId
    const row = deps.store.progress.get(signId)

    expect(row).toMatchObject({
      timesSeen: 1,
      timesCorrect: 1,
      timesIncorrect: 0,
      streak: 1,
      lastQuizIndex: 1,
      reviewDueQuizIndex: null,
    })
  })

  it('resets the streak and schedules a revisit after a wrong answer', async () => {
    const deps = makeDeps()
    const first = await startQuiz(USER, deps)

    await submitQuiz(USER, first.quizId, answersFor(first.questions, () => true), deps)

    const second = await startQuiz(USER, deps)
    const missed = second.questions[0].signId

    await submitQuiz(
      USER,
      second.quizId,
      answersFor(second.questions, (index) => index !== 0),
      deps,
    )

    const row = deps.store.progress.get(missed)

    expect(row?.streak).toBe(0)
    expect(row?.timesIncorrect).toBe(1)
    expect(row?.reviewDueQuizIndex).toBeGreaterThan(2)
    expect(row?.reviewDueQuizIndex).toBeLessThanOrEqual(4)
  })

  it('marks the quiz finished with its score', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    await submitQuiz(
      USER,
      quiz.quizId,
      answersFor(quiz.questions, (index) => index < 4),
      deps,
    )

    const session = deps.store.sessions.get(quiz.quizId)

    expect(session?.score).toBe(4)
    expect(session?.completedAt).not.toBeNull()
  })
})

describe('getProgressSummary', () => {
  it('reports an untouched account as all zeroes', async () => {
    const deps = makeDeps()
    const summary = await getProgressSummary(USER, deps)

    expect(summary).toEqual({
      totalLearned: 0,
      deckSize: deck.length,
      dailyStreak: 0,
      needReviewToday: 0,
      states: { needs_practice: 0, getting_better: 0, mastered: 0 },
      quizzesTaken: 0,
      bestScore: null,
    })
  })

  it('counts learned signs, the best score and the streak after one quiz', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)

    await submitQuiz(
      USER,
      quiz.quizId,
      answersFor(quiz.questions, (index) => index < 8),
      deps,
    )

    const summary = await getProgressSummary(USER, deps)

    expect(summary.totalLearned).toBe(8)
    expect(summary.quizzesTaken).toBe(1)
    expect(summary.bestScore).toBe(8)
    expect(summary.dailyStreak).toBe(1)
    expect(summary.needReviewToday).toBe(2)
    expect(summary.states.getting_better).toBe(8)
    expect(summary.states.needs_practice).toBe(2)
  })

  it('sorts signs into the three dashboard states by how they are going', async () => {
    const deps = makeDeps()

    deps.store.seedProgress([
      {
        signId: deck[0].id,
        timesSeen: MASTERED_STREAK,
        timesCorrect: MASTERED_STREAK,
        timesIncorrect: 0,
        streak: MASTERED_STREAK,
        lastQuizIndex: 3,
        reviewDueQuizIndex: null,
      },
      {
        signId: deck[1].id,
        timesSeen: 1,
        timesCorrect: 1,
        timesIncorrect: 0,
        streak: 1,
        lastQuizIndex: 1,
        reviewDueQuizIndex: null,
      },
      {
        signId: deck[2].id,
        timesSeen: 2,
        timesCorrect: 1,
        timesIncorrect: 1,
        streak: 0,
        lastQuizIndex: 2,
        reviewDueQuizIndex: 3,
      },
    ])

    const summary = await getProgressSummary(USER, deps)

    expect(summary.states).toEqual({
      mastered: 1,
      getting_better: 1,
      needs_practice: 1,
    })
    expect(summary.totalLearned).toBe(3)
  })

  it('drops a sign back to needs practice when it is answered wrong again', async () => {
    const deps = makeDeps()
    const quiz = await startQuiz(USER, deps)
    const signId = quiz.questions[0].signId

    deps.store.seedProgress([
      {
        signId,
        timesSeen: MASTERED_STREAK,
        timesCorrect: MASTERED_STREAK,
        timesIncorrect: 0,
        streak: MASTERED_STREAK,
        lastQuizIndex: 0,
        reviewDueQuizIndex: null,
      },
    ])

    expect((await getProgressSummary(USER, deps)).states.mastered).toBe(1)

    await submitQuiz(
      USER,
      quiz.quizId,
      answersFor(quiz.questions, (index) => index !== 0),
      deps,
    )

    const summary = await getProgressSummary(USER, deps)

    expect(summary.states.mastered).toBe(0)
    expect(deps.store.progress.get(signId)?.streak).toBe(0)
  })
})

import { randomUUID } from 'node:crypto'
import { loadSigns, type QuizSign } from '../content/signs.ts'
import {
  emptyProgress,
  learningState,
  type LearningState,
  type SignProgress,
} from '../quiz/progress.ts'
import { buildQuestions, type QuizQuestion } from '../quiz/questions.ts'
import { createRandom, seedFromString } from '../quiz/random.ts'
import {
  QUESTIONS_PER_QUIZ,
  scheduleReview,
  selectQuizSigns,
} from '../quiz/selection.ts'
import { currentStreak } from '../quiz/streak.ts'
import type { AnswerRecord, QuizStore } from './quizStore.ts'

/**
 * The quiz, end to end.
 *
 * Starting a quiz chooses the signs, writes them down, and hands back the
 * questions. Submitting scores the answers against that record and updates what
 * the app believes the learner knows.
 *
 * On what "server-authoritative" means here: the correct option is sent to the
 * browser with the question, because the design calls for instant feedback on
 * every answer and for a dropped connection mid-quiz not to lose the session.
 * What the browser cannot do is claim a result — it submits which option it
 * chose, and the server decides whether that was right by rebuilding the same
 * options from the quiz id. So progress always reflects real choices against
 * real answers, and a learner who reads the payload is only cheating
 * themselves; there is no score to win and nothing to award.
 */

export type QuizServiceErrorReason =
  | 'not_found'
  | 'already_completed'
  | 'invalid_submission'
  | 'start_failed'

export class QuizServiceError extends Error {
  readonly reason: QuizServiceErrorReason

  constructor(reason: QuizServiceErrorReason, message: string) {
    super(message)
    this.name = 'QuizServiceError'
    this.reason = reason
  }
}

export interface StartQuizResult {
  quizId: string
  quizIndex: number
  questions: QuizQuestion[]
}

export interface SubmittedAnswer {
  questionIndex: number
  /** Null when the learner left the question unanswered. */
  chosenOptionIndex: number | null
}

export interface QuestionOutcome {
  signId: string
  questionIndex: number
  images: string[]
  chosenOptionIndex: number | null
  correctOptionIndex: number
  isCorrect: boolean
  /** The option text the learner chose, absent if they chose nothing. */
  chosenAnswer: string | null
  correctAnswer: string
  meaning: string
}

export interface SubmitQuizResult {
  quizId: string
  score: number
  totalQuestions: number
  outcomes: QuestionOutcome[]
}

export interface LearningStateCounts {
  needs_practice: number
  getting_better: number
  mastered: number
}

export interface ProgressSummary {
  /** Signs the learner has answered correctly at least once. */
  totalLearned: number
  deckSize: number
  dailyStreak: number
  /** Missed signs scheduled to come back in the next quiz. */
  needReviewToday: number
  states: LearningStateCounts
  quizzesTaken: number
  bestScore: number | null
}

export interface QuizServiceDeps {
  store: QuizStore
  /** Test seam. Defaults to the full 101 sign deck. */
  deck?: readonly QuizSign[]
  /** Test seam. Defaults to `crypto.randomUUID`. */
  newId?: () => string
  /** Test seam. Defaults to the wall clock. */
  now?: () => Date
}

function resolveDeck(deps: QuizServiceDeps): readonly QuizSign[] {
  return deps.deck ?? loadSigns()
}

/**
 * Two starts in flight at once — a double tap on a slow connection — read the
 * same next quiz index and the second insert loses to the unique constraint.
 * Reading the index again and retrying resolves it; the cap is there because a
 * failure that survives a few attempts is not a race.
 */
const START_ATTEMPTS = 3

export async function startQuiz(
  userId: string,
  deps: QuizServiceDeps,
): Promise<StartQuizResult> {
  const deck = resolveDeck(deps)
  const newId = deps.newId ?? randomUUID
  const progress = await deps.store.getSignProgress(userId)

  for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
    const quizIndex = await deps.store.getNextQuizIndex(userId)
    const quizId = newId()
    const signs = selectQuizSigns({
      deck,
      progress,
      quizIndex,
      // Seeding selection from the quiz id keeps a started quiz reproducible in
      // logs and tests, and stops two quizzes started in the same millisecond
      // from choosing the same signs.
      random: createRandom(seedFromString(quizId)),
    })

    const created = await deps.store.createSession({
      id: quizId,
      userId,
      quizIndex,
      signIds: signs.map((sign) => sign.id),
      totalQuestions: signs.length,
    })

    if (created) {
      return {
        quizId,
        quizIndex,
        questions: buildQuestions(signs, deck, quizId),
      }
    }
  }

  throw new QuizServiceError(
    'start_failed',
    'Could not claim a quiz index for this learner',
  )
}

function nextProgress(
  existing: SignProgress,
  isCorrect: boolean,
  quizIndex: number,
  reviewDueQuizIndex: number,
): SignProgress {
  return {
    ...existing,
    timesSeen: existing.timesSeen + 1,
    timesCorrect: existing.timesCorrect + (isCorrect ? 1 : 0),
    timesIncorrect: existing.timesIncorrect + (isCorrect ? 0 : 1),
    // A wrong answer resets the streak, which is what moves a sign back to
    // Needs Practice on the dashboard.
    streak: isCorrect ? existing.streak + 1 : 0,
    lastQuizIndex: quizIndex,
    reviewDueQuizIndex: isCorrect ? null : reviewDueQuizIndex,
  }
}

export async function submitQuiz(
  userId: string,
  quizId: string,
  answers: readonly SubmittedAnswer[],
  deps: QuizServiceDeps,
): Promise<SubmitQuizResult> {
  const deck = resolveDeck(deps)
  const session = await deps.store.getSession(userId, quizId)

  if (!session) {
    throw new QuizServiceError('not_found', 'No such quiz for this learner')
  }

  if (session.completedAt) {
    throw new QuizServiceError(
      'already_completed',
      'This quiz has already been submitted',
    )
  }

  const signs = session.signIds.map((signId) => {
    const sign = deck.find((candidate) => candidate.id === signId)

    if (!sign) {
      throw new QuizServiceError(
        'not_found',
        `Quiz ${quizId} refers to sign ${signId}, which is not in the deck`,
      )
    }

    return sign
  })

  const questions = buildQuestions(signs, deck, quizId)
  const chosenByIndex = new Map<number, number | null>()

  for (const answer of answers) {
    if (
      !Number.isInteger(answer.questionIndex) ||
      answer.questionIndex < 0 ||
      answer.questionIndex >= questions.length
    ) {
      throw new QuizServiceError(
        'invalid_submission',
        `Question ${answer.questionIndex} is not part of this quiz`,
      )
    }

    if (chosenByIndex.has(answer.questionIndex)) {
      throw new QuizServiceError(
        'invalid_submission',
        `Question ${answer.questionIndex} was answered twice`,
      )
    }

    const chosen = answer.chosenOptionIndex

    if (
      chosen !== null &&
      (!Number.isInteger(chosen) ||
        chosen < 0 ||
        chosen >= questions[answer.questionIndex].options.length)
    ) {
      throw new QuizServiceError(
        'invalid_submission',
        `Option ${chosen} is not one of the options for question ${answer.questionIndex}`,
      )
    }

    chosenByIndex.set(answer.questionIndex, chosen)
  }

  const progressRows = new Map(
    (await deps.store.getSignProgress(userId)).map((row) => [row.signId, row]),
  )
  const reviewRandom = createRandom(seedFromString(`${quizId}:review`))

  const outcomes: QuestionOutcome[] = []
  const answerRecords: AnswerRecord[] = []
  const updatedProgress: SignProgress[] = []

  for (const question of questions) {
    const chosen = chosenByIndex.get(question.index) ?? null
    const isCorrect = chosen === question.correctOptionIndex

    outcomes.push({
      signId: question.signId,
      questionIndex: question.index,
      images: question.images,
      chosenOptionIndex: chosen,
      correctOptionIndex: question.correctOptionIndex,
      isCorrect,
      chosenAnswer: chosen === null ? null : question.options[chosen],
      correctAnswer: question.options[question.correctOptionIndex],
      meaning: question.meaning,
    })

    answerRecords.push({
      quizSessionId: quizId,
      userId,
      signId: question.signId,
      questionIndex: question.index,
      chosenOptionIndex: chosen,
      correctOptionIndex: question.correctOptionIndex,
      isCorrect,
    })

    updatedProgress.push(
      nextProgress(
        progressRows.get(question.signId) ?? emptyProgress(question.signId),
        isCorrect,
        session.quizIndex,
        scheduleReview(session.quizIndex, reviewRandom),
      ),
    )
  }

  const score = outcomes.filter((outcome) => outcome.isCorrect).length

  // Answers first: if the run fails part way, a learner has a recorded quiz
  // with no progress applied, which reads as an abandoned attempt. The reverse
  // would credit progress for a quiz with no answers behind it.
  await deps.store.recordAnswers(answerRecords)
  await deps.store.saveSignProgress(userId, updatedProgress)
  await deps.store.completeSession(userId, quizId, score)

  return {
    quizId,
    score,
    totalQuestions: questions.length,
    outcomes,
  }
}

export async function getProgressSummary(
  userId: string,
  deps: QuizServiceDeps,
): Promise<ProgressSummary> {
  const deck = resolveDeck(deps)
  const now = (deps.now ?? (() => new Date()))()
  const [progress, history, nextQuizIndex] = await Promise.all([
    deps.store.getSignProgress(userId),
    deps.store.getHistory(userId),
    deps.store.getNextQuizIndex(userId),
  ])

  const states: LearningStateCounts = {
    needs_practice: 0,
    getting_better: 0,
    mastered: 0,
  }

  let totalLearned = 0
  let needReviewToday = 0

  for (const row of progress) {
    const state: LearningState = learningState(row)
    states[state] += 1

    if (row.timesCorrect > 0) {
      totalLearned += 1
    }

    if (
      row.reviewDueQuizIndex !== null &&
      row.reviewDueQuizIndex <= nextQuizIndex
    ) {
      needReviewToday += 1
    }
  }

  return {
    totalLearned,
    deckSize: deck.length,
    dailyStreak: currentStreak(history.completedDates, now),
    needReviewToday: Math.min(needReviewToday, QUESTIONS_PER_QUIZ),
    states,
    quizzesTaken: history.quizzesTaken,
    bestScore: history.bestScore,
  }
}

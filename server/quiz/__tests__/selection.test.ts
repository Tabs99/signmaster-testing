import { describe, expect, it } from 'vitest'
import { loadSigns, type QuizSign } from '../../content/signs.ts'
import { emptyProgress, type SignProgress } from '../progress.ts'
import {
  MAX_REVIEW_QUESTIONS,
  QUESTIONS_PER_QUIZ,
  REPEAT_GAP_QUIZZES,
  scheduleReview,
  selectQuizSigns,
} from '../selection.ts'
import { createRandom } from '../random.ts'

const deck = loadSigns()

function progressFor(
  signId: string,
  overrides: Partial<SignProgress> = {},
): SignProgress {
  return { ...emptyProgress(signId), ...overrides }
}

/**
 * Plays a learner through several quizzes, answering some questions wrong, so
 * the selection rules can be checked over a whole run rather than one call.
 */
function runQuizzes(options: {
  quizCount: number
  deck?: readonly QuizSign[]
  /** Returns true when the learner answers this sign correctly. */
  answersCorrectly: (sign: QuizSign, quizIndex: number) => boolean
  seed?: number
}): { asked: QuizSign[][]; progress: Map<string, SignProgress> } {
  const activeDeck = options.deck ?? deck
  const random = createRandom(options.seed ?? 1)
  const progress = new Map<string, SignProgress>()
  const asked: QuizSign[][] = []

  for (let quizIndex = 1; quizIndex <= options.quizCount; quizIndex += 1) {
    const signs = selectQuizSigns({
      deck: activeDeck,
      progress: [...progress.values()],
      quizIndex,
      random,
    })

    asked.push(signs)

    for (const sign of signs) {
      const row = progress.get(sign.id) ?? emptyProgress(sign.id)
      const correct = options.answersCorrectly(sign, quizIndex)

      progress.set(sign.id, {
        ...row,
        timesSeen: row.timesSeen + 1,
        timesCorrect: row.timesCorrect + (correct ? 1 : 0),
        timesIncorrect: row.timesIncorrect + (correct ? 0 : 1),
        streak: correct ? row.streak + 1 : 0,
        lastQuizIndex: quizIndex,
        reviewDueQuizIndex: correct ? null : scheduleReview(quizIndex, random),
      })
    }
  }

  return { asked, progress }
}

describe('selectQuizSigns', () => {
  it('asks ten different signs', () => {
    const signs = selectQuizSigns({
      deck,
      progress: [],
      quizIndex: 1,
      random: createRandom(1),
    })

    expect(signs).toHaveLength(QUESTIONS_PER_QUIZ)
    expect(new Set(signs.map((sign) => sign.id)).size).toBe(QUESTIONS_PER_QUIZ)
  })

  it('never repeats a sign inside one quiz, over a long run', () => {
    const { asked } = runQuizzes({
      quizCount: 25,
      answersCorrectly: (_sign, quizIndex) => quizIndex % 3 !== 0,
    })

    for (const quiz of asked) {
      expect(new Set(quiz.map((sign) => sign.id)).size).toBe(quiz.length)
    }
  })

  it('starts a new learner on signs they have never seen', () => {
    const signs = selectQuizSigns({
      deck,
      progress: [],
      quizIndex: 1,
      random: createRandom(9),
    })

    expect(signs.every((sign) => deck.includes(sign))).toBe(true)
  })

  it('does not ask the same sign twice in a row when it was answered correctly', () => {
    const { asked } = runQuizzes({
      quizCount: 10,
      answersCorrectly: () => true,
    })

    for (let index = 1; index < asked.length; index += 1) {
      const previous = new Set(asked[index - 1].map((sign) => sign.id))
      const overlap = asked[index].filter((sign) => previous.has(sign.id))

      expect(overlap).toEqual([])
    }
  })

  it('walks a perfect learner through the whole deck', () => {
    const { asked } = runQuizzes({
      quizCount: Math.ceil(deck.length / QUESTIONS_PER_QUIZ),
      answersCorrectly: () => true,
    })

    const seen = new Set(asked.flat().map((sign) => sign.id))

    expect(seen.size).toBe(deck.length)
  })

  it('still covers the whole deck when the learner keeps making mistakes', () => {
    const { asked } = runQuizzes({
      quizCount: 14,
      // Misses roughly one in four.
      answersCorrectly: (sign) => sign.ordinal % 4 !== 0,
    })

    const seen = new Set(asked.flat().map((sign) => sign.id))

    expect(seen.size).toBe(deck.length)
  })
})

describe('bringing back signs the learner missed', () => {
  it('reintroduces a missed sign within the next two quizzes', () => {
    const missed = deck[0]
    const random = createRandom(4)

    const progress = [
      progressFor(missed.id, {
        timesSeen: 1,
        timesIncorrect: 1,
        lastQuizIndex: 1,
        reviewDueQuizIndex: scheduleReview(1, random),
      }),
    ]

    const quizTwo = selectQuizSigns({ deck, progress, quizIndex: 2, random })
    const quizThree = selectQuizSigns({ deck, progress, quizIndex: 3, random })

    const appears =
      quizTwo.some((sign) => sign.id === missed.id) ||
      quizThree.some((sign) => sign.id === missed.id)

    expect(appears).toBe(true)
  })

  it('spreads a bad round over more than one quiz', () => {
    const random = createRandom(2)
    const missedIds = deck.slice(0, 6).map((sign) => sign.id)
    const progress = missedIds.map((signId) =>
      progressFor(signId, {
        timesSeen: 1,
        timesIncorrect: 1,
        lastQuizIndex: 1,
        reviewDueQuizIndex: 2,
      }),
    )

    const next = selectQuizSigns({ deck, progress, quizIndex: 2, random })
    const revisited = next.filter((sign) => missedIds.includes(sign.id))

    expect(revisited.length).toBeLessThanOrEqual(MAX_REVIEW_QUESTIONS)
  })

  it('does not drop a sign that has been waiting since an earlier quiz', () => {
    const random = createRandom(6)
    const overdue = deck[50]
    const justMissed = deck.slice(0, 5)

    const progress = [
      progressFor(overdue.id, {
        timesSeen: 1,
        timesIncorrect: 1,
        lastQuizIndex: 2,
        reviewDueQuizIndex: 3,
      }),
      ...justMissed.map((sign) =>
        progressFor(sign.id, {
          timesSeen: 1,
          timesIncorrect: 1,
          lastQuizIndex: 4,
          reviewDueQuizIndex: 5,
        }),
      ),
    ]

    const next = selectQuizSigns({ deck, progress, quizIndex: 5, random })

    expect(next.map((sign) => sign.id)).toContain(overdue.id)
  })

  it('schedules a missed sign one or two quizzes ahead', () => {
    const scheduled = new Set<number>()

    for (let seed = 0; seed < 30; seed += 1) {
      scheduled.add(scheduleReview(4, createRandom(seed)))
    }

    expect([...scheduled].sort()).toEqual([5, 6])
  })
})

describe('resting signs the learner knows', () => {
  it('leaves a correctly answered sign alone for the repeat gap', () => {
    const known = deck[0]
    const random = createRandom(8)

    // Everything except one sign has just been answered correctly, so the
    // unseen pool is empty and the selection has to choose among rested signs.
    const progress = deck.map((sign) =>
      progressFor(sign.id, {
        timesSeen: 1,
        timesCorrect: 1,
        streak: 1,
        lastQuizIndex: sign.id === known.id ? 10 : 1,
      }),
    )

    const next = selectQuizSigns({ deck, progress, quizIndex: 11, random })

    expect(next.map((sign) => sign.id)).not.toContain(known.id)
  })

  it('prefers the signs the learner gets wrong most once the deck is exhausted', () => {
    const struggled = deck[20]
    const random = createRandom(12)

    const progress = deck.map((sign) =>
      progressFor(sign.id, {
        timesSeen: 3,
        timesCorrect: sign.id === struggled.id ? 0 : 3,
        timesIncorrect: sign.id === struggled.id ? 3 : 0,
        streak: sign.id === struggled.id ? 0 : 3,
        lastQuizIndex: 1,
      }),
    )

    const next = selectQuizSigns({
      deck,
      progress,
      quizIndex: 1 + REPEAT_GAP_QUIZZES,
      random,
    })

    expect(next.map((sign) => sign.id)).toContain(struggled.id)
  })
})

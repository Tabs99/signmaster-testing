import type { QuizSign } from '../content/signs.ts'
import { emptyProgress, hasBeenSeen, type SignProgress } from './progress.ts'
import { shuffle, type Random } from './random.ts'

/**
 * Choosing which ten signs a quiz asks about.
 *
 * The brief is that a quiz must not be ten random signs. It has to walk the
 * learner through all 101 while bringing back the ones they get wrong, so the
 * selection answers three questions in order:
 *
 *   1. Which missed signs are due to come back? (at most a few, so a bad round
 *      does not turn the next quiz into a re-test of it)
 *   2. Which signs has the learner never seen? (the bulk of every early quiz)
 *   3. If neither fills ten, which seen signs are the coldest?
 *
 * A sign answered correctly is not asked again until the repeat gap has passed,
 * so consecutive quizzes feel different. A sign answered incorrectly is the
 * deliberate exception: it is scheduled back within the next quiz or two.
 */

export const QUESTIONS_PER_QUIZ = 10

/**
 * The most missed signs one quiz will revisit. Three wrong answers in a round
 * should feed back gradually rather than dominating the next quiz.
 */
export const MAX_REVIEW_QUESTIONS = 3

/**
 * How many quizzes a correctly answered sign sits out for. Ten questions a
 * quiz against a deck of 101 means the learner meets the whole deck in about
 * ten quizzes, so this is roughly "not until you have been round once".
 */
export const REPEAT_GAP_QUIZZES = 9

export interface SelectionInput {
  deck: readonly QuizSign[]
  /** Existing progress rows. Signs with no row are treated as unseen. */
  progress: readonly SignProgress[]
  /** The 1-based index of the quiz being built. */
  quizIndex: number
  random: Random
}

function progressBySign(
  deck: readonly QuizSign[],
  progress: readonly SignProgress[],
): Map<string, SignProgress> {
  const rows = new Map(progress.map((row) => [row.signId, row]))

  return new Map(
    deck.map((sign) => [sign.id, rows.get(sign.id) ?? emptyProgress(sign.id)]),
  )
}

function isDueForReview(row: SignProgress, quizIndex: number): boolean {
  return row.reviewDueQuizIndex !== null && row.reviewDueQuizIndex <= quizIndex
}

/**
 * Orders the coldest seen signs first: the ones answered wrong most often,
 * then the ones not seen for longest. Used only once the deck has been walked.
 */
function coldestFirst(left: SignProgress, right: SignProgress): number {
  const leftUnresolved = left.timesIncorrect - left.timesCorrect
  const rightUnresolved = right.timesIncorrect - right.timesCorrect

  if (leftUnresolved !== rightUnresolved) {
    return rightUnresolved - leftUnresolved
  }

  return left.lastQuizIndex - right.lastQuizIndex
}

/**
 * Picks the signs for one quiz. Always returns exactly `QUESTIONS_PER_QUIZ`
 * distinct signs as long as the deck holds that many.
 */
export function selectQuizSigns(input: SelectionInput): QuizSign[] {
  const { deck, quizIndex, random } = input
  const rows = progressBySign(deck, input.progress)

  const rowFor = (sign: QuizSign): SignProgress => {
    const row = rows.get(sign.id)

    if (!row) {
      throw new Error(`No progress row built for ${sign.id}`)
    }

    return row
  }

  const chosen: QuizSign[] = []
  const taken = new Set<string>()

  const take = (candidates: readonly QuizSign[], limit: number): void => {
    for (const sign of candidates) {
      if (chosen.length >= limit || chosen.length >= QUESTIONS_PER_QUIZ) {
        return
      }

      if (taken.has(sign.id)) {
        continue
      }

      chosen.push(sign)
      taken.add(sign.id)
    }
  }

  // 1. Missed signs that are due back. Earliest due first, so a sign that has
  //    been waiting two quizzes is not passed over for one missed just now.
  const due = deck
    .filter((sign) => isDueForReview(rowFor(sign), quizIndex))
    .sort(
      (left, right) =>
        (rowFor(left).reviewDueQuizIndex ?? 0) -
        (rowFor(right).reviewDueQuizIndex ?? 0),
    )

  take(due, MAX_REVIEW_QUESTIONS)

  // 2. Signs the learner has never been asked about.
  const unseen = shuffle(
    deck.filter((sign) => !hasBeenSeen(rowFor(sign))),
    random,
  )

  take(unseen, QUESTIONS_PER_QUIZ)

  // 3. Seen signs that have sat out the repeat gap, coldest first.
  const rested = deck
    .filter((sign) => {
      const row = rowFor(sign)
      return (
        hasBeenSeen(row) && quizIndex - row.lastQuizIndex >= REPEAT_GAP_QUIZZES
      )
    })
    .sort((left, right) => coldestFirst(rowFor(left), rowFor(right)))

  take(rested, QUESTIONS_PER_QUIZ)

  // 4. Last resort. Reached only when the deck is smaller than the gap implies
  //    — an early quiz for a learner who has already been round once, or a
  //    truncated deck in a test. Still coldest first, so the choice is the best
  //    available rather than arbitrary.
  const remaining = deck
    .filter((sign) => !taken.has(sign.id))
    .sort((left, right) => coldestFirst(rowFor(left), rowFor(right)))

  take(remaining, QUESTIONS_PER_QUIZ)

  return chosen
}

/**
 * When a missed sign should come back: the next quiz or the one after, chosen
 * at random. Spreading them means three misses in one round do not all land in
 * the next quiz, which would make it feel like a punishment re-test.
 */
export function scheduleReview(quizIndex: number, random: Random): number {
  return quizIndex + 1 + Math.floor(random() * 2)
}

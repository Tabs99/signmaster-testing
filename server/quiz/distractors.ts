import type { QuizSign } from '../content/signs.ts'
import { shuffle, type Random } from './random.ts'

/**
 * Picking the three wrong answers.
 *
 * Every wrong answer is another sign's real meaning, taken from the client's
 * own mapping document. That satisfies the rule that distractors must only use
 * valid UK sign meanings by construction: nothing is invented, so nothing can
 * drift into a meaning from another country or a sign that does not exist.
 *
 * Candidates are preferred from the same category, because a meaning from an
 * unrelated category is usually eliminable from the sign's shape and colour
 * alone — that would let a learner score well without knowing the sign, which
 * is the single biggest quality risk in the feature. Categories that hold too
 * few signs to supply three fall back to the coarser group, then to the deck.
 */

export const OPTIONS_PER_QUESTION = 4
const DISTRACTORS_PER_QUESTION = OPTIONS_PER_QUESTION - 1

/** Above this, two options say close enough to the same thing to be unfair. */
const MAX_SIMILARITY = 0.75

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'may',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'with',
])

function meaningfulWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))

  return new Set(words)
}

/**
 * How much of the shorter option is contained in the longer one, by meaningful
 * word. Word overlap is a blunt measure, but it reliably catches the pairs that
 * matter here without needing to understand the sentences.
 *
 * Measuring against the shorter option rather than against both combined is
 * deliberate: the unfair case is one option saying everything the other says
 * plus a qualifier — "no waiting except for loading" against "no waiting except
 * for loading during the period shown". Scoring that against the combined
 * vocabulary would dilute it below any useful threshold precisely because the
 * longer option is longer.
 */
export function similarity(left: string, right: string): number {
  const leftWords = meaningfulWords(left)
  const rightWords = meaningfulWords(right)

  if (leftWords.size === 0 || rightWords.size === 0) {
    return leftWords.size === rightWords.size ? 1 : 0
  }

  let shared = 0

  for (const word of leftWords) {
    if (rightWords.has(word)) {
      shared += 1
    }
  }

  return shared / Math.min(leftWords.size, rightWords.size)
}

function tooAlike(candidate: string, chosen: readonly string[]): boolean {
  return chosen.some(
    (existing) =>
      existing === candidate || similarity(existing, candidate) > MAX_SIMILARITY,
  )
}

function candidatePools(
  sign: QuizSign,
  deck: readonly QuizSign[],
): QuizSign[][] {
  const others = deck.filter((candidate) => candidate.id !== sign.id)

  return [
    others.filter((candidate) => candidate.category === sign.category),
    others.filter((candidate) => candidate.group === sign.group),
    others,
  ]
}

/**
 * Three wrong answers for one sign, nearest category first. Throws only if the
 * whole deck cannot supply three options unlike the correct one, which would
 * mean the content itself is broken rather than the request.
 */
export function pickDistractors(
  sign: QuizSign,
  deck: readonly QuizSign[],
  random: Random,
): string[] {
  const chosen: string[] = []
  const blocked = [sign.answer, sign.meaning]

  for (const pool of candidatePools(sign, deck)) {
    for (const candidate of shuffle(pool, random)) {
      if (chosen.length === DISTRACTORS_PER_QUESTION) {
        return chosen
      }

      if (tooAlike(candidate.answer, [...blocked, ...chosen])) {
        continue
      }

      chosen.push(candidate.answer)
    }

    if (chosen.length === DISTRACTORS_PER_QUESTION) {
      return chosen
    }
  }

  throw new Error(
    `Sign ${sign.id} has only ${chosen.length} usable wrong answers in a deck of ${deck.length}`,
  )
}

export interface QuestionOptions {
  options: string[]
  correctIndex: number
}

/** The four options in the order the learner sees them. */
export function buildOptions(
  sign: QuizSign,
  deck: readonly QuizSign[],
  random: Random,
): QuestionOptions {
  const options = shuffle(
    [sign.answer, ...pickDistractors(sign, deck, random)],
    random,
  )

  return { options, correctIndex: options.indexOf(sign.answer) }
}

import type { QuizSign } from '../content/signs.ts'
import { buildOptions } from './distractors.ts'
import { createRandom, seedFromString } from './random.ts'

/**
 * Turning the chosen signs into the questions a learner answers.
 *
 * The options are derived from the quiz's id rather than stored, so a quiz can
 * be rebuilt exactly as it was served when the answers come back. That keeps
 * scoring honest without writing four strings per question to the database.
 *
 * Every question is generated from one random stream in question order, so the
 * rebuild must walk the same signs in the same order — which is why a session's
 * `sign_ids` are written once, at the start, and never reordered.
 */

export const QUESTION_PROMPT = 'What does this road sign mean?'

export interface QuizQuestion {
  signId: string
  /** 0-based position in the quiz. */
  index: number
  prompt: string
  /**
   * Artwork filenames under `public/signs/`. More than one is a merged sign:
   * the images are shown together and answered as a single question.
   */
  images: string[]
  options: string[]
  correctOptionIndex: number
  /**
   * The client's full description of the sign, shown after answering. The
   * correct option may be a shortened form of this, so it is sent separately
   * rather than reused from `options`.
   */
  meaning: string
}

export function buildQuestions(
  signs: readonly QuizSign[],
  deck: readonly QuizSign[],
  quizId: string,
): QuizQuestion[] {
  const random = createRandom(seedFromString(quizId))

  return signs.map((sign, index) => {
    const { options, correctIndex } = buildOptions(sign, deck, random)

    return {
      signId: sign.id,
      index,
      prompt: QUESTION_PROMPT,
      images: sign.images,
      options,
      correctOptionIndex: correctIndex,
      meaning: sign.meaning,
    }
  })
}

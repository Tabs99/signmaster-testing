import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SignCategory, SignGroup } from './signTaxonomy.ts'
import { SHORTENED_ANSWERS } from './signAnswers.ts'

/**
 * The canonical sign dataset.
 *
 * `signs.json` is generated from the client's mapping spreadsheet by
 * `server/scripts/buildSignsData.ts` and is server-side only. Correct answers
 * never ship in the browser bundle: the quiz endpoints read this file, and the
 * browser only ever receives the question it is currently being asked.
 */

/** A sign exactly as the client's spreadsheet describes it. */
export interface SignRecord {
  /** Stable id, `s` followed by the zero-padded spreadsheet sign number. */
  id: string
  /** The sign's number in the client's mapping spreadsheet, 1 to 101. */
  ordinal: number
  category: SignCategory
  group: SignGroup
  /** The client's full description. Shown after answering, never shortened. */
  meaning: string
  /**
   * Artwork filenames under `public/signs/`. More than one means the question
   * shows the images together as a single merged sign.
   */
  images: string[]
}

/** A sign with the wording it uses when it appears in an option list. */
export interface QuizSign extends SignRecord {
  /**
   * The correct answer as shown among the four options. Equal to `meaning`
   * unless the meaning is too long to read at option size, in which case it is
   * the shortened form from `signAnswers.ts`.
   */
  answer: string
}

let cachedSigns: QuizSign[] | null = null

function datasetPath(): string {
  return join(import.meta.dirname, 'signs.json')
}

export function answerFor(sign: SignRecord): string {
  return SHORTENED_ANSWERS[sign.id] ?? sign.meaning
}

export function loadSigns(): QuizSign[] {
  if (!cachedSigns) {
    const records = JSON.parse(
      readFileSync(datasetPath(), 'utf8'),
    ) as SignRecord[]

    cachedSigns = records.map((sign) => ({ ...sign, answer: answerFor(sign) }))
  }

  return cachedSigns
}

/** Test seam: forces the next `loadSigns()` to re-read from disk. */
export function resetSignCache(): void {
  cachedSigns = null
}

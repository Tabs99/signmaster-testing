import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSigns, resetSignCache } from '../signs.ts'
import { MAX_ANSWER_LENGTH, SHORTENED_ANSWERS } from '../signAnswers.ts'
import { isSignCategory } from '../signTaxonomy.ts'

const DECK_SIZE = 101
const PUBLIC_SIGNS = join(import.meta.dirname, '..', '..', '..', 'public', 'signs')

describe('the sign deck', () => {
  it('holds every sign in the client mapping file', () => {
    resetSignCache()
    const signs = loadSigns()

    expect(signs).toHaveLength(DECK_SIZE)
    expect(new Set(signs.map((sign) => sign.id)).size).toBe(DECK_SIZE)
    expect(signs.map((sign) => sign.ordinal)).toEqual(
      Array.from({ length: DECK_SIZE }, (_unused, index) => index + 1),
    )
  })

  it('gives every sign a category the taxonomy knows', () => {
    for (const sign of loadSigns()) {
      expect(isSignCategory(sign.category)).toBe(true)
    }
  })

  it('gives every sign a meaning and at least one image', () => {
    for (const sign of loadSigns()) {
      expect(sign.meaning.length).toBeGreaterThan(0)
      expect(sign.images.length).toBeGreaterThan(0)
    }
  })

  it('has the artwork on disk for every image it references', () => {
    const missing = loadSigns()
      .flatMap((sign) => sign.images)
      .filter((image) => !existsSync(join(PUBLIC_SIGNS, image)))

    expect(missing).toEqual([])
  })

  it('renders five signs as merged multi-image questions', () => {
    const merged = loadSigns().filter((sign) => sign.images.length > 1)

    expect(merged.map((sign) => sign.id)).toEqual([
      's095',
      's096',
      's097',
      's098',
      's101',
    ])
  })
})

describe('answer wording', () => {
  it('keeps every option short enough to read at option size', () => {
    const tooLong = loadSigns()
      .filter((sign) => sign.answer.length > MAX_ANSWER_LENGTH)
      .map((sign) => `${sign.id} (${sign.answer.length})`)

    expect(tooLong).toEqual([])
  })

  it('uses the client wording verbatim unless it had to be shortened', () => {
    for (const sign of loadSigns()) {
      if (sign.id in SHORTENED_ANSWERS) {
        expect(sign.answer).toBe(SHORTENED_ANSWERS[sign.id])
        expect(sign.answer.length).toBeLessThan(sign.meaning.length)
        continue
      }

      expect(sign.answer).toBe(sign.meaning)
    }
  })

  it('shortens only signs that are actually in the deck', () => {
    const ids = new Set(loadSigns().map((sign) => sign.id))
    const unknown = Object.keys(SHORTENED_ANSWERS).filter((id) => !ids.has(id))

    expect(unknown).toEqual([])
  })

  it('never gives two signs the same option text', () => {
    const answers = loadSigns().map((sign) => sign.answer)

    expect(new Set(answers).size).toBe(answers.length)
  })
})

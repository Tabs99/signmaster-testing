import { describe, expect, it } from 'vitest'
import { loadSigns, type QuizSign } from '../../content/signs.ts'
import {
  OPTIONS_PER_QUESTION,
  buildOptions,
  pickDistractors,
  similarity,
} from '../distractors.ts'
import { createRandom } from '../random.ts'

const deck = loadSigns()

function sign(id: string): QuizSign {
  const found = deck.find((candidate) => candidate.id === id)

  if (!found) {
    throw new Error(`No sign ${id} in the deck`)
  }

  return found
}

describe('similarity', () => {
  it('rates identical wording as a complete match', () => {
    expect(similarity('No entry for vehicles', 'No entry for vehicles')).toBe(1)
  })

  it('rates unrelated meanings low', () => {
    expect(
      similarity('No entry for vehicles', 'Tourist information point'),
    ).toBeLessThan(0.2)
  })

  it('rates one meaning that contains another as a complete match', () => {
    expect(
      similarity(
        'Waiting prohibited except for loading',
        'Waiting prohibited except for loading during the period shown',
      ),
    ).toBe(1)
  })

  it('leaves genuinely different meanings that share words usable', () => {
    expect(
      similarity('Stop and give way', 'Give way to traffic on the major road'),
    ).toBeLessThanOrEqual(0.75)
  })

  it('ignores punctuation and case', () => {
    expect(similarity('Stop and give way', 'STOP AND GIVE WAY.')).toBe(1)
  })
})

describe('pickDistractors', () => {
  it('returns three wrong answers for every sign in the deck', () => {
    for (const candidate of deck) {
      const distractors = pickDistractors(candidate, deck, createRandom(1))

      expect(distractors).toHaveLength(OPTIONS_PER_QUESTION - 1)
      expect(new Set(distractors).size).toBe(distractors.length)
      expect(distractors).not.toContain(candidate.answer)
      expect(distractors).not.toContain(candidate.meaning)
    }
  })

  it('holds up across many different quizzes', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      for (const candidate of deck) {
        expect(() =>
          pickDistractors(candidate, deck, createRandom(seed)),
        ).not.toThrow()
      }
    }
  })

  it('never offers a wrong answer that resembles the correct one', () => {
    for (const candidate of deck) {
      for (const distractor of pickDistractors(candidate, deck, createRandom(7))) {
        expect(similarity(candidate.answer, distractor)).toBeLessThanOrEqual(
          0.75,
        )
      }
    }
  })

  it('only ever uses meanings that belong to other signs in the deck', () => {
    const realAnswers = new Set(deck.map((candidate) => candidate.answer))

    for (const candidate of deck) {
      for (const distractor of pickDistractors(candidate, deck, createRandom(3))) {
        expect(realAnswers.has(distractor)).toBe(true)
      }
    }
  })

  it('prefers wrong answers from the same category', () => {
    // Warning Signs is the largest category, so it can always fill all three
    // from within itself. A meaning from an unrelated category would usually be
    // eliminable from the sign's shape alone.
    const sameCategory = new Set(
      deck
        .filter((candidate) => candidate.category === 'Warning Signs')
        .map((candidate) => candidate.answer),
    )

    for (const distractor of pickDistractors(
      sign('s001'),
      deck,
      createRandom(11),
    )) {
      expect(sameCategory.has(distractor)).toBe(true)
    }
  })

  it('falls back beyond the category when it holds too few signs', () => {
    // Information Signs holds exactly one sign, so all three wrong answers have
    // to come from the wider group.
    const lonely = deck.filter(
      (candidate) => candidate.category === 'Information Signs',
    )

    expect(lonely).toHaveLength(1)
    expect(pickDistractors(lonely[0], deck, createRandom(5))).toHaveLength(3)
  })
})

describe('buildOptions', () => {
  it('returns four options with the correct answer among them', () => {
    const subject = sign('s001')
    const { options, correctIndex } = buildOptions(subject, deck, createRandom(2))

    expect(options).toHaveLength(OPTIONS_PER_QUESTION)
    expect(new Set(options).size).toBe(OPTIONS_PER_QUESTION)
    expect(options[correctIndex]).toBe(subject.answer)
  })

  it('moves the correct answer around rather than favouring one slot', () => {
    const subject = sign('s001')
    const positions = new Set<number>()

    for (let seed = 0; seed < 40; seed += 1) {
      positions.add(buildOptions(subject, deck, createRandom(seed)).correctIndex)
    }

    expect(positions.size).toBe(OPTIONS_PER_QUESTION)
  })

  it('is reproducible for a given seed', () => {
    const subject = sign('s042')

    expect(buildOptions(subject, deck, createRandom(99))).toEqual(
      buildOptions(subject, deck, createRandom(99)),
    )
  })
})

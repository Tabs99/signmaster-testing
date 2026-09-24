/**
 * Seeded randomness.
 *
 * Question selection, distractor choice and option order all need to be random
 * to the learner but reproducible on the server: a quiz is generated once, and
 * the submitted answers are scored later against the same options. Seeding from
 * the quiz id means the server can rebuild a quiz exactly as it was served
 * without storing every option string.
 */

export type Random = () => number

/** Mulberry32 — small, fast, and good enough for shuffling a quiz. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Derives a 32-bit seed from a string, so a quiz id can seed the generator. */
export function seedFromString(value: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

/** Fisher-Yates. Returns a new array; the input is untouched. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1))
    const held = result[index]
    result[index] = result[swapWith]
    result[swapWith] = held
  }

  return result
}

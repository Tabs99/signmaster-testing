/**
 * Sign taxonomy used to pick plausible wrong answers.
 *
 * The client's mapping spreadsheet groups the 101 deck signs into 15
 * categories. Category is the first choice for a distractor, because meanings
 * drawn from an unrelated category are usually eliminable from the sign's shape
 * alone, which makes the question guessable without knowing the sign.
 *
 * Several categories hold fewer than four signs, so category alone cannot
 * always supply three distractors. Each category therefore also belongs to a
 * coarser group, used as the second choice before falling back to the full
 * deck.
 */

export const SIGN_CATEGORIES = [
  'Warning Signs',
  'Regulatory Signs',
  'Speed Limit Signs',
  'Low Bridge Signs',
  'Level Crossing Signs',
  'Tram Signs',
  'Bus and Cycle Signs',
  'On-street parking',
  'Traffic Calming',
  'Motorway Signs',
  'Direction and Tourist Signs',
  'Information Signs',
  'Road Works and Temporary',
  'Miscellaneous',
  'Merge Images',
] as const

export type SignCategory = (typeof SIGN_CATEGORIES)[number]

export type SignGroup = 'warning' | 'regulatory' | 'information'

const CATEGORY_GROUPS: Record<SignCategory, SignGroup | null> = {
  'Warning Signs': 'warning',
  'Level Crossing Signs': 'warning',
  'Low Bridge Signs': 'warning',
  'Tram Signs': 'warning',
  'Road Works and Temporary': 'warning',
  'Regulatory Signs': 'regulatory',
  'Speed Limit Signs': 'regulatory',
  'Bus and Cycle Signs': 'regulatory',
  'On-street parking': 'regulatory',
  'Traffic Calming': 'regulatory',
  'Motorway Signs': 'information',
  'Direction and Tourist Signs': 'information',
  'Information Signs': 'information',
  Miscellaneous: 'information',
  // Merge Images is a presentation category, not a subject one: each of its
  // seven entries is resolved individually below.
  'Merge Images': null,
}

/**
 * The seven merged entries are grouped by what the combined sign actually
 * means, keyed by the spreadsheet row's ordinal. Without this they would all
 * share one meaningless category and draw distractors from each other.
 */
const MERGED_SIGN_GROUPS: Record<number, SignGroup> = {
  95: 'information', // Countdown markers to a motorway exit
  96: 'warning', // Distance to a Give Way line ahead
  97: 'warning', // Maximum advised speed at a bend
  98: 'warning', // Pedestrians in road for the distance shown
  99: 'regulatory', // Entrance to a controlled parking zone
  100: 'regulatory', // End of a controlled parking zone
  101: 'warning', // Electrified overhead cable and its safe height
}

export function isSignCategory(value: string): value is SignCategory {
  return (SIGN_CATEGORIES as readonly string[]).includes(value)
}

export function resolveSignGroup(
  category: SignCategory,
  ordinal: number,
): SignGroup {
  const group = CATEGORY_GROUPS[category]

  if (group) {
    return group
  }

  const mergedGroup = MERGED_SIGN_GROUPS[ordinal]

  if (!mergedGroup) {
    throw new Error(
      `Sign ${ordinal} is in "${category}" but has no group assignment`,
    )
  }

  return mergedGroup
}

/**
 * What the app remembers about one learner and one sign, and how that becomes
 * the three learning states the dashboard shows.
 */

export type LearningState = 'needs_practice' | 'getting_better' | 'mastered'

export interface SignProgress {
  signId: string
  /** How many times the sign has been asked. */
  timesSeen: number
  timesCorrect: number
  timesIncorrect: number
  /** Consecutive correct answers. Any wrong answer resets this to zero. */
  streak: number
  /** The quiz this sign was last asked in. Zero means never asked. */
  lastQuizIndex: number
  /** The earliest quiz this sign should come back in, after being missed. */
  reviewDueQuizIndex: number | null
}

/**
 * Two correct answers in a row moves a sign on; three makes it mastered.
 *
 * The thresholds are deliberately low. A sign is not a skill — it is one
 * picture with one meaning — and the schedule already spaces mastered signs
 * roughly nine quizzes apart, so a sign that was learned by luck comes back and
 * loses its status soon enough.
 */
export const GETTING_BETTER_STREAK = 1
export const MASTERED_STREAK = 3

export function learningState(progress: SignProgress): LearningState {
  if (progress.streak >= MASTERED_STREAK) {
    return 'mastered'
  }

  if (progress.streak >= GETTING_BETTER_STREAK) {
    return 'getting_better'
  }

  return 'needs_practice'
}

export function emptyProgress(signId: string): SignProgress {
  return {
    signId,
    timesSeen: 0,
    timesCorrect: 0,
    timesIncorrect: 0,
    streak: 0,
    lastQuizIndex: 0,
    reviewDueQuizIndex: null,
  }
}

export function hasBeenSeen(progress: SignProgress): boolean {
  return progress.timesSeen > 0
}

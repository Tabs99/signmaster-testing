import { describe, expect, it } from 'vitest'
import { currentStreak, utcDay } from '../streak.ts'

const NOW = new Date('2026-09-22T09:30:00.000Z')

describe('utcDay', () => {
  it('reduces an instant to its calendar day', () => {
    expect(utcDay(NOW)).toBe('2026-09-22')
  })
})

describe('currentStreak', () => {
  it('is zero for a learner who has never finished a quiz', () => {
    expect(currentStreak([], NOW)).toBe(0)
  })

  it('counts today as one', () => {
    expect(currentStreak(['2026-09-22'], NOW)).toBe(1)
  })

  it('counts consecutive days back from today', () => {
    expect(
      currentStreak(['2026-09-22', '2026-09-21', '2026-09-20'], NOW),
    ).toBe(3)
  })

  it('survives a day that has not been practised yet', () => {
    // Practised last night, opened the app this morning. Nothing is broken
    // until a whole day goes by without a quiz.
    expect(currentStreak(['2026-09-21', '2026-09-20'], NOW)).toBe(2)
  })

  it('is zero once a whole day has been missed', () => {
    expect(currentStreak(['2026-09-20', '2026-09-19'], NOW)).toBe(0)
  })

  it('stops at the first gap', () => {
    expect(
      currentStreak(
        ['2026-09-22', '2026-09-21', '2026-09-19', '2026-09-18'],
        NOW,
      ),
    ).toBe(2)
  })

  it('counts a day once however many quizzes it holds', () => {
    expect(currentStreak(['2026-09-22', '2026-09-21'], NOW)).toBe(2)
  })

  it('counts across a month boundary', () => {
    expect(
      currentStreak(
        ['2026-09-01', '2026-08-31', '2026-08-30'],
        new Date('2026-09-01T23:00:00.000Z'),
      ),
    ).toBe(3)
  })
})

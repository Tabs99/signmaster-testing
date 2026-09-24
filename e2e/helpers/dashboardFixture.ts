import { test as base, type Page } from '@playwright/test'

/**
 * Every entitled path in these specs now ends on the dashboard, which asks the
 * backend for the learner's progress before it can render anything. These specs
 * are about activation, auth and routing rather than about progress, so the
 * fixture below answers that call with a first-run summary by default.
 *
 * A spec that cares about the dashboard's own behaviour registers its own route
 * first — Playwright matches the most recently added handler, so an explicit
 * `page.route('**\/api/progress/me', …)` inside a test wins over this one.
 */

export interface ProgressSummaryStub {
  totalLearned: number
  deckSize: number
  dailyStreak: number
  needReviewToday: number
  states: { needs_practice: number; getting_better: number; mastered: number }
  quizzesTaken: number
  bestScore: number | null
}

export const FIRST_RUN_PROGRESS: ProgressSummaryStub = {
  totalLearned: 0,
  deckSize: 101,
  dailyStreak: 0,
  needReviewToday: 0,
  states: { needs_practice: 0, getting_better: 0, mastered: 0 },
  quizzesTaken: 0,
  bestScore: null,
}

/**
 * A heading that appears on the dashboard in every state and nowhere else.
 * "Dashboard" itself is no good here: it is also the nav link's text, so a
 * text lookup would match two elements.
 */
export const DASHBOARD_HEADING = 'Your Learning Progress'

export async function mockProgress(
  page: Page,
  summary: ProgressSummaryStub = FIRST_RUN_PROGRESS,
): Promise<void> {
  await page.route('**/api/progress/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'OK', ...summary }),
    })
  })
}

export const test = base.extend<{ dashboardProgress: void }>({
  dashboardProgress: [
    async ({ page }, use) => {
      await mockProgress(page)
      await use()
    },
    { auto: true },
  ],
})

export { expect, type Page } from '@playwright/test'

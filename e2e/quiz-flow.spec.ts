import {
  expect,
  test,
  mockProgress,
  type Page,
} from './helpers/dashboardFixture'
import { seedConfirmedSession } from './helpers/supabaseMock'

/**
 * The learning loop end to end: dashboard, ten questions, score, review.
 *
 * The backend is mocked, so what this proves is the part the unit tests cannot
 * — that a real browser can get from the dashboard to a finished quiz without
 * the layout, the locking or the navigation getting in the way, at both a
 * desktop and a phone viewport.
 */

const LEARNER_EMAIL = 'quiz-e2e-fixture@example.invalid'
const QUIZ_ID = '00000000-0000-4000-8000-0000000000aa'
const QUESTION_COUNT = 10
const CORRECT_OPTION = 1

function question(index: number) {
  return {
    signId: `s${String(index + 1).padStart(3, '0')}`,
    index,
    prompt: 'What does this road sign mean?',
    images: ['501.jpg'],
    options: [
      `Wrong meaning ${index} A`,
      `Right meaning ${index}`,
      `Wrong meaning ${index} C`,
      `Wrong meaning ${index} D`,
    ],
    correctOptionIndex: CORRECT_OPTION,
    meaning: `The full description of sign ${index}`,
  }
}

const QUESTIONS = Array.from({ length: QUESTION_COUNT }, (_unused, index) =>
  question(index),
)

async function mockEntitlementActive(page: Page) {
  await page.route('**/api/entitlement/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ACTIVE' }),
    })
  })
}

async function mockQuizStart(page: Page) {
  await page.route('**/api/quiz/start', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'OK',
        quizId: QUIZ_ID,
        quizIndex: 1,
        questions: QUESTIONS,
      }),
    })
  })
}

interface SubmitRecorder {
  bodies: { quizId: string; answers: { questionIndex: number; chosenOptionIndex: number | null }[] }[]
}

async function mockQuizSubmit(page: Page, score: number): Promise<SubmitRecorder> {
  const recorder: SubmitRecorder = { bodies: [] }

  await page.route('**/api/quiz/submit', async (route) => {
    recorder.bodies.push(route.request().postDataJSON())

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'OK',
        quizId: QUIZ_ID,
        score,
        totalQuestions: QUESTION_COUNT,
        outcomes: QUESTIONS.map((item, index) => ({
          signId: item.signId,
          questionIndex: index,
          images: item.images,
          chosenOptionIndex: index < score ? CORRECT_OPTION : 0,
          correctOptionIndex: CORRECT_OPTION,
          isCorrect: index < score,
          chosenAnswer: item.options[index < score ? CORRECT_OPTION : 0],
          correctAnswer: item.options[CORRECT_OPTION],
          meaning: item.meaning,
        })),
      }),
    })
  })

  return recorder
}

/** Answers each question correctly and advances, ending on the results screen. */
async function answerEveryQuestion(page: Page) {
  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    await expect(page.getByTestId('quiz-counter')).toContainText(
      `Question ${index + 1} of ${QUESTION_COUNT}`,
    )

    await page.getByTestId(`answer-option-${CORRECT_OPTION}`).click()
    await page
      .getByRole('button', {
        name: index === QUESTION_COUNT - 1 ? 'Finish quiz' : 'Next question',
      })
      .click()
  }
}

test.describe('SignMaster quiz', () => {
  test('a new learner goes from the dashboard to a finished quiz', async ({ page }) => {
    await seedConfirmedSession(page, LEARNER_EMAIL)
    await mockEntitlementActive(page)
    await mockQuizStart(page)
    const submits = await mockQuizSubmit(page, QUESTION_COUNT)

    await page.goto('/app')

    await expect(page.getByTestId('dashboard-first-run')).toBeVisible()
    await page.getByTestId('start-quiz').click()

    await expect(page).toHaveURL(/\/app\/quiz\/play$/)
    await answerEveryQuestion(page)

    await expect(page.getByTestId('score-summary')).toBeVisible()
    await expect(page.getByTestId('score-summary')).toContainText('10')
    await expect(page.getByTestId('review-list')).toHaveCount(0)

    expect(submits.bodies).toHaveLength(1)
    expect(submits.bodies[0].quizId).toBe(QUIZ_ID)
    expect(submits.bodies[0].answers).toHaveLength(QUESTION_COUNT)
  })

  test('answering locks the options and names the sign', async ({ page }) => {
    await seedConfirmedSession(page, LEARNER_EMAIL)
    await mockEntitlementActive(page)
    await mockQuizStart(page)

    await page.goto('/app/quiz/play')

    // Nothing on screen names the sign before it is answered.
    await expect(page.getByTestId('quiz-counter')).toBeVisible()
    await expect(page.getByText('The full description of sign 0')).toHaveCount(0)

    await page.getByTestId('answer-option-0').click()

    await expect(page.getByText('Not quite')).toBeVisible()
    await expect(page.getByText('The full description of sign 0')).toBeVisible()
    await expect(page.getByTestId('answer-option-0')).toHaveAttribute(
      'data-state',
      'incorrect_chosen',
    )
    await expect(page.getByTestId('answer-option-1')).toHaveAttribute(
      'data-state',
      'correct_revealed',
    )

    for (const index of [0, 1, 2, 3]) {
      await expect(page.getByTestId(`answer-option-${index}`)).toBeDisabled()
    }
  })

  test('the misses are listed for review and the score is not re-openable', async ({
    page,
  }) => {
    await seedConfirmedSession(page, LEARNER_EMAIL)
    await mockEntitlementActive(page)
    await mockQuizStart(page)
    await mockQuizSubmit(page, 8)

    await page.goto('/app/quiz/play')
    await answerEveryQuestion(page)

    const review = page.getByTestId('review-list')

    await expect(review).toBeVisible()
    await expect(review).toContainText('Review · 2 signs')
    await expect(review).toContainText('Review only — your score stays as it is.')
  })

  test('leaving mid-quiz asks first', async ({ page }) => {
    await seedConfirmedSession(page, LEARNER_EMAIL)
    await mockEntitlementActive(page)
    await mockQuizStart(page)

    await page.goto('/app/quiz/play')
    await page.getByTestId('quiz-exit').click()

    await expect(page.getByTestId('exit-confirm')).toBeVisible()

    await page.getByRole('button', { name: 'Keep going' }).click()
    await expect(page.getByTestId('exit-confirm')).toHaveCount(0)

    await page.getByTestId('quiz-exit').click()
    await page.getByRole('button', { name: 'Leave quiz' }).click()

    await expect(page).toHaveURL(/\/app$/)
  })

  test('a quiz that cannot be loaded offers a retry and a way back', async ({ page }) => {
    await seedConfirmedSession(page, LEARNER_EMAIL)
    await mockEntitlementActive(page)
    await page.route('**/api/quiz/start', async (route) => {
      await route.abort('failed')
    })

    await page.goto('/app/quiz/play')

    await expect(page.getByTestId('quiz-error')).toBeVisible()
    await expect(page.getByText(/nothing has been lost/i)).toBeVisible()

    await page.getByRole('button', { name: 'Back to dashboard' }).click()
    await expect(page).toHaveURL(/\/app$/)
  })

  test('the dashboard reports real progress once there is some', async ({ page }) => {
    await seedConfirmedSession(page, LEARNER_EMAIL)
    await mockEntitlementActive(page)
    await mockProgress(page, {
      totalLearned: 47,
      deckSize: 101,
      dailyStreak: 6,
      needReviewToday: 3,
      states: { needs_practice: 17, getting_better: 12, mastered: 18 },
      quizzesTaken: 5,
      bestScore: 8,
    })

    await page.goto('/app')

    await expect(page.getByTestId('dashboard-returning')).toBeVisible()
    await expect(page.getByTestId('streak-badge')).toContainText('6 Day Streak')
    await expect(page.getByTestId('learning-tier-mastered')).toContainText('18')
    await expect(page.getByText('Need Review Today')).toBeVisible()
    await expect(page.getByTestId('start-quiz')).toContainText('Start Daily Review')
  })

  test('the Quiz & Test page does not start a quiz until asked', async ({ page }) => {
    await seedConfirmedSession(page, LEARNER_EMAIL)
    await mockEntitlementActive(page)
    let starts = 0
    await page.route('**/api/quiz/start', async (route) => {
      starts += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'OK', quizId: QUIZ_ID, quizIndex: 1, questions: QUESTIONS }),
      })
    })

    await page.goto('/app/quiz')

    await expect(page.getByTestId('quick-quiz-plate')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Quick Quiz' })).toBeVisible()
    expect(starts).toBe(0)

    await page.getByTestId('start-quiz').click()

    await expect(page).toHaveURL(/\/app\/quiz\/play$/)
    await expect(page.getByTestId('quiz-counter')).toBeVisible()
    expect(starts).toBe(1)
  })

  test('the quiz fits a phone viewport without sideways scrolling', async ({ page }) => {
    await seedConfirmedSession(page, LEARNER_EMAIL)
    await mockEntitlementActive(page)
    await mockQuizStart(page)

    await page.goto('/app/quiz/play')
    await expect(page.getByTestId('quiz-counter')).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )

    expect(overflow).toBeLessThanOrEqual(0)
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QuizHomeScreen from '../QuizHomeScreen'
import { clearProgressCache } from '../../../dashboard/hooks/useProgressSummary'
import { fetchProgress, type ProgressSummary } from '../../../../lib/api/progressApi'

vi.mock('../../../../lib/api/progressApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../lib/api/progressApi')>()

  return { ...actual, fetchProgress: vi.fn() }
})

vi.mock('../../../auth/context/AuthProvider', () => ({
  useAuthContext: () => ({
    isInitializing: false,
    isAuthenticated: true,
    user: { id: 'user-1', email: 'learner@example.com', emailConfirmed: true },
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}))

const fetchProgressMock = vi.mocked(fetchProgress)

const SUMMARY: ProgressSummary = {
  totalLearned: 47,
  deckSize: 101,
  dailyStreak: 6,
  needReviewToday: 3,
  states: { needs_practice: 17, getting_better: 12, mastered: 18 },
  quizzesTaken: 4,
  bestScore: 8,
}

function renderHome() {
  render(
    <MemoryRouter initialEntries={['/app/quiz']}>
      <Routes>
        <Route path="/app/quiz" element={<QuizHomeScreen />} />
        <Route path="/app/quiz/play" element={<p>Quiz session</p>} />
        <Route path="/app" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('QuizHomeScreen', () => {
  beforeEach(() => {
    fetchProgressMock.mockReset()
    clearProgressCache()
  })

  it('states what a quiz is before anything is started', () => {
    fetchProgressMock.mockReturnValue(new Promise(() => {}))
    renderHome()

    expect(screen.getByRole('heading', { name: 'Quick Quiz' })).toBeInTheDocument()
    expect(screen.getByText('Questions')).toBeInTheDocument()
    expect(screen.getByText('Sign pool')).toBeInTheDocument()
    expect(screen.getByTestId('start-quiz')).toHaveTextContent('Start Quiz')
  })

  it('shows the best score and quizzes taken once there is history', async () => {
    fetchProgressMock.mockResolvedValue({ kind: 'loaded', summary: SUMMARY })
    renderHome()

    expect(await screen.findByTestId('quiz-history')).toHaveTextContent(
      'Best score 8/10 · 4 quizzes taken',
    )
  })

  it('shows no history line on a first visit', async () => {
    fetchProgressMock.mockResolvedValue({
      kind: 'loaded',
      summary: { ...SUMMARY, quizzesTaken: 0, bestScore: null },
    })
    renderHome()

    await screen.findByRole('heading', { name: 'Quick Quiz' })
    expect(screen.queryByTestId('quiz-history')).not.toBeInTheDocument()
  })

  it('only starts a quiz when Start is pressed', async () => {
    const user = userEvent.setup()
    fetchProgressMock.mockResolvedValue({ kind: 'loaded', summary: SUMMARY })
    renderHome()

    expect(screen.queryByText('Quiz session')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('start-quiz'))

    expect(screen.getByText('Quiz session')).toBeInTheDocument()
  })

  it('still lets the learner start a quiz when history cannot be loaded', async () => {
    fetchProgressMock.mockResolvedValue({ kind: 'connection_error' })
    renderHome()

    expect(await screen.findByTestId('quiz-home-error')).toBeInTheDocument()
    expect(screen.getByTestId('start-quiz')).toBeEnabled()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardScreen from '../DashboardScreen'
import { clearProgressCache } from '../../hooks/useProgressSummary'
import {
  fetchProgress,
  type ProgressResult,
  type ProgressSummary,
} from '../../../../lib/api/progressApi'

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

const EMPTY_SUMMARY: ProgressSummary = {
  totalLearned: 0,
  deckSize: 101,
  dailyStreak: 0,
  needReviewToday: 0,
  states: { needs_practice: 0, getting_better: 0, mastered: 0 },
  quizzesTaken: 0,
  bestScore: null,
}

const RETURNING_SUMMARY: ProgressSummary = {
  totalLearned: 47,
  deckSize: 101,
  dailyStreak: 6,
  needReviewToday: 3,
  states: { needs_practice: 17, getting_better: 12, mastered: 18 },
  quizzesTaken: 5,
  bestScore: 8,
}

function renderDashboard(result: ProgressResult | 'pending') {
  if (result === 'pending') {
    fetchProgressMock.mockReturnValue(new Promise(() => {}))
  } else {
    fetchProgressMock.mockResolvedValue(result)
  }

  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<DashboardScreen />} />
        <Route path="/app/quiz/play" element={<p>Quiz screen</p>} />
        <Route path="/sign-in" element={<p>Sign in screen</p>} />
        <Route path="/activate" element={<p>Activate screen</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DashboardScreen', () => {
  beforeEach(() => {
    fetchProgressMock.mockReset()
    clearProgressCache()
  })

  it('shows the last numbers straight away on a return visit, then refreshes them', async () => {
    fetchProgressMock.mockResolvedValue({ kind: 'loaded', summary: RETURNING_SUMMARY })
    const { unmount } = render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<DashboardScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    // First visit: the skeleton, then the numbers.
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument()
    expect(await screen.findByTestId('dashboard-returning')).toBeInTheDocument()
    unmount()

    // Return visit: no skeleton. The remembered numbers show at once while
    // the fresh ones are fetched, and the fresh ones replace them.
    renderDashboard({
      kind: 'loaded',
      summary: { ...RETURNING_SUMMARY, quizzesTaken: 6, bestScore: 9 },
    })

    expect(screen.queryByTestId('dashboard-loading')).not.toBeInTheDocument()
    expect(screen.getByText(/5 quizzes taken/)).toBeInTheDocument()
    expect(await screen.findByText(/6 quizzes taken · best score 9\/10/)).toBeInTheDocument()
  })

  it('keeps the remembered numbers if a background refresh fails', async () => {
    fetchProgressMock.mockResolvedValue({ kind: 'loaded', summary: RETURNING_SUMMARY })
    const { unmount } = render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<DashboardScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByTestId('dashboard-returning')
    unmount()

    renderDashboard({ kind: 'connection_error' })

    await waitFor(() => expect(fetchProgressMock).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('dashboard-returning')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-error')).not.toBeInTheDocument()
  })

  it('shows a loading state before the numbers arrive', () => {
    renderDashboard('pending')

    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument()
  })

  it('shows a brand new learner the same layout as the mockup, with zeroes', async () => {
    renderDashboard({ kind: 'loaded', summary: EMPTY_SUMMARY })

    expect(await screen.findByTestId('dashboard-first-run')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByTestId('streak-badge')).toHaveTextContent('0 Day Streak')
    expect(screen.getByText('Total Learned')).toBeInTheDocument()
    expect(screen.getByText('Need Review Today')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Your Learning Progress' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('start-quiz')).toHaveTextContent('Start Daily Review')

    // With nothing learned the tiers describe the system rather than count.
    expect(screen.getByText('Signs you are still learning')).toBeInTheDocument()
    expect(screen.queryByText(/quizzes taken/)).not.toBeInTheDocument()
  })

  it('shows real counts, the streak and the tier totals for a returning learner', async () => {
    renderDashboard({ kind: 'loaded', summary: RETURNING_SUMMARY })

    expect(await screen.findByTestId('dashboard-returning')).toBeInTheDocument()
    expect(screen.getByTestId('streak-badge')).toHaveTextContent('6 Day Streak')
    expect(screen.getByText('47')).toBeInTheDocument()
    expect(screen.getByTestId('learning-tier-mastered')).toHaveTextContent('18')
    expect(screen.getByText('Total Learned')).toBeInTheDocument()
    expect(screen.getByText('Need Review Today')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Your Learning Progress' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('start-quiz')).toHaveTextContent('Start Daily Review')
    expect(screen.getByText(/5 quizzes taken · best score 8\/10/)).toBeInTheDocument()
  })

  it('takes the learner to the quiz', async () => {
    const user = userEvent.setup()
    renderDashboard({ kind: 'loaded', summary: EMPTY_SUMMARY })

    await user.click(await screen.findByTestId('start-quiz'))

    expect(screen.getByText('Quiz screen')).toBeInTheDocument()
  })

  it('offers a retry when the summary cannot be loaded', async () => {
    renderDashboard({ kind: 'connection_error' })

    expect(await screen.findByTestId('dashboard-error')).toBeInTheDocument()
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument()
  })

  it('sends a learner with no session back to sign in', async () => {
    renderDashboard({ kind: 'unauthenticated' })

    await waitFor(() => {
      expect(screen.getByText('Sign in screen')).toBeInTheDocument()
    })
  })

  it('sends a learner with no entitlement to activation', async () => {
    renderDashboard({ kind: 'not_entitled' })

    await waitFor(() => {
      expect(screen.getByText('Activate screen')).toBeInTheDocument()
    })
  })

  it('offers a way to sign out', async () => {
    const user = userEvent.setup()
    renderDashboard({ kind: 'loaded', summary: EMPTY_SUMMARY })

    await user.click(await screen.findByTestId('account-menu-trigger'))

    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })
})

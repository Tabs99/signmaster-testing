import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QuizScreen from '../QuizScreen'
import {
  startQuiz,
  submitQuiz,
  type QuizQuestion,
  type QuizResult,
} from '../../../../lib/api/quizApi'

vi.mock('../../../../lib/api/quizApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api/quizApi')>()

  return { ...actual, startQuiz: vi.fn(), submitQuiz: vi.fn() }
})

vi.mock('../../../auth/context/AuthProvider', () => ({
  useAuthContext: () => ({
    isInitializing: false,
    isAuthenticated: true,
    user: { id: 'user-1', email: 'learner@example.com', emailConfirmed: true },
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}))

const startQuizMock = vi.mocked(startQuiz)
const submitQuizMock = vi.mocked(submitQuiz)

const QUIZ_ID = '00000000-0000-4000-8000-000000000001'

function question(index: number, overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    signId: `s00${index + 1}`,
    index,
    prompt: 'What does this road sign mean?',
    images: [`50${index + 1}.jpg`],
    options: [
      `Meaning ${index}A`,
      `Meaning ${index}B`,
      `Meaning ${index}C`,
      `Meaning ${index}D`,
    ],
    correctOptionIndex: 1,
    meaning: `The full description of sign ${index}`,
    ...overrides,
  }
}

const QUESTIONS = Array.from({ length: 10 }, (_unused, index) => question(index))

function resultFor(score: number): QuizResult {
  return {
    quizId: QUIZ_ID,
    score,
    totalQuestions: QUESTIONS.length,
    outcomes: QUESTIONS.map((item, index) => ({
      signId: item.signId,
      questionIndex: index,
      images: item.images,
      chosenOptionIndex: index < score ? 1 : 0,
      correctOptionIndex: 1,
      isCorrect: index < score,
      chosenAnswer: item.options[index < score ? 1 : 0],
      correctAnswer: item.options[1],
      meaning: item.meaning,
    })),
  }
}

function renderQuiz() {
  render(
    <MemoryRouter initialEntries={['/app/quiz/play']}>
      <Routes>
        <Route path="/app/quiz/play" element={<QuizScreen />} />
        <Route path="/app" element={<p>Dashboard screen</p>} />
        <Route path="/sign-in" element={<p>Sign in screen</p>} />
        <Route path="/activate" element={<p>Activate screen</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Answers every question correctly and finishes, leaving the results on screen. */
async function playThrough(user: ReturnType<typeof userEvent.setup>) {
  for (let index = 0; index < QUESTIONS.length; index += 1) {
    await user.click(await screen.findByTestId('answer-option-1'))
    await user.click(
      screen.getByRole('button', {
        name: index === QUESTIONS.length - 1 ? 'Finish quiz' : 'Next question',
      }),
    )
  }
}

describe('QuizScreen', () => {
  beforeEach(() => {
    startQuizMock.mockReset()
    submitQuizMock.mockReset()
    startQuizMock.mockResolvedValue({
      kind: 'started',
      session: { quizId: QUIZ_ID, quizIndex: 1, questions: QUESTIONS },
    })
    submitQuizMock.mockResolvedValue({ kind: 'scored', result: resultFor(10) })
  })

  it('shows one loading state while the questions are fetched', () => {
    startQuizMock.mockReturnValue(new Promise(() => {}))
    renderQuiz()

    expect(screen.getByTestId('quiz-loading')).toBeInTheDocument()
  })

  it('asks the first question with four options and no way to advance yet', async () => {
    renderQuiz()

    expect(await screen.findByTestId('quiz-counter')).toHaveTextContent(
      'Question 1 of 10',
    )
    expect(screen.getByText('What does this road sign mean?')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Meaning 0/ })).toHaveLength(4)
    expect(
      screen.queryByRole('button', { name: 'Next question' }),
    ).not.toBeInTheDocument()
  })

  it('does not name the sign before the question is answered', async () => {
    renderQuiz()

    expect(await screen.findByAltText('Road sign to identify')).toBeInTheDocument()
    expect(
      screen.queryByText('The full description of sign 0'),
    ).not.toBeInTheDocument()
  })

  it('treats a tap as the answer and gives feedback immediately', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await user.click(await screen.findByTestId('answer-option-1'))

    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('The full description of sign 0')).toBeInTheDocument()
    expect(screen.getByTestId('answer-option-1')).toHaveAttribute(
      'data-state',
      'correct_chosen',
    )
    expect(screen.getByRole('button', { name: 'Next question' })).toBeInTheDocument()
  })

  it('reveals the right answer beside the wrong one it was given', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await user.click(await screen.findByTestId('answer-option-0'))

    expect(screen.getByText('Not quite')).toBeInTheDocument()
    expect(screen.getByTestId('answer-option-0')).toHaveAttribute(
      'data-state',
      'incorrect_chosen',
    )
    expect(screen.getByTestId('answer-option-1')).toHaveAttribute(
      'data-state',
      'correct_revealed',
    )
  })

  it('locks every option once one is chosen', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await user.click(await screen.findByTestId('answer-option-0'))

    for (let index = 0; index < 4; index += 1) {
      expect(screen.getByTestId(`answer-option-${index}`)).toBeDisabled()
    }
  })

  it('marks the last question and changes the action', async () => {
    const user = userEvent.setup()
    renderQuiz()

    for (let index = 0; index < QUESTIONS.length - 1; index += 1) {
      await user.click(await screen.findByTestId('answer-option-1'))
      await user.click(screen.getByRole('button', { name: 'Next question' }))
    }

    expect(screen.getByTestId('quiz-counter')).toHaveTextContent(
      'Question 10 of 10 · Last one',
    )

    await user.click(screen.getByTestId('answer-option-1'))

    expect(screen.getByRole('button', { name: 'Finish quiz' })).toBeInTheDocument()
  })

  it('submits every answer and shows the score', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await playThrough(user)

    expect(await screen.findByTestId('score-summary')).toBeInTheDocument()
    expect(submitQuizMock).toHaveBeenCalledTimes(1)

    const [quizId, answers] = submitQuizMock.mock.calls[0]

    expect(quizId).toBe(QUIZ_ID)
    expect(answers).toHaveLength(10)
    expect(answers[0]).toEqual({ questionIndex: 0, chosenOptionIndex: 1 })
  })

  it('lists only the misses for review', async () => {
    const user = userEvent.setup()
    submitQuizMock.mockResolvedValue({ kind: 'scored', result: resultFor(8) })
    renderQuiz()

    await playThrough(user)

    const review = await screen.findByTestId('review-list')

    expect(review).toHaveTextContent('Review · 2 signs')
    expect(review).toHaveTextContent('Review only — your score stays as it is.')
  })

  it('hides the review list on a clean sweep', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await playThrough(user)

    await screen.findByTestId('score-summary')
    expect(screen.queryByTestId('review-list')).not.toBeInTheDocument()
  })

  it('confirms before abandoning a quiz in progress', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await user.click(await screen.findByTestId('quiz-exit'))

    expect(screen.getByTestId('exit-confirm')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Keep going' }))

    expect(screen.queryByTestId('exit-confirm')).not.toBeInTheDocument()
    expect(screen.getByTestId('quiz-counter')).toBeInTheDocument()
  })

  it('leaves for the dashboard when the learner confirms', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await user.click(await screen.findByTestId('quiz-exit'))
    await user.click(screen.getByRole('button', { name: 'Leave quiz' }))

    expect(screen.getByText('Dashboard screen')).toBeInTheDocument()
  })

  it('answers with the number keys and advances with Enter', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await screen.findByTestId('quiz-counter')

    await user.keyboard('2')
    expect(screen.getByText('Correct')).toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(screen.getByTestId('quiz-counter')).toHaveTextContent('Question 2 of 10')
  })

  it('offers a retry and a way out when the quiz cannot be loaded', async () => {
    startQuizMock.mockResolvedValue({ kind: 'connection_error' })
    renderQuiz()

    expect(await screen.findByTestId('quiz-error')).toBeInTheDocument()
    expect(screen.getByText(/nothing has been lost/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('keeps the answers when the score cannot be saved', async () => {
    const user = userEvent.setup()
    submitQuizMock.mockResolvedValue({ kind: 'connection_error' })
    renderQuiz()

    await playThrough(user)

    expect(await screen.findByTestId('quiz-error')).toBeInTheDocument()
    expect(screen.getByText("We couldn't save your score")).toBeInTheDocument()

    submitQuizMock.mockResolvedValue({ kind: 'scored', result: resultFor(10) })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByTestId('score-summary')).toBeInTheDocument()
    expect(submitQuizMock).toHaveBeenCalledTimes(2)
    expect(submitQuizMock.mock.calls[1][1]).toHaveLength(10)
  })

  it('sends a learner with no session back to sign in', async () => {
    startQuizMock.mockResolvedValue({ kind: 'unauthenticated' })
    renderQuiz()

    await waitFor(() => {
      expect(screen.getByText('Sign in screen')).toBeInTheDocument()
    })
  })

  it('sends a learner with no entitlement to activation', async () => {
    startQuizMock.mockResolvedValue({ kind: 'not_entitled' })
    renderQuiz()

    await waitFor(() => {
      expect(screen.getByText('Activate screen')).toBeInTheDocument()
    })
  })

  it('starts a fresh quiz from the results screen', async () => {
    const user = userEvent.setup()
    renderQuiz()

    await playThrough(user)
    await screen.findByTestId('score-summary')

    await user.click(screen.getByRole('button', { name: 'Try another quiz' }))

    expect(await screen.findByTestId('quiz-counter')).toHaveTextContent(
      'Question 1 of 10',
    )
    expect(startQuizMock).toHaveBeenCalledTimes(2)
  })
})

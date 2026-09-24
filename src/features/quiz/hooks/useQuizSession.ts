import { useCallback, useEffect, useRef, useState } from 'react'
import {
  startQuiz as startQuizRequest,
  submitQuiz as submitQuizRequest,
  type QuizRequestOptions,
  type QuizResult,
  type QuizSession,
} from '../../../lib/api/quizApi'

/**
 * Holds one run through a quiz.
 *
 * All ten questions are fetched up front. That means one loading state instead
 * of ten, no wait between questions, and a connection that drops at question
 * six does not cost the learner the session — only the final submit has to
 * reach the server, and it can be retried.
 *
 * Answering is one-way. A chosen option is recorded and locked, because the
 * feedback that follows is where the learning happens and being able to change
 * an answer after seeing it would remove that.
 */

export type QuizPhase =
  | { kind: 'loading' }
  | { kind: 'failed_to_start'; reason: 'offline' | 'unavailable' }
  | { kind: 'asking' }
  | { kind: 'submitting' }
  | { kind: 'scored'; result: QuizResult }
  | { kind: 'failed_to_submit'; reason: 'offline' | 'unavailable' }

export interface UseQuizSessionOptions {
  /** Called when the session can no longer be trusted and the learner must sign in again. */
  onUnauthenticated: () => void
  /** Called when the account has no active entitlement. */
  onNotEntitled: () => void
  requestOptions?: QuizRequestOptions
  startRequest?: typeof startQuizRequest
  submitRequest?: typeof submitQuizRequest
}

export interface QuizSessionState {
  phase: QuizPhase
  session: QuizSession | null
  currentIndex: number
  /** Chosen option per answered question index. */
  answers: ReadonlyMap<number, number>
  answerCurrent: (optionIndex: number) => void
  goToNext: () => void
  restart: () => void
  retrySubmit: () => void
}

export function useQuizSession(options: UseQuizSessionOptions): QuizSessionState {
  const {
    onUnauthenticated,
    onNotEntitled,
    requestOptions,
    startRequest = startQuizRequest,
    submitRequest = submitQuizRequest,
  } = options

  const [phase, setPhase] = useState<QuizPhase>({ kind: 'loading' })
  const [session, setSession] = useState<QuizSession | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<number, number>>(new Map())
  const [startToken, setStartToken] = useState(0)

  // Guards against a double tap on Finish sending the quiz twice.
  const submittingRef = useRef(false)

  // The start request in flight, keyed by the retry token that launched it.
  // React's development StrictMode runs a mount effect, cleans it up, and runs
  // it again; without this the second run would send a second start request
  // and create a second session in the database. The second run reuses the
  // first request's promise instead, so exactly one quiz is started per token.
  const startInFlightRef = useRef<{
    token: number
    promise: ReturnType<typeof startRequest>
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    setPhase({ kind: 'loading' })
    setSession(null)
    setCurrentIndex(0)
    setAnswers(new Map())
    submittingRef.current = false

    if (startInFlightRef.current?.token !== startToken) {
      startInFlightRef.current = {
        token: startToken,
        promise: startRequest(requestOptions),
      }
    }

    const request = startInFlightRef.current.promise

    void (async () => {
      const result = await request

      if (cancelled) {
        return
      }

      switch (result.kind) {
        case 'started':
          setSession(result.session)
          setPhase({ kind: 'asking' })
          return
        case 'unauthenticated':
          onUnauthenticated()
          return
        case 'not_entitled':
          onNotEntitled()
          return
        case 'connection_error':
          setPhase({ kind: 'failed_to_start', reason: 'offline' })
          return
        default:
          setPhase({ kind: 'failed_to_start', reason: 'unavailable' })
      }
    })()

    return () => {
      cancelled = true
    }
    // `startToken` is the retry signal; the callbacks are stable by contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startToken])

  const submit = useCallback(
    async (finalAnswers: ReadonlyMap<number, number>, quizId: string) => {
      if (submittingRef.current) {
        return
      }

      submittingRef.current = true
      setPhase({ kind: 'submitting' })

      const result = await submitRequest(
        quizId,
        [...finalAnswers.entries()].map(([questionIndex, chosenOptionIndex]) => ({
          questionIndex,
          chosenOptionIndex,
        })),
        requestOptions,
      )

      submittingRef.current = false

      switch (result.kind) {
        case 'scored':
          setPhase({ kind: 'scored', result: result.result })
          return
        case 'unauthenticated':
          onUnauthenticated()
          return
        case 'not_entitled':
          onNotEntitled()
          return
        case 'connection_error':
          setPhase({ kind: 'failed_to_submit', reason: 'offline' })
          return
        default:
          // `not_found` and `already_completed` both mean this quiz cannot be
          // scored again. Retrying will not help, but the learner still needs a
          // way out, which the failure screen gives them.
          setPhase({ kind: 'failed_to_submit', reason: 'unavailable' })
      }
    },
    [onNotEntitled, onUnauthenticated, requestOptions, submitRequest],
  )

  const answerCurrent = useCallback(
    (optionIndex: number) => {
      setAnswers((previous) => {
        if (previous.has(currentIndex)) {
          return previous
        }

        const next = new Map(previous)
        next.set(currentIndex, optionIndex)
        return next
      })
    },
    [currentIndex],
  )

  const goToNext = useCallback(() => {
    if (!session) {
      return
    }

    if (currentIndex < session.questions.length - 1) {
      setCurrentIndex((index) => index + 1)
      return
    }

    void submit(answers, session.quizId)
  }, [answers, currentIndex, session, submit])

  const retrySubmit = useCallback(() => {
    if (session) {
      void submit(answers, session.quizId)
    }
  }, [answers, session, submit])

  const restart = useCallback(() => {
    setStartToken((token) => token + 1)
  }, [])

  return {
    phase,
    session,
    currentIndex,
    answers,
    answerCurrent,
    goToNext,
    restart,
    retrySubmit,
  }
}

import { describe, expect, it, vi } from 'vitest'
import { handleQuizStart, type VercelLikeResponse } from '../start.ts'
import { handleQuizSubmit } from '../submit.ts'
import { handleProgressMe } from '../../progress/me.ts'
import { createInMemoryQuizStore } from '../../../server/services/__tests__/inMemoryQuizStore.ts'
import type { QuizAccessDeps } from '../../../server/services/quizAccess.ts'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const AUTH_HEADERS = { authorization: 'Bearer token' }

function createMockResponse(): VercelLikeResponse & {
  statusCode: number | null
  body: unknown
  headers: Record<string, string | string[]>
} {
  const response = {
    statusCode: null as number | null,
    body: null as unknown,
    headers: {} as Record<string, string | string[]>,
    setHeader(name: string, value: string | string[]) {
      response.headers[name] = value
      return response
    },
    status(code: number) {
      response.statusCode = code
      return response
    },
    json(body: unknown) {
      response.body = body
      return undefined
    },
  }

  return response
}

function createAccess(
  overrides: {
    user?: { id: string; email: string; emailConfirmed: boolean } | null
    entitlement?: 'ACTIVE' | 'NONE'
  } = {},
): QuizAccessDeps {
  const user =
    overrides.user === undefined
      ? { id: USER_ID, email: 'learner@example.com', emailConfirmed: true }
      : overrides.user

  return {
    getAuthenticatedUser: vi.fn().mockResolvedValue(user),
    createClient: vi.fn().mockReturnValue({}),
    checkEntitlement: vi.fn().mockResolvedValue(overrides.entitlement ?? 'ACTIVE'),
  }
}

function createHarness() {
  const store = createInMemoryQuizStore()

  return {
    store,
    deps: { access: createAccess(), createStore: () => store },
  }
}

describe('POST /api/quiz/start', () => {
  it('rejects anything but POST', async () => {
    const res = createMockResponse()
    const { deps } = createHarness()

    await handleQuizStart({ method: 'GET', headers: AUTH_HEADERS }, res, deps)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
  })

  it('refuses a request with no session', async () => {
    const res = createMockResponse()
    const { store } = createHarness()

    await handleQuizStart({ method: 'POST', headers: {} }, res, {
      access: createAccess({ user: null }),
      createStore: () => store,
    })

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ status: 'UNAUTHENTICATED' })
  })

  it('refuses a signed-in learner with no entitlement', async () => {
    const res = createMockResponse()
    const { store } = createHarness()

    await handleQuizStart({ method: 'POST', headers: AUTH_HEADERS }, res, {
      access: createAccess({ entitlement: 'NONE' }),
      createStore: () => store,
    })

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ status: 'NOT_ENTITLED' })
  })

  it('returns ten questions for an entitled learner', async () => {
    const res = createMockResponse()
    const { deps } = createHarness()

    await handleQuizStart({ method: 'POST', headers: AUTH_HEADERS }, res, deps)

    expect(res.statusCode).toBe(201)

    const body = res.body as { status: string; questions: unknown[]; quizId: string }

    expect(body.status).toBe('OK')
    expect(body.questions).toHaveLength(10)
    expect(body.quizId).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('says nothing about the failure when the store breaks', async () => {
    const res = createMockResponse()
    const { store } = createHarness()

    store.getSignProgress = vi.fn().mockRejectedValue(new Error('connection refused'))

    await handleQuizStart({ method: 'POST', headers: AUTH_HEADERS }, res, {
      access: createAccess(),
      createStore: () => store,
    })

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ status: 'ERROR' })
  })
})

describe('POST /api/quiz/submit', () => {
  async function startQuizFor(harness: ReturnType<typeof createHarness>) {
    const res = createMockResponse()
    await handleQuizStart({ method: 'POST', headers: AUTH_HEADERS }, res, harness.deps)

    return res.body as {
      quizId: string
      questions: { index: number; correctOptionIndex: number }[]
    }
  }

  it('rejects anything but POST', async () => {
    const res = createMockResponse()
    const { deps } = createHarness()

    await handleQuizSubmit({ method: 'GET', headers: AUTH_HEADERS }, res, deps)

    expect(res.statusCode).toBe(405)
  })

  it('rejects a body that is not a submission', async () => {
    const res = createMockResponse()
    const { deps } = createHarness()

    await handleQuizSubmit(
      { method: 'POST', headers: AUTH_HEADERS, body: { quizId: 'not-a-uuid' } },
      res,
      deps,
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ status: 'INVALID_SUBMISSION' })
  })

  it('rejects an oversized body before doing any work', async () => {
    const res = createMockResponse()
    const { deps } = createHarness()
    const checkAuth = deps.access.getAuthenticatedUser

    await handleQuizSubmit(
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'content-length': '999999' },
        body: { quizId: '00000000-0000-4000-8000-000000000000', answers: [] },
      },
      res,
      deps,
    )

    expect(res.statusCode).toBe(413)
    expect(checkAuth).not.toHaveBeenCalled()
  })

  it('scores a real submission', async () => {
    const harness = createHarness()
    const quiz = await startQuizFor(harness)
    const res = createMockResponse()

    await handleQuizSubmit(
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: {
          quizId: quiz.quizId,
          answers: quiz.questions.map((question) => ({
            questionIndex: question.index,
            chosenOptionIndex: question.index < 6 ? question.correctOptionIndex : null,
          })),
        },
      },
      res,
      harness.deps,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ status: 'OK', score: 6, totalQuestions: 10 })
  })

  it('will not score the same quiz twice', async () => {
    const harness = createHarness()
    const quiz = await startQuizFor(harness)
    const body = { quizId: quiz.quizId, answers: [] }

    await handleQuizSubmit(
      { method: 'POST', headers: AUTH_HEADERS, body },
      createMockResponse(),
      harness.deps,
    )

    const res = createMockResponse()
    await handleQuizSubmit(
      { method: 'POST', headers: AUTH_HEADERS, body },
      res,
      harness.deps,
    )

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ status: 'ALREADY_COMPLETED' })
  })

  it('will not let one learner submit another learner’s quiz', async () => {
    const harness = createHarness()
    const quiz = await startQuizFor(harness)
    const res = createMockResponse()

    await handleQuizSubmit(
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: { quizId: quiz.quizId, answers: [] },
      },
      res,
      {
        access: createAccess({
          user: { id: OTHER_USER_ID, email: 'other@example.com', emailConfirmed: true },
        }),
        createStore: () => harness.store,
      },
    )

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ status: 'NOT_FOUND' })
  })
})

describe('GET /api/progress/me', () => {
  it('rejects anything but GET', async () => {
    const res = createMockResponse()
    const { deps } = createHarness()

    await handleProgressMe({ method: 'POST', headers: AUTH_HEADERS }, res, deps)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET')
  })

  it('refuses a learner with no entitlement', async () => {
    const res = createMockResponse()
    const { store } = createHarness()

    await handleProgressMe({ method: 'GET', headers: AUTH_HEADERS }, res, {
      access: createAccess({ entitlement: 'NONE' }),
      createStore: () => store,
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns an empty summary for a new account', async () => {
    const res = createMockResponse()
    const { deps } = createHarness()

    await handleProgressMe({ method: 'GET', headers: AUTH_HEADERS }, res, deps)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      status: 'OK',
      totalLearned: 0,
      deckSize: 101,
      dailyStreak: 0,
      quizzesTaken: 0,
      bestScore: null,
    })
  })

  it('leaks nothing about the account beyond counts', async () => {
    const res = createMockResponse()
    const { deps } = createHarness()

    await handleProgressMe({ method: 'GET', headers: AUTH_HEADERS }, res, deps)

    expect(Object.keys(res.body as object).sort()).toEqual([
      'bestScore',
      'dailyStreak',
      'deckSize',
      'needReviewToday',
      'quizzesTaken',
      'states',
      'status',
      'totalLearned',
    ])
  })
})

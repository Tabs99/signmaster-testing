import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthService } from '../authService'

function createMockClient() {
  return {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
    },
  }
}

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success when sign-up creates a confirmed session', async () => {
    const client = createMockClient()
    client.auth.signUp.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'alex@example.invalid',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
        },
        session: { access_token: 'token' },
      },
      error: null,
    })

    const service = createAuthService({ getClient: () => client as never })
    const result = await service.signUp('alex@example.invalid', 'Secure123!')

    expect(result).toEqual({
      kind: 'success',
      user: {
        id: 'user-1',
        email: 'alex@example.invalid',
        emailConfirmed: true,
      },
      session: {
        user: {
          id: 'user-1',
          email: 'alex@example.invalid',
          emailConfirmed: true,
        },
      },
    })
  })

  it('returns email confirmation required when sign-up has no session', async () => {
    const client = createMockClient()
    client.auth.signUp.mockResolvedValue({
      data: {
        user: {
          id: 'user-2',
          email: 'pending@example.invalid',
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    })

    const service = createAuthService({ getClient: () => client as never })
    const result = await service.signUp('pending@example.invalid', 'Secure123!')

    expect(result).toEqual({
      kind: 'email_confirmation_required',
      user: {
        id: 'user-2',
        email: 'pending@example.invalid',
        emailConfirmed: false,
      },
    })
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })

  it('returns email confirmation required and signs out when sign-up has unconfirmed session', async () => {
    const client = createMockClient()
    client.auth.signUp.mockResolvedValue({
      data: {
        user: {
          id: 'user-2b',
          email: 'pending-session@example.invalid',
          email_confirmed_at: null,
        },
        session: { access_token: 'token' },
      },
      error: null,
    })
    client.auth.signOut.mockResolvedValue({ error: null })

    const service = createAuthService({ getClient: () => client as never })
    const result = await service.signUp('pending-session@example.invalid', 'Secure123!')

    expect(client.auth.signOut).toHaveBeenCalledOnce()
    expect(result).toEqual({
      kind: 'email_confirmation_required',
      user: {
        id: 'user-2b',
        email: 'pending-session@example.invalid',
        emailConfirmed: false,
      },
    })
  })

  it('maps duplicate sign-up errors safely', async () => {
    const client = createMockClient()
    client.auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    })

    const service = createAuthService({ getClient: () => client as never })
    const result = await service.signUp('exists@example.invalid', 'Secure123!')

    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.error.code).toBe('email_already_registered')
    }
  })

  it('rejects unconfirmed sign-in attempts', async () => {
    const client = createMockClient()
    client.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'user-3',
          email: 'pending@example.invalid',
          email_confirmed_at: null,
        },
        session: { access_token: 'token' },
      },
      error: null,
    })
    client.auth.signOut.mockResolvedValue({ error: null })

    const service = createAuthService({ getClient: () => client as never })
    const result = await service.signIn('pending@example.invalid', 'Secure123!')

    expect(client.auth.signOut).toHaveBeenCalledOnce()
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.error.code).toBe('email_not_confirmed')
    }
  })

  it('returns success for confirmed sign-in', async () => {
    const client = createMockClient()
    client.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'user-4',
          email: 'alex@example.invalid',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
        },
        session: { access_token: 'token' },
      },
      error: null,
    })

    const service = createAuthService({ getClient: () => client as never })
    const result = await service.signIn('alex@example.invalid', 'Secure123!')

    expect(result.kind).toBe('success')
  })
})

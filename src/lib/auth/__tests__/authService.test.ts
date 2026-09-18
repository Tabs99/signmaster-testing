import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthService } from '../authService'

function createMockClient() {
  return {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
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

  describe('signInWithGoogle', () => {
    it('calls Supabase OAuth with provider google and a safe redirect URL', async () => {
      const client = createMockClient()
      client.auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://oauth.test' }, error: null })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.signInWithGoogle({
        redirectTo: 'http://localhost:4200/activate',
      })

      expect(result).toEqual({ kind: 'redirect_initiated' })
      expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'http://localhost:4200/activate' },
      })
    })

    it('maps OAuth initiation failures to safe auth errors', async () => {
      const client = createMockClient()
      client.auth.signInWithOAuth.mockResolvedValue({
        data: { url: null },
        error: { message: 'Provider misconfigured' },
      })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.signInWithGoogle({
        redirectTo: 'http://localhost:4200/sign-in',
      })

      expect(result.kind).toBe('error')
      if (result.kind === 'error') {
        expect(result.error.message).not.toContain('misconfigured')
      }
    })

    it('maps network failures to the standard network error message', async () => {
      const client = createMockClient()
      client.auth.signInWithOAuth.mockRejectedValue(new TypeError('Failed to fetch'))

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.signInWithGoogle()

      expect(result.kind).toBe('error')
      if (result.kind === 'error') {
        expect(result.error.code).toBe('network_error')
      }
    })
  })

  describe('requestPasswordReset', () => {
    it('returns sent and forwards the redirect URL on success', async () => {
      const client = createMockClient()
      client.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.requestPasswordReset('alex@example.invalid', {
        redirectTo: 'https://app.example/reset-password',
      })

      expect(result).toEqual({ kind: 'sent' })
      expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('alex@example.invalid', {
        redirectTo: 'https://app.example/reset-password',
      })
    })

    it('trims the email before requesting a reset', async () => {
      const client = createMockClient()
      client.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })

      const service = createAuthService({ getClient: () => client as never })
      await service.requestPasswordReset('  spaced@example.invalid  ')

      expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'spaced@example.invalid',
        undefined,
      )
    })

    it('collapses an unexpected error to sent (never reveals account existence)', async () => {
      const client = createMockClient()
      client.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: { message: 'User not found', status: 400 },
      })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.requestPasswordReset('missing@example.invalid')

      expect(result).toEqual({ kind: 'sent' })
    })

    it('maps rate-limit errors to rate_limited', async () => {
      const client = createMockClient()
      client.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: { message: 'Email rate limit exceeded', status: 429 },
      })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.requestPasswordReset('alex@example.invalid')

      expect(result).toEqual({ kind: 'rate_limited' })
    })

    it('maps network failures to connection_error', async () => {
      const client = createMockClient()
      client.auth.resetPasswordForEmail.mockRejectedValue(
        new TypeError('Failed to fetch'),
      )

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.requestPasswordReset('alex@example.invalid')

      expect(result).toEqual({ kind: 'connection_error' })
    })

    it('maps server errors to service_unavailable', async () => {
      const client = createMockClient()
      client.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: { message: 'Internal error', status: 503 },
      })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.requestPasswordReset('alex@example.invalid')

      expect(result).toEqual({ kind: 'service_unavailable' })
    })
  })

  describe('updatePassword', () => {
    it('returns success with the mapped user', async () => {
      const client = createMockClient()
      client.auth.updateUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-9',
            email: 'alex@example.invalid',
            email_confirmed_at: '2026-01-01T00:00:00.000Z',
          },
        },
        error: null,
      })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.updatePassword('NewSecure123!')

      expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'NewSecure123!' })
      expect(result).toEqual({
        kind: 'success',
        user: { id: 'user-9', email: 'alex@example.invalid', emailConfirmed: true },
      })
    })

    it('maps a missing recovery session to invalid_recovery_session', async () => {
      const client = createMockClient()
      client.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
      })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.updatePassword('NewSecure123!')

      expect(result).toEqual({ kind: 'invalid_recovery_session' })
    })

    it('maps an expired token to invalid_recovery_session', async () => {
      const client = createMockClient()
      client.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token has expired', status: 401 },
      })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.updatePassword('NewSecure123!')

      expect(result).toEqual({ kind: 'invalid_recovery_session' })
    })

    it('maps weak-password errors to weak_password', async () => {
      const client = createMockClient()
      client.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Password should be at least 6 characters', status: 422 },
      })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.updatePassword('short')

      expect(result).toEqual({ kind: 'weak_password' })
    })

    it('maps network failures to connection_error', async () => {
      const client = createMockClient()
      client.auth.updateUser.mockRejectedValue(new TypeError('Failed to fetch'))

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.updatePassword('NewSecure123!')

      expect(result).toEqual({ kind: 'connection_error' })
    })

    it('treats a success response with no user as an invalid recovery session', async () => {
      const client = createMockClient()
      client.auth.updateUser.mockResolvedValue({ data: { user: null }, error: null })

      const service = createAuthService({ getClient: () => client as never })
      const result = await service.updatePassword('NewSecure123!')

      expect(result).toEqual({ kind: 'invalid_recovery_session' })
    })
  })
})

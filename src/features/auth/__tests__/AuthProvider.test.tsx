import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuthContext } from '../context/AuthProvider'

const mockGetSession = vi.fn()
const mockSignOut = vi.fn()
const mockUnsubscribe = vi.fn()
const mockOnAuthStateChange = vi.fn()

vi.mock('../../../lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}))

vi.mock('../../../lib/auth/authService', () => ({
  authService: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
}))

function AuthProbe() {
  const { isInitializing, user, isAuthenticated } = useAuthContext()

  return (
    <div>
      <p>initializing:{String(isInitializing)}</p>
      <p>authenticated:{String(isAuthenticated)}</p>
      <p>email:{user?.email ?? 'none'}</p>
    </div>
  )
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('restores a signed-out state after initial session lookup', async () => {
    mockGetSession.mockResolvedValue(null)
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    expect(screen.getByText('initializing:true')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('initializing:false')).toBeInTheDocument()
      expect(screen.getByText('authenticated:false')).toBeInTheDocument()
      expect(screen.getByText('email:none')).toBeInTheDocument()
    })
  })

  it('updates user state when auth changes and cleans up subscription', async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'alex@example.invalid',
        emailConfirmed: true,
      },
    })

    let authListener: ((event: string, session: unknown) => void) | undefined
    mockOnAuthStateChange.mockImplementation((listener) => {
      authListener = listener
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('email:alex@example.invalid')).toBeInTheDocument()
    })

    act(() => {
      authListener?.('SIGNED_OUT', null)
    })

    await waitFor(() => {
      expect(screen.getByText('email:none')).toBeInTheDocument()
    })
  })

  it('unsubscribes from auth changes on unmount', async () => {
    mockGetSession.mockResolvedValue(null)
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    })

    const { unmount } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('initializing:false')).toBeInTheDocument()
    })

    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledOnce()
  })

  it('ignores stale getSession when SIGNED_OUT arrives first', async () => {
    const deferred = createDeferred<{
      user: { id: string; email: string; emailConfirmed: boolean }
    } | null>()
    mockGetSession.mockReturnValue(deferred.promise)

    let authListener: ((event: string, session: unknown) => void) | undefined
    mockOnAuthStateChange.mockImplementation((listener) => {
      authListener = listener
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    act(() => {
      authListener?.('SIGNED_OUT', null)
    })

    await waitFor(() => {
      expect(screen.getByText('email:none')).toBeInTheDocument()
    })

    await act(async () => {
      deferred.resolve({
        user: {
          id: 'stale-user',
          email: 'stale@example.invalid',
          emailConfirmed: true,
        },
      })
      await deferred.promise
    })

    expect(screen.getByText('email:none')).toBeInTheDocument()
    expect(screen.getByText('authenticated:false')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('initializing:false')).toBeInTheDocument()
    })
  })

  it('ignores stale getSession null when SIGNED_IN arrives first', async () => {
    const deferred = createDeferred<null>()
    mockGetSession.mockReturnValue(deferred.promise)

    let authListener: ((event: string, session: unknown) => void) | undefined
    mockOnAuthStateChange.mockImplementation((listener) => {
      authListener = listener
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    act(() => {
      authListener?.('SIGNED_IN', {
        user: {
          id: 'live-user',
          email: 'live@example.invalid',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      })
    })

    await waitFor(() => {
      expect(screen.getByText('email:live@example.invalid')).toBeInTheDocument()
      expect(screen.getByText('authenticated:true')).toBeInTheDocument()
    })

    await act(async () => {
      deferred.resolve(null)
      await deferred.promise
    })

    expect(screen.getByText('email:live@example.invalid')).toBeInTheDocument()
    expect(screen.getByText('authenticated:true')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('initializing:false')).toBeInTheDocument()
    })
  })

  it('fails safe to signed out when getSession rejects', async () => {
    mockGetSession.mockRejectedValue(new Error('session lookup failed'))
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('initializing:false')).toBeInTheDocument()
      expect(screen.getByText('email:none')).toBeInTheDocument()
      expect(screen.getByText('authenticated:false')).toBeInTheDocument()
    })
  })
})

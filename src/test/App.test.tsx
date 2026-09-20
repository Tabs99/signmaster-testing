import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'

vi.mock('../lib/auth/authService', () => ({
  authService: {
    getSession: vi.fn().mockResolvedValue(null),
    signOut: vi.fn(),
    signUp: vi.fn(),
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}))

vi.mock('../lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}))

describe('App', () => {
  it('renders the activation Step 1 screen at /activate', async () => {
    render(
      <MemoryRouter initialEntries={['/activate']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'Unlock your SignMaster app' }),
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Amazon order number')).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Check my order' }),
    ).toBeInTheDocument()
  })

  it('renders the forgot-password screen at /forgot-password', async () => {
    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Reset your password' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument()
  })

  it('renders the reset-password recovery route at /reset-password', async () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <App />
      </MemoryRouter>,
    )

    // No recovery session in this test → safe recovery copy (no account leak).
    expect(await screen.findByText("This reset link can't be used")).toBeInTheDocument()
  })

  it('guards /app: an unauthenticated visit redirects to sign-in without flashing protected content', async () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Sign in to SignMaster' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('SignMaster access is active.')).not.toBeInTheDocument()
  })
})

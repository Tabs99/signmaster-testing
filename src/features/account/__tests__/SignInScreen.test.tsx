import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SignInScreen from '../components/SignInScreen'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import type { SignInResult } from '../../../lib/auth/types'

vi.mock('../../../lib/api/activationContextApi', () => ({
  resolveActivationContext: vi.fn(),
}))

vi.mock('../../auth/context/AuthProvider', () => ({
  useAuthContext: vi.fn(),
}))

import { resolveActivationContext } from '../../../lib/api/activationContextApi'
import { useAuthContext } from '../../auth/context/AuthProvider'

const mockResolveActivationContext = vi.mocked(resolveActivationContext)
const mockUseAuthContext = vi.mocked(useAuthContext)

describe('SignInScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveActivationContext.mockResolvedValue({
      kind: 'status',
      status: 'VALID',
    })
    mockUseAuthContext.mockReturnValue({
      isInitializing: false,
      isAuthenticated: false,
      user: null,
      signOut: vi.fn(),
    })
  })

  it('renders email, password, and sign-in CTA', async () => {
    render(<SignInScreen />)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Sign in to SignMaster' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })

  it('shows validation errors for invalid input', async () => {
    const user = userEvent.setup()
    render(<SignInScreen />)

    await user.type(screen.getByLabelText('Email Address'), 'bad-email')
    await user.tab()
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.tab()

    expect(
      screen.getByText(/Enter a valid email address, for example/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Password does not meet the requirements.')).toBeInTheDocument()
  })

  it('shows loading state and prevents duplicate submit', async () => {
    const user = userEvent.setup()
    let resolveSignIn: (value: SignInResult) => void = () => undefined
    const signIn = vi.fn(
      (): Promise<SignInResult> =>
        new Promise((resolve) => {
          resolveSignIn = resolve
        }),
    )

    render(<SignInScreen signIn={signIn} />)

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
    await user.type(screen.getByLabelText('Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByText('Signing in…')).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Signing in…' }))
    expect(signIn).toHaveBeenCalledOnce()

    resolveSignIn({
      kind: 'success',
      user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
      session: {
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
      },
    })

    await waitFor(() => {
      expect(screen.getByText("You're signed in")).toBeInTheDocument()
    })
  })

  it('shows safe auth error messaging', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn().mockResolvedValue({
      kind: 'error',
      error: {
        code: 'invalid_credentials',
        message: AUTH_MESSAGES.genericSignInError,
      },
    })

    render(<SignInScreen signIn={signIn} />)

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
    await user.type(screen.getByLabelText('Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(AUTH_MESSAGES.genericSignInError)
    })
  })

  it('calls create-account navigation handler once', async () => {
    const user = userEvent.setup()
    const onCreateAccount = vi.fn()

    render(<SignInScreen onCreateAccount={onCreateAccount} />)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(onCreateAccount).toHaveBeenCalledOnce()
  })
})

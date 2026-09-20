import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SignInScreen from '../components/SignInScreen'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import type { SignInResult } from '../../../lib/auth/types'

vi.mock('../../auth/context/AuthProvider', () => ({
  useAuthContext: vi.fn(),
}))

import { useAuthContext } from '../../auth/context/AuthProvider'

const mockUseAuthContext = vi.mocked(useAuthContext)

const successResult: SignInResult = {
  kind: 'success',
  user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
  session: {
    user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
  },
}

describe('SignInScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthContext.mockReturnValue({
      isInitializing: false,
      isAuthenticated: false,
      user: null,
      signOut: vi.fn(),
    })
  })

  it('shows Continue with Google and email/password sign-in without Apple', async () => {
    render(<SignInScreen />)

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('invokes Google auth when Continue with Google is clicked', async () => {
    const user = userEvent.setup()
    const signInWithGoogle = vi.fn().mockResolvedValue({ kind: 'redirect_initiated' })

    render(<SignInScreen signInWithGoogle={signInWithGoogle} />)

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))

    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalledOnce()
    })
  })

  it('routes OAuth return through onEnterApp when already authenticated', async () => {
    const onEnterApp = vi.fn()
    mockUseAuthContext.mockReturnValue({
      isInitializing: false,
      isAuthenticated: true,
      user: { id: '1', email: 'google@example.invalid', emailConfirmed: true },
      signOut: vi.fn(),
    })

    render(<SignInScreen onEnterApp={onEnterApp} />)

    await waitFor(() => {
      expect(onEnterApp).toHaveBeenCalledOnce()
    })
  })

  it('invokes onEnterApp only once across parent rerenders after OAuth return', async () => {
    const onEnterApp = vi.fn()
    mockUseAuthContext.mockReturnValue({
      isInitializing: false,
      isAuthenticated: true,
      user: { id: '1', email: 'google@example.invalid', emailConfirmed: true },
      signOut: vi.fn(),
    })

    const view = render(<SignInScreen onEnterApp={onEnterApp} />)
    view.rerender(<SignInScreen onEnterApp={onEnterApp} />)
    view.rerender(<SignInScreen onEnterApp={onEnterApp} />)

    await waitFor(() => {
      expect(onEnterApp).toHaveBeenCalledTimes(1)
    })
  })

  it('shows safe retryable UI when Google OAuth initiation fails on sign-in', async () => {
    const user = userEvent.setup()
    const signInWithGoogle = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { code: 'unknown', message: 'We could not start Google sign-in.' },
    })

    render(<SignInScreen signInWithGoogle={signInWithGoogle} />)

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Google sign-in/i)
    })
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
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

  it('authenticates without depending on activation context availability', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn().mockResolvedValue(successResult)

    render(<SignInScreen signIn={signIn} />)

    // No activation-context notice is ever rendered on sign-in: authentication
    // is independent of the activation-context API.
    expect(
      screen.queryByTestId('activation-context-service-error-notice'),
    ).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
    await user.type(screen.getByLabelText('Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledOnce()
    })
    await waitFor(() => {
      expect(screen.getByText("You're signed in")).toBeInTheDocument()
    })
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

    resolveSignIn(successResult)

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

  it('exposes a Forgot password action', async () => {
    const user = userEvent.setup()
    const onForgotPassword = vi.fn()

    render(<SignInScreen onForgotPassword={onForgotPassword} />)

    const forgot = await screen.findByRole('button', { name: 'Forgot password?' })
    await user.click(forgot)

    expect(onForgotPassword).toHaveBeenCalledOnce()
  })

  it('auto-routes through the resolver once auth reflects the signed-in session', async () => {
    const user = userEvent.setup()
    const onEnterApp = vi.fn()
    const signIn = vi.fn().mockResolvedValue(successResult)
    let isAuthenticated = false

    mockUseAuthContext.mockImplementation(() => ({
      isInitializing: false,
      isAuthenticated,
      user: isAuthenticated
        ? { id: '1', email: 'alex@example.invalid', emailConfirmed: true }
        : null,
      signOut: vi.fn(),
    }))

    const view = render(<SignInScreen signIn={signIn} onEnterApp={onEnterApp} />)

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
    await user.type(screen.getByLabelText('Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    isAuthenticated = true
    view.rerender(<SignInScreen signIn={signIn} onEnterApp={onEnterApp} />)

    await waitFor(() => {
      expect(onEnterApp).toHaveBeenCalledOnce()
    })
  })

  it('offers a manual Continue hand-off to the resolver when auth has not yet settled', async () => {
    const user = userEvent.setup()
    const onEnterApp = vi.fn()
    const signIn = vi.fn().mockResolvedValue(successResult)

    // isAuthenticated stays false (auth event not yet observed), so the auto
    // hand-off is intentionally suppressed and the user gets a Continue button.
    render(<SignInScreen signIn={signIn} onEnterApp={onEnterApp} />)

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
    await user.type(screen.getByLabelText('Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const continueButton = await screen.findByRole('button', { name: 'Continue' })
    expect(onEnterApp).not.toHaveBeenCalled()

    await user.click(continueButton)

    expect(onEnterApp).toHaveBeenCalledOnce()
  })
})

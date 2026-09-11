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

vi.mock('../../activation/hooks/useActivationClaimWhenReady', () => ({
  useActivationClaimWhenReady: vi.fn(() => ({ state: { kind: 'idle' }, retry: vi.fn() })),
}))

import { resolveActivationContext } from '../../../lib/api/activationContextApi'
import { useAuthContext } from '../../auth/context/AuthProvider'
import { useActivationClaimWhenReady } from '../../activation/hooks/useActivationClaimWhenReady'

const mockResolveActivationContext = vi.mocked(resolveActivationContext)
const mockUseAuthContext = vi.mocked(useAuthContext)
const mockUseActivationClaimWhenReady = vi.mocked(useActivationClaimWhenReady)

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

  it('shows service error notice and blocks submit when context resolution fails', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn()
    mockResolveActivationContext.mockResolvedValue({ kind: 'service_unavailable' })

    render(<SignInScreen signIn={signIn} />)

    await waitFor(() => {
      expect(screen.getByTestId('activation-context-service-error-notice')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('activation-expired-notice')).not.toBeInTheDocument()
    expect(screen.queryByTestId('activation-context-missing-notice')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
    await user.type(screen.getByLabelText('Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(signIn).not.toHaveBeenCalled()
  })

  it('retries context resolution after failure', async () => {
    const user = userEvent.setup()
    mockResolveActivationContext
      .mockResolvedValueOnce({ kind: 'connection_error' })
      .mockResolvedValueOnce({ kind: 'status', status: 'VALID' })

    render(<SignInScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('activation-context-service-error-notice')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(screen.queryByTestId('activation-context-service-error-notice')).not.toBeInTheDocument()
    })
    expect(mockResolveActivationContext).toHaveBeenCalledTimes(2)
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

  it('exposes a Forgot password action', async () => {
    const user = userEvent.setup()
    const onForgotPassword = vi.fn()

    render(<SignInScreen onForgotPassword={onForgotPassword} />)

    const forgot = await screen.findByRole('button', { name: 'Forgot password?' })
    await user.click(forgot)

    expect(onForgotPassword).toHaveBeenCalledOnce()
  })

  it('requests claim when context and confirmed auth are ready', async () => {
    mockUseAuthContext.mockReturnValue({
      isInitializing: false,
      isAuthenticated: true,
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'alex@example.invalid',
        emailConfirmed: true,
      },
      signOut: vi.fn(),
    })

    render(<SignInScreen />)

    await waitFor(() => {
      expect(mockUseActivationClaimWhenReady).toHaveBeenCalledWith(
        expect.objectContaining({ ready: true }),
      )
    })
  })

  it('routes onward through the resolver via a Continue action after sign in', async () => {
    const user = userEvent.setup()
    const onEnterApp = vi.fn()
    const signIn = vi.fn().mockResolvedValue({
      kind: 'success',
      user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
      session: {
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
      },
    })

    render(<SignInScreen signIn={signIn} onEnterApp={onEnterApp} />)

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
    await user.type(screen.getByLabelText('Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const continueButton = await screen.findByRole('button', { name: 'Continue' })
    await user.click(continueButton)

    expect(onEnterApp).toHaveBeenCalledOnce()
  })

  it('does not request claim for unconfirmed authenticated users', async () => {
    mockUseAuthContext.mockReturnValue({
      isInitializing: false,
      isAuthenticated: false,
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'alex@example.invalid',
        emailConfirmed: false,
      },
      signOut: vi.fn(),
    })

    render(<SignInScreen />)

    await waitFor(() => {
      expect(mockUseActivationClaimWhenReady).toHaveBeenCalledWith(
        expect.objectContaining({ ready: false }),
      )
    })
  })
})

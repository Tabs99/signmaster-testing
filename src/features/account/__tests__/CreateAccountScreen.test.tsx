import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateAccountScreen from '../components/CreateAccountScreen'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import type { SignUpResult } from '../types'

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

describe('CreateAccountScreen', () => {
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

  it('renders all form fields, labels, and CTA button correctly', async () => {
    render(<CreateAccountScreen />)

    expect(screen.getByRole('img', { name: 'SignMaster' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Purchase verified')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('heading', { name: 'Create your SignMaster account' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
    expect(screen.getByLabelText('Create Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create Account & Continue' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows missing-context notice when no activation context exists', async () => {
    mockResolveActivationContext.mockResolvedValue({
      kind: 'status',
      status: 'NONE',
    })

    render(<CreateAccountScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('activation-context-missing-notice')).toBeInTheDocument()
    })
    expect(screen.queryByText('Purchase verified')).not.toBeInTheDocument()
  })

  it('shows expired notice for expired activation contexts', async () => {
    mockResolveActivationContext.mockResolvedValue({
      kind: 'status',
      status: 'EXPIRED',
    })

    render(<CreateAccountScreen onRestartActivation={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('activation-expired-notice')).toBeInTheDocument()
    })
  })

  it('shows service error notice and blocks submit when context resolution fails', async () => {
    const user = userEvent.setup()
    const signUp = vi.fn()
    mockResolveActivationContext.mockResolvedValue({ kind: 'service_unavailable' })

    render(<CreateAccountScreen signUp={signUp} />)

    await waitFor(() => {
      expect(screen.getByTestId('activation-context-service-error-notice')).toBeInTheDocument()
    })

    expect(screen.queryByText('Purchase verified')).not.toBeInTheDocument()
    expect(screen.queryByTestId('activation-expired-notice')).not.toBeInTheDocument()
    expect(screen.queryByTestId('activation-context-missing-notice')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
    await user.type(screen.getByLabelText('Create Password'), 'Secure123!')
    await user.type(screen.getByLabelText('Confirm Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

    expect(signUp).not.toHaveBeenCalled()
  })

  it('retries context resolution and restores verified badge on success', async () => {
    const user = userEvent.setup()
    mockResolveActivationContext
      .mockResolvedValueOnce({ kind: 'connection_error' })
      .mockResolvedValueOnce({ kind: 'status', status: 'VALID' })

    render(<CreateAccountScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('activation-context-service-error-notice')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(screen.getByText('Purchase verified')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('activation-context-service-error-notice')).not.toBeInTheDocument()
    expect(mockResolveActivationContext).toHaveBeenCalledTimes(2)
  })

  it('displays validation errors when fields are invalid after blur', async () => {
    const user = userEvent.setup()
    render(<CreateAccountScreen />)

    await user.type(screen.getByLabelText('Email Address'), 'not-an-email')
    await user.tab()
    await user.type(screen.getByLabelText('Create Password'), 'short')
    await user.tab()
    await user.type(screen.getByLabelText('Confirm Password'), 'different')
    await user.tab()

    expect(
      screen.getByText(/Enter a valid email address, for example/i),
    ).toBeInTheDocument()
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument()
    expect(
      screen.getByText("Passwords don't match. Please try again."),
    ).toBeInTheDocument()
  })

  it('shows loading state and completes successful signup without entitlement messaging', async () => {
    const user = userEvent.setup()
    let resolveSignUp: (value: SignUpResult) => void = () => undefined
    const signUp = vi.fn(
      (): Promise<SignUpResult> =>
        new Promise((resolve) => {
          resolveSignUp = resolve
        }),
    )

    render(<CreateAccountScreen signUp={signUp} />)

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
    await user.type(screen.getByLabelText('Create Password'), 'Secure123!')
    await user.type(screen.getByLabelText('Confirm Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

    expect(screen.getByText('Creating your account…')).toBeInTheDocument()
    expect(signUp).toHaveBeenCalledOnce()

    resolveSignUp({
      kind: 'success',
      user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
      session: {
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Account created!')).toBeInTheDocument()
      expect(
        screen.getByText(/Activation will continue in a later step/i),
      ).toBeInTheDocument()
      expect(screen.queryByText(/companion app is ready/i)).not.toBeInTheDocument()
    })
  })

  it('shows existing-account alert with non-enumerating copy for duplicate registration', async () => {
    const user = userEvent.setup()
    const signUp = vi.fn().mockResolvedValue({
      kind: 'error',
      error: {
        code: 'email_already_registered',
        message: AUTH_MESSAGES.emailAlreadyRegistered,
      },
    })

    render(<CreateAccountScreen signUp={signUp} />)

    await user.type(screen.getByLabelText('Email Address'), 'exists@example.invalid')
    await user.type(screen.getByLabelText('Create Password'), 'Secure123!')
    await user.type(screen.getByLabelText('Confirm Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

    await waitFor(() => {
      expect(
        screen.getByText(/We could not create your account. If you already have one, try signing in./i),
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/An account already exists with this email/i),
      ).not.toBeInTheDocument()
    })
  })

  it('shows email confirmation state when sign-up requires confirmation', async () => {
    const user = userEvent.setup()
    const signUp = vi.fn().mockResolvedValue({
      kind: 'email_confirmation_required',
      user: { id: '2', email: 'pending@example.invalid', emailConfirmed: false },
    })

    render(<CreateAccountScreen signUp={signUp} />)

    await user.type(screen.getByLabelText('Email Address'), 'pending@example.invalid')
    await user.type(screen.getByLabelText('Create Password'), 'Secure123!')
    await user.type(screen.getByLabelText('Confirm Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

    await waitFor(() => {
      expect(screen.getByText('Confirm your email')).toBeInTheDocument()
      expect(screen.getByText(AUTH_MESSAGES.emailConfirmationRequired)).toBeInTheDocument()
    })
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

    render(<CreateAccountScreen />)

    await waitFor(() => {
      expect(mockUseActivationClaimWhenReady).toHaveBeenCalledWith(
        expect.objectContaining({ ready: true }),
      )
    })
  })

  it('does not request claim while context resolution is in error', async () => {
    mockResolveActivationContext.mockResolvedValue({ kind: 'service_unavailable' })

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

    render(<CreateAccountScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('activation-context-service-error-notice')).toBeInTheDocument()
    })

    expect(mockUseActivationClaimWhenReady).toHaveBeenCalledWith(
      expect.objectContaining({ ready: false }),
    )
  })
})

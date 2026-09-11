import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ResetPasswordScreen from '../components/ResetPasswordScreen'
import { AUTH_MESSAGES, type PasswordUpdateResult } from '../../../lib/auth/types'

vi.mock('../../auth/context/AuthProvider', () => ({
  useAuthContext: vi.fn(),
}))

import { useAuthContext } from '../../auth/context/AuthProvider'

const mockUseAuthContext = vi.mocked(useAuthContext)

const NEW_PASSWORD = 'NewSecure123!'
const CONFIRMED_USER = {
  id: '00000000-0000-4000-8000-000000000009',
  email: 'recovery@example.invalid',
  emailConfirmed: true,
}

function recoveryContext(overrides: Record<string, unknown> = {}) {
  return {
    isInitializing: false,
    isAuthenticated: true,
    isPasswordRecovery: true,
    user: CONFIRMED_USER,
    signOut: vi.fn(),
    ...overrides,
  }
}

async function fillPasswords(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('New Password'), NEW_PASSWORD)
  await user.type(screen.getByLabelText('Confirm New Password'), NEW_PASSWORD)
}

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthContext.mockReturnValue(recoveryContext() as never)
  })

  it('shows a checking state while auth is initializing', () => {
    mockUseAuthContext.mockReturnValue(
      recoveryContext({ isInitializing: true, user: null, isAuthenticated: false, isPasswordRecovery: false }) as never,
    )

    render(<ResetPasswordScreen updatePassword={vi.fn()} />)

    expect(screen.getByTestId('reset-password-checking')).toBeInTheDocument()
  })

  it('shows safe recovery copy when there is no recovery session', async () => {
    mockUseAuthContext.mockReturnValue(
      recoveryContext({ user: null, isAuthenticated: false, isPasswordRecovery: false }) as never,
    )
    const onRequestNewLink = vi.fn()
    const onSignIn = vi.fn()
    const updatePassword = vi.fn()

    render(
      <ResetPasswordScreen
        updatePassword={updatePassword}
        onRequestNewLink={onRequestNewLink}
        onSignIn={onSignIn}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText("This reset link can't be used")).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Request a new link' }))
    expect(onRequestNewLink).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(onSignIn).toHaveBeenCalledOnce()
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('renders the reset form when a recovery session exists', () => {
    render(<ResetPasswordScreen updatePassword={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.getByLabelText('New Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument()
  })

  it('renders the form for a persisted session even without the recovery event', () => {
    mockUseAuthContext.mockReturnValue(recoveryContext({ isPasswordRecovery: false }) as never)

    render(<ResetPasswordScreen updatePassword={vi.fn()} />)

    expect(screen.getByLabelText('New Password')).toBeInTheDocument()
  })

  it('blocks submit when passwords do not meet the rules', async () => {
    const user = userEvent.setup()
    const updatePassword = vi.fn()

    render(<ResetPasswordScreen updatePassword={updatePassword} />)

    await user.type(screen.getByLabelText('New Password'), 'short')
    await user.type(screen.getByLabelText('Confirm New Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('blocks submit and shows a mismatch error when passwords differ', async () => {
    const user = userEvent.setup()
    const updatePassword = vi.fn()

    render(<ResetPasswordScreen updatePassword={updatePassword} />)

    await user.type(screen.getByLabelText('New Password'), NEW_PASSWORD)
    await user.type(screen.getByLabelText('Confirm New Password'), 'Different123!')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(screen.getByText(/Passwords don't match/i)).toBeInTheDocument()
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('updates the password and shows the success state', async () => {
    const user = userEvent.setup()
    const updatePassword = vi
      .fn()
      .mockResolvedValue({ kind: 'success', user: CONFIRMED_USER } as PasswordUpdateResult)
    const onContinue = vi.fn()

    render(<ResetPasswordScreen updatePassword={updatePassword} onContinue={onContinue} />)

    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => {
      expect(screen.getByTestId('reset-password-success')).toBeInTheDocument()
    })
    expect(updatePassword).toHaveBeenCalledWith(NEW_PASSWORD)

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('shows loading state and prevents duplicate submits', async () => {
    const user = userEvent.setup()
    let resolveUpdate: (value: PasswordUpdateResult) => void = () => undefined
    const updatePassword = vi.fn(
      (): Promise<PasswordUpdateResult> =>
        new Promise((resolve) => {
          resolveUpdate = resolve
        }),
    )

    render(<ResetPasswordScreen updatePassword={updatePassword} />)

    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(screen.getByText('Updating password…')).toBeInTheDocument()
    expect(updatePassword).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Updating password…' }))
    expect(updatePassword).toHaveBeenCalledOnce()

    resolveUpdate({ kind: 'success', user: CONFIRMED_USER })
    await waitFor(() => {
      expect(screen.getByTestId('reset-password-success')).toBeInTheDocument()
    })
  })

  it('routes to safe recovery when the recovery session is invalid at submit', async () => {
    const user = userEvent.setup()
    const updatePassword = vi
      .fn()
      .mockResolvedValue({ kind: 'invalid_recovery_session' } as PasswordUpdateResult)

    render(<ResetPasswordScreen updatePassword={updatePassword} onRequestNewLink={vi.fn()} />)

    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => {
      expect(screen.getByText("This reset link can't be used")).toBeInTheDocument()
    })
  })

  it('shows a retryable alert on transient failures without leaking raw errors', async () => {
    const user = userEvent.setup()
    const updatePassword = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'connection_error' } as PasswordUpdateResult)
      .mockResolvedValueOnce({ kind: 'success', user: CONFIRMED_USER } as PasswordUpdateResult)

    render(<ResetPasswordScreen updatePassword={updatePassword} />)

    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        AUTH_MESSAGES.passwordUpdateTemporaryFailure,
      )
    })

    // Still on the form and able to retry.
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    await waitFor(() => {
      expect(screen.getByTestId('reset-password-success')).toBeInTheDocument()
    })
    expect(updatePassword).toHaveBeenCalledTimes(2)
  })

  it('does not trigger an activation claim (recovery is not entitlement)', () => {
    // The screen must not import/trigger the claim hook — signalled by the
    // absence of any activation claim result in the recovery form view.
    render(<ResetPasswordScreen updatePassword={vi.fn()} />)

    expect(screen.queryByText(/SignMaster is activated/i)).not.toBeInTheDocument()
  })
})

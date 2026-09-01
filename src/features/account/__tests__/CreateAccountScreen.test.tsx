import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateAccountScreen from '../components/CreateAccountScreen'
import { ACCOUNT_STORAGE_KEY } from '../types'

describe('CreateAccountScreen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders all form fields, labels, and CTA button correctly', () => {
    render(<CreateAccountScreen />)

    expect(screen.getByText('Purchase verified')).toBeInTheDocument()
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

  it('successfully submits and updates localStorage when valid data is entered', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()

    render(<CreateAccountScreen onComplete={onComplete} />)

    await user.type(screen.getByLabelText('Email Address'), 'alex@example.com')
    await user.type(screen.getByLabelText('Create Password'), 'Secure123!')
    await user.type(screen.getByLabelText('Confirm Password'), 'Secure123!')
    await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

    expect(screen.getByText('Creating your account…')).toBeInTheDocument()

    await waitFor(
      () => {
        expect(localStorage.getItem(ACCOUNT_STORAGE_KEY)).toBe('true')
        expect(onComplete).toHaveBeenCalledOnce()
        expect(screen.getByText('Account created!')).toBeInTheDocument()
      },
      { timeout: 3000 },
    )
  })
})

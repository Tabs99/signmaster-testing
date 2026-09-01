import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActivationForm from '../components/ActivationForm'
import { ACTIVATION_STORAGE_KEY } from '../types'

describe('ActivationForm', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('renders all form fields, labels, and CTA button correctly', () => {
    render(<ActivationForm />)

    expect(screen.getByRole('img', { name: 'SignMaster' })).toBeInTheDocument()
    expect(
      screen.getByText('Master the Road. One Sign at a Time.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Verify Your Purchase' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Enter your Amazon order details to unlock your free SignMaster companion app.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Amazon Order ID')).toBeInTheDocument()
    expect(screen.getByLabelText('Delivery Postcode')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Verify Order & Continue' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Where can I find this?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get Help' })).toBeInTheDocument()
  })

  it('displays validation errors when submitting empty or invalid formats', async () => {
    const user = userEvent.setup()
    render(<ActivationForm />)

    await user.click(screen.getByLabelText('Amazon Order ID'))
    await user.tab()
    await user.click(screen.getByLabelText('Delivery Postcode'))
    await user.tab()

    expect(
      screen.getByText(/Enter a valid Amazon Order ID, for example/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Enter a valid UK delivery postcode, for example/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Amazon Order ID')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('Delivery Postcode')).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    await user.clear(screen.getByLabelText('Amazon Order ID'))
    await user.type(screen.getByLabelText('Amazon Order ID'), 'invalid-order')
    await user.tab()
    await user.clear(screen.getByLabelText('Delivery Postcode'))
    await user.type(screen.getByLabelText('Delivery Postcode'), 'NOT A POSTCODE')
    await user.tab()

    expect(
      screen.getByText(/Enter a valid Amazon Order ID, for example/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Enter a valid UK delivery postcode, for example/i),
    ).toBeInTheDocument()
  })

  it('successfully submits and updates localStorage when valid data is entered', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()

    render(<ActivationForm onSuccess={onSuccess} />)

    await user.type(
      screen.getByLabelText('Amazon Order ID'),
      '111-1111111-1111111',
    )
    await user.type(screen.getByLabelText('Delivery Postcode'), 'SW1A 1AA')
    await user.click(screen.getByRole('button', { name: 'Verify Order & Continue' }))

    expect(screen.getByText('Verifying…')).toBeInTheDocument()

    await waitFor(
      () => {
        expect(localStorage.getItem(ACTIVATION_STORAGE_KEY)).toBe('true')
        expect(onSuccess).toHaveBeenCalledOnce()
      },
      { timeout: 3000 },
    )
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ActivationRequiredScreen from '../ActivationRequiredScreen.tsx'

describe('ActivationRequiredScreen (frozen state B10)', () => {
  it('renders the frozen heading, body, and forward paths', () => {
    render(
      <ActivationRequiredScreen
        onVerifyOrder={vi.fn()}
        onUseAnotherAccount={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Finish activating SignMaster' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Your account is ready. Verify your Amazon order to activate access.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify my order' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use another account' })).toBeInTheDocument()

    const support = screen.getByRole('link', { name: 'Get support' })
    expect(support).toHaveAttribute('href', expect.stringContaining('mailto:'))
  })

  it('invokes the verify handler', async () => {
    const user = userEvent.setup()
    const onVerifyOrder = vi.fn()

    render(
      <ActivationRequiredScreen
        onVerifyOrder={onVerifyOrder}
        onUseAnotherAccount={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Verify my order' }))
    expect(onVerifyOrder).toHaveBeenCalledOnce()
  })

  it('invokes the use-another-account handler', async () => {
    const user = userEvent.setup()
    const onUseAnotherAccount = vi.fn()

    render(
      <ActivationRequiredScreen
        onVerifyOrder={vi.fn()}
        onUseAnotherAccount={onUseAnotherAccount}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Use another account' }))
    expect(onUseAnotherAccount).toHaveBeenCalledOnce()
  })

  it('does not expose any order/entitlement identifier', () => {
    const { container } = render(
      <ActivationRequiredScreen
        onVerifyOrder={vi.fn()}
        onUseAnotherAccount={vi.fn()}
      />,
    )

    expect(container.textContent).not.toMatch(/\d{3}-\d{7}-\d{7}/)
  })
})

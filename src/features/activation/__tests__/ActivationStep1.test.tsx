import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActivationStep1 from '../components/ActivationStep1'
import { VALIDATION_MESSAGES } from '../utils/validation'

describe('ActivationStep1', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders approved essential Step 1 content', () => {
    render(<ActivationStep1 />)

    expect(screen.getAllByRole('img', { name: 'SignMaster' }).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Master the Road. One Sign at a Time.').length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText('Step 1 of 2 · Verify purchase'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Unlock your SignMaster app' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Enter the Amazon order number for your 101 UK Road Sign Flashcards/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Check my order' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Your order number is used only to verify your purchase/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get support' })).toBeInTheDocument()
  })

  it('shows only the Amazon order number field for purchase verification', () => {
    render(<ActivationStep1 />)

    expect(screen.getByLabelText('Amazon order number')).toBeInTheDocument()
    expect(screen.queryByLabelText(/postcode/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/delivery/i)).not.toBeInTheDocument()
  })

  it('formats order IDs while typing and accepts paste', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 />)

    const field = screen.getByLabelText('Amazon order number')
    await user.type(field, '20512345671234567')
    expect(field).toHaveValue('205-1234567-1234567')
    expect(screen.getByText('✓ Looks right')).toBeInTheDocument()

    await user.clear(field)
    await user.click(field)
    await user.paste('11111111111111111')
    expect(field).toHaveValue('111-1111111-1111111')
  })

  it('shows accessible validation errors for invalid order IDs', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 />)

    const field = screen.getByLabelText('Amazon order number')
    await user.click(field)
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      VALIDATION_MESSAGES.orderIdRequired,
    )
    expect(field).toHaveAttribute('aria-invalid', 'true')

    await user.type(field, '205-12345')
    await user.tab()

    expect(screen.getByRole('alert')).toHaveTextContent(
      VALIDATION_MESSAGES.orderIdInvalid,
    )
    expect(field).toHaveValue('205-12345')
  })

  it('submits with Enter and does not call the verify API or write localStorage', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<ActivationStep1 />)

    const field = screen.getByLabelText('Amazon order number')
    await user.type(field, '205-1234567-1234567')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(fetchSpy).not.toHaveBeenCalled()
    })
    expect(localStorage.length).toBe(0)
    expect(
      screen.queryByRole('heading', { name: 'Create your SignMaster account' }),
    ).not.toBeInTheDocument()
  })

  it('opens and closes the help sheet from Show me where', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 />)

    const showMeWhere = screen.getByRole('button', { name: 'Show me where' })
    await user.click(showMeWhere)

    expect(
      screen.getByRole('dialog', { name: 'Finding your Amazon order number' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 · Where do I find my Order ID?')).toBeInTheDocument()
    expect(
      screen.getByText(/Open your Amazon order confirmation email/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to activation' }))

    await waitFor(
      () => {
        expect(
          screen.queryByRole('dialog', { name: 'Finding your Amazon order number' }),
        ).not.toBeInTheDocument()
        expect(document.activeElement).toBe(showMeWhere)
      },
      { timeout: 1000 },
    )
  })

  it('opens help from Get support', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 />)

    await user.click(screen.getByRole('button', { name: 'Get support' }))

    expect(
      screen.getByRole('dialog', { name: 'Finding your Amazon order number' }),
    ).toBeInTheDocument()
    expect(screen.getByText('3 · I still need help')).toBeInTheDocument()
    expect(screen.getByText('support@signmastercards.co.uk')).toBeInTheDocument()
  })

  describe('HelpSheet focus management', () => {
    it('moves focus to the close control when opened from Show me where', async () => {
      const user = userEvent.setup()
      render(<ActivationStep1 />)

      await user.click(screen.getByRole('button', { name: 'Show me where' }))

      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close help' }),
      )
    })

    it('keeps Tab focus inside the HelpSheet', async () => {
      const user = userEvent.setup()
      render(<ActivationStep1 />)

      await user.click(screen.getByRole('button', { name: 'Show me where' }))

      const backButton = screen.getByRole('button', { name: 'Back to activation' })
      backButton.focus()
      await user.tab()

      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close help' }),
      )
    })

    it('keeps Shift+Tab focus inside the HelpSheet', async () => {
      const user = userEvent.setup()
      render(<ActivationStep1 />)

      await user.click(screen.getByRole('button', { name: 'Show me where' }))

      const closeButton = screen.getByRole('button', { name: 'Close help' })
      closeButton.focus()
      await user.tab({ shift: true })

      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Back to activation' }),
      )
    })

    it('closes on Escape and restores focus to Show me where', async () => {
      const user = userEvent.setup()
      render(<ActivationStep1 />)

      const showMeWhere = screen.getByRole('button', { name: 'Show me where' })
      await user.click(showMeWhere)
      await user.keyboard('{Escape}')

      await waitFor(
        () => {
          expect(
            screen.queryByRole('dialog', { name: 'Finding your Amazon order number' }),
          ).not.toBeInTheDocument()
          expect(document.activeElement).toBe(showMeWhere)
        },
        { timeout: 1000 },
      )
    })

    it('restores focus to Get support when opened from there and closed with Escape', async () => {
      const user = userEvent.setup()
      render(<ActivationStep1 />)

      const getSupport = screen.getByRole('button', { name: 'Get support' })
      await user.click(getSupport)
      await user.keyboard('{Escape}')

      await waitFor(
        () => {
          expect(
            screen.queryByRole('dialog', { name: 'Finding your Amazon order number' }),
          ).not.toBeInTheDocument()
          expect(document.activeElement).toBe(getSupport)
        },
        { timeout: 1000 },
      )
    })
  })
})

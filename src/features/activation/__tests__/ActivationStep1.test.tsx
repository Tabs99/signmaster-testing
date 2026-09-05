import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActivationStep1 from '../components/ActivationStep1'
import { VALIDATION_MESSAGES } from '../utils/validation'

const ORDER_HELP_DIALOG = 'Finding your Amazon order number'
const SUPPORT_HELP_DIALOG = 'SignMaster activation help'

function getHelpDialog(name = ORDER_HELP_DIALOG) {
  return screen.getByRole('dialog', { name })
}

function expectSectionExpanded(title: string, dialogName = ORDER_HELP_DIALOG) {
  const dialog = getHelpDialog(dialogName)
  const sectionButton = within(dialog).getByRole('button', { name: title })
  expect(sectionButton).toHaveAttribute('aria-expanded', 'true')
}

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
      screen.getByText(/Enter the Amazon order number for your/i),
    ).toBeInTheDocument()
    expect(screen.getByText('101 UK Road Sign Flashcards')).toHaveClass('font-semibold')
    expect(
      screen.getByText(/App access is included with your pack at no extra cost/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Check my order' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Your order number is used only to verify your purchase and manage your SignMaster access.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Never for marketing/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get support' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Take your road sign practice further.' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Practise all 101 UK road signs with quizzes and progress tracking, included with your flashcard pack/i,
      ),
    ).toBeInTheDocument()
  })

  it('shows only the Amazon order number field for purchase verification', () => {
    render(<ActivationStep1 />)

    expect(screen.getByLabelText('Amazon order number')).toBeInTheDocument()
    expect(
      screen.getByText(/Find it in your Amazon confirmation email or order details/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show me where' })).toBeInTheDocument()
    expect(screen.queryByText(/Returns & Orders/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/postcode/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/delivery/i)).not.toBeInTheDocument()
  })

  it('formats order IDs while typing and accepts paste', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 />)

    const field = screen.getByLabelText('Amazon order number')
    await user.type(field, '20512345671234567')
    expect(field).toHaveValue('205-1234567-1234567')
    expect(screen.getByText('17/17 digits')).toBeInTheDocument()
    expect(screen.queryByText(/Looks right/i)).not.toBeInTheDocument()

    await user.clear(field)
    await user.click(field)
    await user.paste('11111111111111111')
    expect(field).toHaveValue('111-1111111-1111111')
    expect(screen.getByText('17/17 digits')).toBeInTheDocument()
  })

  it('shows 17/17 digits for repeated-digit order IDs without verification feedback', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 />)

    const field = screen.getByLabelText('Amazon order number')
    await user.type(field, '00000000000000000')

    expect(field).toHaveValue('000-0000000-0000000')
    expect(screen.getByText('17/17 digits')).toBeInTheDocument()
    expect(screen.queryByText(/Looks right/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check my order' })).toBeEnabled()
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

  it('opens the first help section from Show me where with the order-number title', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 />)

    const showMeWhere = screen.getByRole('button', { name: 'Show me where' })
    await user.click(showMeWhere)

    expect(getHelpDialog(ORDER_HELP_DIALOG)).toBeInTheDocument()
    expectSectionExpanded('Where do I find my Order ID?', ORDER_HELP_DIALOG)
    expect(screen.getByText(/Amazon app:/)).toBeInTheDocument()
    expect(screen.getByText(/Amazon website:/)).toBeInTheDocument()
    expect(screen.getByText(/tap your profile icon, then Your Orders/i)).toBeInTheDocument()
    expect(screen.getByText(/select Returns & Orders/i)).toBeInTheDocument()
    expect(
      screen.getByText(
        /Open the order containing your SignMaster flashcards and view the order details/i,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/You can also find the order number in your Amazon order confirmation email/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/17 digits in 3 groups: 3 digits, 7 digits and 7 digits/i),
    ).toBeInTheDocument()
  })

  it('opens and closes the help sheet from Show me where', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 />)

    const showMeWhere = screen.getByRole('button', { name: 'Show me where' })
    await user.click(showMeWhere)

    await user.click(screen.getByRole('button', { name: 'Back to activation' }))

    await waitFor(
      () => {
        expect(
          screen.queryByRole('dialog', { name: ORDER_HELP_DIALOG }),
        ).not.toBeInTheDocument()
        expect(document.activeElement).toBe(showMeWhere)
      },
      { timeout: 1000 },
    )
  })

  it('opens the support help section from Get support with the activation-help title', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 />)

    const getSupport = screen.getByRole('button', { name: 'Get support' })
    expect(getSupport.tagName).toBe('BUTTON')
    await user.click(getSupport)

    expect(getHelpDialog(SUPPORT_HELP_DIALOG)).toBeInTheDocument()
    expectSectionExpanded('I still need help', SUPPORT_HELP_DIALOG)
    expect(screen.getByText('support@signmastercards.co.uk')).toBeInTheDocument()
    expect(
      screen.getByText(/Never include payment or card details. Your Order ID is enough./i),
    ).toBeInTheDocument()
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
            screen.queryByRole('dialog', { name: ORDER_HELP_DIALOG }),
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
            screen.queryByRole('dialog', { name: SUPPORT_HELP_DIALOG }),
          ).not.toBeInTheDocument()
          expect(document.activeElement).toBe(getSupport)
        },
        { timeout: 1000 },
      )
    })
  })
})

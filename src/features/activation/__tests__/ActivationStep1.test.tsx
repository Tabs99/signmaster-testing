import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivationVerifyResult } from '../../../lib/api/activationApi'
import ActivationStep1 from '../components/ActivationStep1'
import { VALIDATION_MESSAGES } from '../utils/validation'

const ORDER_HELP_DIALOG = 'Finding your Amazon order number'
const SUPPORT_HELP_DIALOG = 'SignMaster activation help'
const VALID_ORDER_ID = '205-1234567-1234567'
const VALID_ORDER_ID_DIGITS = '20512345671234567'

function getHelpDialog(name = ORDER_HELP_DIALOG) {
  return screen.getByRole('dialog', { name })
}

function expectSectionExpanded(title: string, dialogName = ORDER_HELP_DIALOG) {
  const dialog = getHelpDialog(dialogName)
  const sectionButton = within(dialog).getByRole('button', { name: title })
  expect(sectionButton).toHaveAttribute('aria-expanded', 'true')
}

function createVerifyMock(result: ActivationVerifyResult) {
  return vi.fn().mockResolvedValue(result)
}

function createPendingVerifyMock() {
  let resolveVerify: (value: ActivationVerifyResult) => void = () => undefined
  const verifyOrder = vi.fn().mockImplementation(
    () =>
      new Promise<ActivationVerifyResult>((resolve) => {
        resolveVerify = resolve
      }),
  )
  return { verifyOrder, resolveVerify: (value: ActivationVerifyResult) => resolveVerify(value) }
}

async function typeValidOrderId(user: ReturnType<typeof userEvent.setup>) {
  const field = screen.getByLabelText('Amazon order number')
  await user.type(field, VALID_ORDER_ID_DIGITS)
  return field
}

async function submitOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Check my order' }))
}

function expectNoStorageWrites() {
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
}

function expectCheckingButton(button: HTMLElement) {
  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(button).toBeDisabled()
  expect(button.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
}

describe('ActivationStep1', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders approved essential Step 1 content', () => {
    render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

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
    render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

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
    render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

    const field = screen.getByLabelText('Amazon order number')
    await user.type(field, VALID_ORDER_ID_DIGITS)
    expect(field).toHaveValue(VALID_ORDER_ID)
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
    render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

    const field = screen.getByLabelText('Amazon order number')
    await user.type(field, '00000000000000000')

    expect(field).toHaveValue('000-0000000-0000000')
    expect(screen.getByText('17/17 digits')).toBeInTheDocument()
    expect(screen.queryByText(/Looks right/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check my order' })).toBeEnabled()
  })

  it('shows accessible validation errors for invalid order IDs', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

    const field = screen.getByLabelText('Amazon order number')
    await user.click(field)
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      VALIDATION_MESSAGES.orderIdRequired,
    )
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Show me where' })).toBeInTheDocument()

    await user.type(field, '205-12345')
    await user.tab()

    expect(screen.getByRole('alert')).toHaveTextContent(
      VALIDATION_MESSAGES.orderIdInvalid,
    )
    expect(field).toHaveValue('205-12345')
    expect(screen.getByRole('button', { name: 'Show me where' })).toBeInTheDocument()
  })

  it('submits with Enter and does not call the verify API or write localStorage', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const verifyOrder = createVerifyMock({
      kind: 'business_status',
      status: 'ELIGIBLE',
    })

    render(<ActivationStep1 verifyOrder={verifyOrder} />)

    const field = screen.getByLabelText('Amazon order number')
    await user.type(field, VALID_ORDER_ID)
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(fetchSpy).not.toHaveBeenCalled()
    })
    expectNoStorageWrites()
    expect(
      screen.queryByRole('heading', { name: 'Create your SignMaster account' }),
    ).not.toBeInTheDocument()
  })

  it('opens the first help section from Show me where with the order-number title', async () => {
    const user = userEvent.setup()
    render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

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
    render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

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
    render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

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
      render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

      await user.click(screen.getByRole('button', { name: 'Show me where' }))

      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close help' }),
      )
    })

    it('keeps Tab focus inside the HelpSheet', async () => {
      const user = userEvent.setup()
      render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

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
      render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

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
      render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

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
      render(<ActivationStep1 verifyOrder={createVerifyMock({ kind: 'service_unavailable' })} />)

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

  describe('order verification (Task 2)', () => {
    describe('A4 checking state', () => {
      it('shows checking state with a single verify call', async () => {
        const user = userEvent.setup()
        const { verifyOrder, resolveVerify } = createPendingVerifyMock()

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        expect(verifyOrder).toHaveBeenCalledTimes(1)
        expect(verifyOrder).toHaveBeenCalledWith(VALID_ORDER_ID)
        const checkingButton = screen.getByRole('button', { name: 'Checking your order…' })
        expectCheckingButton(checkingButton)
        expect(
          screen.queryByRole('button', { name: 'Check my order' }),
        ).not.toBeInTheDocument()

        resolveVerify({ kind: 'business_status', status: 'ELIGIBLE' })

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
      })

      it('disables the order field while checking', async () => {
        const user = userEvent.setup()
        const { verifyOrder, resolveVerify } = createPendingVerifyMock()

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        const field = await typeValidOrderId(user)
        await submitOrder(user)

        expect(field).toBeDisabled()
        expect(field).toHaveAttribute('aria-disabled', 'true')

        resolveVerify({ kind: 'business_status', status: 'ELIGIBLE' })

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
      })

      it('sets aria-busy on the submit button while checking', async () => {
        const user = userEvent.setup()
        const { verifyOrder, resolveVerify } = createPendingVerifyMock()

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        const checkingButton = screen.getByRole('button', { name: 'Checking your order…' })
        expectCheckingButton(checkingButton)

        resolveVerify({ kind: 'business_status', status: 'ELIGIBLE' })

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
      })

      it('blocks duplicate clicks while verification is in flight', async () => {
        const user = userEvent.setup()
        const { verifyOrder, resolveVerify } = createPendingVerifyMock()

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        const checkingButton = screen.getByRole('button', { name: 'Checking your order…' })
        await user.click(checkingButton)
        await user.click(checkingButton)

        expect(verifyOrder).toHaveBeenCalledTimes(1)

        resolveVerify({ kind: 'business_status', status: 'ELIGIBLE' })

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
      })

      it('blocks duplicate Enter submissions while verification is in flight', async () => {
        const user = userEvent.setup()
        const { verifyOrder, resolveVerify } = createPendingVerifyMock()

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await user.keyboard('{Enter}')
        await user.keyboard('{Enter}')

        expect(verifyOrder).toHaveBeenCalledTimes(1)

        resolveVerify({ kind: 'business_status', status: 'ELIGIBLE' })

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
      })
    })

    describe('A5 ELIGIBLE', () => {
      it('shows eligible heading and body copy', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'ELIGIBLE',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.getByText('Your SignMaster purchase has been verified.'),
        ).toBeInTheDocument()
        expect(
          screen.getByText(
            'Next, create an account or sign in to activate access and save your progress.',
          ),
        ).toBeInTheDocument()
        expect(screen.getByText(VALID_ORDER_ID)).toBeInTheDocument()
        expectNoStorageWrites()
        expect(
          screen.queryByRole('heading', { name: 'Create your SignMaster account' }),
        ).not.toBeInTheDocument()
      })

      it('does not show Continue without onContinueToAccount', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'ELIGIBLE',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.queryByRole('button', { name: 'Continue to account setup' }),
        ).not.toBeInTheDocument()
      })

      it('shows Continue and calls onContinueToAccount when context creation succeeds', async () => {
        const user = userEvent.setup()
        const onContinueToAccount = vi.fn()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'ELIGIBLE',
        })
        const createContext = vi.fn().mockResolvedValue({ kind: 'created' })

        render(
          <ActivationStep1
            verifyOrder={verifyOrder}
            createContext={createContext}
            onContinueToAccount={onContinueToAccount}
          />,
        )
        await typeValidOrderId(user)
        await submitOrder(user)

        const continueButton = await screen.findByRole('button', {
          name: 'Continue to account setup',
        })
        await user.click(continueButton)

        expect(createContext).toHaveBeenCalledWith('205-1234567-1234567')
        expect(onContinueToAccount).toHaveBeenCalledTimes(1)
      })

      it('blocks navigation when context creation fails', async () => {
        const user = userEvent.setup()
        const onContinueToAccount = vi.fn()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'ELIGIBLE',
        })
        const createContext = vi.fn().mockResolvedValue({ kind: 'service_unavailable' })

        render(
          <ActivationStep1
            verifyOrder={verifyOrder}
            createContext={createContext}
            onContinueToAccount={onContinueToAccount}
          />,
        )
        await typeValidOrderId(user)
        await submitOrder(user)

        const continueButton = await screen.findByRole('button', {
          name: 'Continue to account setup',
        })
        await user.click(continueButton)

        expect(onContinueToAccount).not.toHaveBeenCalled()
        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: "We can't check your order right now" }),
          ).toBeInTheDocument()
        })
      })

      it('does not create duplicate contexts on repeated Continue clicks', async () => {
        const user = userEvent.setup()
        const onContinueToAccount = vi.fn()
        let resolveCreate:
          | ((value: { kind: 'created' }) => void)
          | undefined
        const createContext = vi.fn(
          () =>
            new Promise<{ kind: 'created' }>((resolve) => {
              resolveCreate = resolve
            }),
        )

        render(
          <ActivationStep1
            verifyOrder={createVerifyMock({
              kind: 'business_status',
              status: 'ELIGIBLE',
            })}
            createContext={createContext}
            onContinueToAccount={onContinueToAccount}
          />,
        )
        await typeValidOrderId(user)
        await submitOrder(user)

        const continueButton = await screen.findByRole('button', {
          name: 'Continue to account setup',
        })
        await user.click(continueButton)
        await user.click(continueButton)

        expect(createContext).toHaveBeenCalledTimes(1)
        resolveCreate?.({ kind: 'created' })
        await waitFor(() => {
          expect(onContinueToAccount).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('A7 NOT_FOUND', () => {
      it('shows not-found copy', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'NOT_FOUND',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: "We can't verify that order" }),
          ).toBeInTheDocument()
        })
        expect(
          screen.getByText(
            'Please check the digits and make sure this is the Amazon order for your SignMaster flashcards.',
          ),
        ).toBeInTheDocument()
        expect(
          screen.getByText(
            'If you placed the order recently, it may take a little time to appear. Please try again later.',
          ),
        ).toBeInTheDocument()
        expect(screen.getByText(VALID_ORDER_ID)).toBeInTheDocument()
        expectNoStorageWrites()
      })

      it('returns to the field preserving the value when Check the number is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'NOT_FOUND',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Check the number' }))

        const field = screen.getByLabelText('Amazon order number')
        expect(field).toHaveValue(VALID_ORDER_ID)
        await waitFor(() => {
          expect(document.activeElement).toBe(field)
        })
        expect(screen.getByRole('button', { name: 'Check my order' })).toBeInTheDocument()
      })

      it('opens help from Show me where to look on the not-found plate', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'NOT_FOUND',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(
          await screen.findByRole('button', { name: 'Show me where to look' }),
        )

        expect(getHelpDialog(ORDER_HELP_DIALOG)).toBeInTheDocument()
        expectSectionExpanded('Where do I find my Order ID?', ORDER_HELP_DIALOG)
      })
    })

    describe('A8 NOT_SHIPPED', () => {
      it('shows the exact not-shipped body copy', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'NOT_SHIPPED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your order is confirmed' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.getByText(
            'App access will be available once Amazon dispatches your order.',
          ),
        ).toBeInTheDocument()
        expect(
          screen.getByText('Please try again after dispatch.'),
        ).toBeInTheDocument()
        expectNoStorageWrites()
      })

      it('retries verification when Check again is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = vi
          .fn()
          .mockResolvedValueOnce({
            kind: 'business_status',
            status: 'NOT_SHIPPED',
          })
          .mockResolvedValueOnce({
            kind: 'business_status',
            status: 'ELIGIBLE',
          })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Check again' }))

        await waitFor(() => {
          expect(verifyOrder).toHaveBeenCalledTimes(2)
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.queryByRole('heading', { name: 'Your order is confirmed' }),
        ).not.toBeInTheDocument()
      })

      it('shows checking state without the entry form when Check again is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = vi
          .fn()
          .mockResolvedValueOnce({
            kind: 'business_status',
            status: 'NOT_SHIPPED',
          })
          .mockImplementationOnce(
            () =>
              new Promise<ActivationVerifyResult>(() => {
                /* pending retry */
              }),
          )

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Check again' }))

        expect(verifyOrder).toHaveBeenCalledTimes(2)
        expect(
          screen.queryByRole('form', { name: 'Amazon order verification form' }),
        ).not.toBeInTheDocument()
        expect(screen.queryByTestId('activation-entry-form')).not.toBeInTheDocument()
        expect(screen.getByTestId('activation-result-card')).toBeInTheDocument()
        expect(screen.queryByLabelText('Amazon order number')).not.toBeInTheDocument()
        expect(
          screen.getByRole('heading', { name: 'Your order is confirmed' }),
        ).toBeInTheDocument()
        expect(
          screen.getByText('App access will be available once Amazon dispatches your order.'),
        ).toBeInTheDocument()
        expectCheckingButton(screen.getByRole('button', { name: 'Checking your order…' }))
        expect(screen.getByText(VALID_ORDER_ID)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
      })

      it('keeps A8 context during checking then shows A5 when retry returns ELIGIBLE', async () => {
        const user = userEvent.setup()
        let resolveRetry: (value: ActivationVerifyResult) => void = () => undefined
        const verifyOrder = vi
          .fn()
          .mockResolvedValueOnce({
            kind: 'business_status',
            status: 'NOT_SHIPPED',
          })
          .mockImplementationOnce(
            () =>
              new Promise<ActivationVerifyResult>((resolve) => {
                resolveRetry = resolve
              }),
          )

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Check again' }))

        expect(
          screen.getByRole('heading', { name: 'Your order is confirmed' }),
        ).toBeInTheDocument()
        expect(screen.queryByTestId('activation-entry-form')).not.toBeInTheDocument()
        expectCheckingButton(screen.getByRole('button', { name: 'Checking your order…' }))

        resolveRetry({ kind: 'business_status', status: 'ELIGIBLE' })

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.queryByRole('heading', { name: 'Your order is confirmed' }),
        ).not.toBeInTheDocument()
      })

      it('shows Use another order without duplicating Get support in the card', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'NOT_SHIPPED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await screen.findByRole('heading', { name: 'Your order is confirmed' })

        const resultCard = screen.getByTestId('activation-result-card')
        expect(within(resultCard).getByRole('button', { name: 'Use another order' })).toBeInTheDocument()
        expect(within(resultCard).queryByRole('button', { name: 'Get support' })).not.toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Get support' })).toHaveLength(1)
      })

      it('returns to entry with a cleared focused field when Use another order is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'NOT_SHIPPED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Use another order' }))

        const field = screen.getByLabelText('Amazon order number')
        expect(field).toHaveValue('')
        await waitFor(() => {
          expect(document.activeElement).toBe(field)
        })
        expect(screen.getByTestId('activation-entry-form')).toBeInTheDocument()
        expect(screen.queryByTestId('activation-result-card')).not.toBeInTheDocument()
        expect(verifyOrder).toHaveBeenCalledTimes(1)
      })
    })

    describe('A9 ALREADY_CLAIMED', () => {
      it('shows already-claimed info copy', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'ALREADY_CLAIMED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'This order has already been used' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.getByText(
            'A SignMaster account has already been activated with this order.',
          ),
        ).toBeInTheDocument()
        expect(
          screen.getByText(
            'Sign in to that account to carry on where you left off.',
          ),
        ).toBeInTheDocument()
        expectNoStorageWrites()
      })

      it('does not show Sign in without onSignIn', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'ALREADY_CLAIMED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'This order has already been used' }),
          ).toBeInTheDocument()
        })
        expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
      })

      it('shows Sign in and Use another order when handlers are wired', async () => {
        const user = userEvent.setup()
        const onSignIn = vi.fn()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'ALREADY_CLAIMED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} onSignIn={onSignIn} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        const statusPlate = await screen.findByRole('status')
        await user.click(within(statusPlate).getByRole('button', { name: 'Sign in' }))
        expect(onSignIn).toHaveBeenCalledOnce()

        await user.click(within(statusPlate).getByRole('button', { name: 'Use another order' }))

        expect(screen.getByLabelText('Amazon order number')).toHaveValue('')
        await waitFor(() => {
          expect(document.activeElement).toBe(screen.getByLabelText('Amazon order number'))
        })
      })

      it('returns to entry when Use another order is clicked on the already-claimed plate', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'ALREADY_CLAIMED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} onSignIn={() => undefined} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        const statusPlate = await screen.findByRole('status')
        await user.click(within(statusPlate).getByRole('button', { name: 'Use another order' }))

        expect(screen.getByLabelText('Amazon order number')).toHaveValue('')
        expect(screen.getByTestId('activation-entry-form')).toBeInTheDocument()
      })

      it('keeps footer Get support separate from the already-claimed card actions', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'ALREADY_CLAIMED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} onSignIn={() => undefined} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        const statusPlate = await screen.findByRole('status')
        expect(within(statusPlate).queryByRole('button', { name: 'Get support' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Get support' })).toBeInTheDocument()
      })
    })

    describe('A10 CANCELLED', () => {
      it('shows the exact cancelled copy', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'CANCELLED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'That order was cancelled' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.getByText("This order was cancelled, so it can't be used to activate SignMaster."),
        ).toBeInTheDocument()
        expectNoStorageWrites()
      })

      it('clears the field when Try another Order ID is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'CANCELLED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(
          await screen.findByRole('button', { name: 'Try another Order ID' }),
        )

        expect(screen.getByLabelText('Amazon order number')).toHaveValue('')
        expect(screen.getByRole('button', { name: 'Check my order' })).toBeInTheDocument()
      })
    })

    describe('A11 RETURNED', () => {
      it('shows the exact returned copy', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'RETURNED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'That pack was returned' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.getByText(
            "It looks like the SignMaster pack from this order was returned, so this order can't be used to activate app access.",
          ),
        ).toBeInTheDocument()
        expect(screen.getByText("If that's not right, get in touch.")).toBeInTheDocument()
        expectNoStorageWrites()
      })

      it('clears the field when Try another Order ID is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'business_status',
          status: 'RETURNED',
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(
          await screen.findByRole('button', { name: 'Try another Order ID' }),
        )

        expect(screen.getByLabelText('Amazon order number')).toHaveValue('')
      })
    })

    describe('A12 rate_limited', () => {
      afterEach(() => {
        vi.useRealTimers()
      })

      it('shows rate-limit copy', async () => {
        const user = userEvent.setup()

        const verifyOrder = createVerifyMock({
          kind: 'rate_limited',
          retryAfterMs: 30_000,
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: "Let's give that a moment" }),
          ).toBeInTheDocument()
        })
        expect(
          screen.getByText(
            "We've had several verification attempts. Please wait a few minutes before trying again.",
          ),
        ).toBeInTheDocument()
        expect(
          screen.getByText('If you still need help, contact support.'),
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Check again' })).toBeDisabled()
        expectNoStorageWrites()
      })

      it('keeps Check again disabled when no Retry-After is provided', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({
          kind: 'rate_limited',
          retryAfterMs: null,
        })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(screen.getByRole('button', { name: 'Check again' })).toBeDisabled()
        })
        expect(verifyOrder).toHaveBeenCalledTimes(1)
      })

      it('keeps Check again disabled until retryAfterMs elapses, then retries', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

        const verifyOrder = vi
          .fn()
          .mockResolvedValueOnce({ kind: 'rate_limited', retryAfterMs: 5_000 })
          .mockResolvedValueOnce({
            kind: 'business_status',
            status: 'ELIGIBLE',
          })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)

        const field = screen.getByLabelText('Amazon order number')
        fireEvent.change(field, { target: { value: VALID_ORDER_ID } })

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Check my order' }))
          await Promise.resolve()
        })

        const checkAgain = screen.getByRole('button', { name: 'Check again' })
        expect(checkAgain).toBeDisabled()

        act(() => {
          vi.advanceTimersByTime(5_000)
        })

        expect(checkAgain).toBeEnabled()

        await act(async () => {
          fireEvent.click(checkAgain)
          await Promise.resolve()
        })

        expect(verifyOrder).toHaveBeenCalledTimes(2)
        expect(
          screen.getByRole('heading', { name: 'Your purchase is verified' }),
        ).toBeInTheDocument()
      })
    })

    describe('A13A service_unavailable', () => {
      it('shows service-unavailable copy', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({ kind: 'service_unavailable' })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: "We can't check your order right now" }),
          ).toBeInTheDocument()
        })
        expect(
          screen.getByText(
            'SignMaster is temporarily unavailable. Your order number has been kept.',
          ),
        ).toBeInTheDocument()
        expect(
          screen.getByText('Please try again in a few minutes.'),
        ).toBeInTheDocument()
        expectNoStorageWrites()
      })

      it('retries verification when Try again is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = vi
          .fn()
          .mockResolvedValueOnce({ kind: 'service_unavailable' })
          .mockResolvedValueOnce({
            kind: 'business_status',
            status: 'ELIGIBLE',
          })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Try again' }))

        await waitFor(() => {
          expect(verifyOrder).toHaveBeenCalledTimes(2)
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.queryByRole('heading', { name: "We can't check your order right now" }),
        ).not.toBeInTheDocument()
      })

      it('keeps A13A context during checking then shows A5 when retry returns ELIGIBLE', async () => {
        const user = userEvent.setup()
        let resolveRetry: (value: ActivationVerifyResult) => void = () => undefined
        const verifyOrder = vi
          .fn()
          .mockResolvedValueOnce({ kind: 'service_unavailable' })
          .mockImplementationOnce(
            () =>
              new Promise<ActivationVerifyResult>((resolve) => {
                resolveRetry = resolve
              }),
          )

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Try again' }))

        expect(
          screen.getByRole('heading', { name: "We can't check your order right now" }),
        ).toBeInTheDocument()
        expect(screen.queryByTestId('activation-entry-form')).not.toBeInTheDocument()
        expectCheckingButton(screen.getByRole('button', { name: 'Checking your order…' }))

        resolveRetry({ kind: 'business_status', status: 'ELIGIBLE' })

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
        expect(
          screen.queryByRole('heading', { name: "We can't check your order right now" }),
        ).not.toBeInTheDocument()
      })

      it('shows checking state without the entry form when Try again is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = vi
          .fn()
          .mockResolvedValueOnce({ kind: 'service_unavailable' })
          .mockImplementationOnce(
            () =>
              new Promise<ActivationVerifyResult>(() => {
                /* pending retry */
              }),
          )

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Try again' }))

        expect(verifyOrder).toHaveBeenCalledTimes(2)
        expect(
          screen.queryByRole('form', { name: 'Amazon order verification form' }),
        ).not.toBeInTheDocument()
        expect(screen.queryByTestId('activation-entry-form')).not.toBeInTheDocument()
        expect(screen.getByTestId('activation-result-card')).toBeInTheDocument()
        expect(screen.queryByLabelText('Amazon order number')).not.toBeInTheDocument()
        expect(
          screen.getByRole('heading', { name: "We can't check your order right now" }),
        ).toBeInTheDocument()
        expectCheckingButton(screen.getByRole('button', { name: 'Checking your order…' }))
        expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
      })

      it('returns to entry with a cleared focused field when Use another order is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({ kind: 'service_unavailable' })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Use another order' }))

        const field = screen.getByLabelText('Amazon order number')
        expect(field).toHaveValue('')
        await waitFor(() => {
          expect(document.activeElement).toBe(field)
        })
        expect(screen.getByTestId('activation-entry-form')).toBeInTheDocument()
        expect(screen.queryByTestId('activation-result-card')).not.toBeInTheDocument()
        expect(verifyOrder).toHaveBeenCalledTimes(1)
      })
    })

    describe('A13B connection_error', () => {
      it('shows connection-error copy', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({ kind: 'connection_error' })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('heading', { name: "We couldn't connect" }),
          ).toBeInTheDocument()
        })
        expect(
          screen.getByText('Check your internet connection and try again.'),
        ).toBeInTheDocument()
        expect(
          screen.getByText('Your order number has been kept.'),
        ).toBeInTheDocument()
        expectNoStorageWrites()
      })

      it('retries verification when Try again is clicked', async () => {
        const user = userEvent.setup()
        const verifyOrder = vi
          .fn()
          .mockResolvedValueOnce({ kind: 'connection_error' })
          .mockResolvedValueOnce({
            kind: 'business_status',
            status: 'ELIGIBLE',
          })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        await typeValidOrderId(user)
        await submitOrder(user)

        await user.click(await screen.findByRole('button', { name: 'Try again' }))

        await waitFor(() => {
          expect(verifyOrder).toHaveBeenCalledTimes(2)
          expect(
            screen.getByRole('heading', { name: 'Your purchase is verified' }),
          ).toBeInTheDocument()
        })
      })
    })

    describe('invalid_order_id (400)', () => {
      it('stays on the entry form, keeps validation context, and focuses the field', async () => {
        const user = userEvent.setup()
        const verifyOrder = createVerifyMock({ kind: 'invalid_order_id' })

        render(<ActivationStep1 verifyOrder={verifyOrder} />)
        const field = await typeValidOrderId(user)
        await submitOrder(user)

        await waitFor(() => {
          expect(
            screen.getByRole('form', { name: 'Amazon order verification form' }),
          ).toBeInTheDocument()
          expect(field).toHaveValue(VALID_ORDER_ID)
          expect(document.activeElement).toBe(field)
        })
        expect(screen.getByText('17/17 digits')).toBeInTheDocument()
        expect(
          screen.queryByRole('heading', { name: 'Your purchase is verified' }),
        ).not.toBeInTheDocument()
        expect(verifyOrder).toHaveBeenCalledTimes(1)
        expectNoStorageWrites()
      })
    })
  })

  describe('smart auto-verification (Checkpoint 2)', () => {
    const AUTO_VERIFY_DEBOUNCE_MS = 300
    const OTHER_VALID_ORDER_ID = '111-1111111-1111111'
    const OTHER_VALID_ORDER_ID_DIGITS = '11111111111111111'

    afterEach(() => {
      vi.useRealTimers()
    })

    function setOrderIdValue(value: string) {
      const field = screen.getByLabelText('Amazon order number')
      fireEvent.change(field, { target: { value } })
      return field
    }

    async function advanceDebounce(extraMs = 0) {
      await act(async () => {
        vi.advanceTimersByTime(AUTO_VERIFY_DEBOUNCE_MS + extraMs)
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    it('does not auto-verify an incomplete Order ID', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue('205-1234567-123')
      await advanceDebounce(500)

      expect(verifyOrder).not.toHaveBeenCalled()
    })

    it('does not auto-verify a malformed Order ID', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      // 16 digits — structurally invalid (a complete Order ID has 17).
      setOrderIdValue('2051234567123456')
      await advanceDebounce(500)

      expect(verifyOrder).not.toHaveBeenCalled()
    })

    it('auto-verifies exactly once after a complete valid Order ID is typed', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue(VALID_ORDER_ID_DIGITS)
      // Nothing before the debounce elapses.
      expect(verifyOrder).not.toHaveBeenCalled()

      await advanceDebounce()

      expect(verifyOrder).toHaveBeenCalledTimes(1)
      expect(verifyOrder).toHaveBeenCalledWith(VALID_ORDER_ID)
    })

    it('auto-verifies once for a pasted Order ID', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      const field = screen.getByLabelText('Amazon order number')
      fireEvent.paste(field, {
        clipboardData: {
          getData: (type: string) =>
            type === 'text' ? 'Order # 205-1234567-1234567' : '',
        },
      })

      expect(field).toHaveValue(VALID_ORDER_ID)
      expect(verifyOrder).not.toHaveBeenCalled()

      await advanceDebounce()

      expect(verifyOrder).toHaveBeenCalledTimes(1)
      expect(verifyOrder).toHaveBeenCalledWith(VALID_ORDER_ID)
    })

    it('normalizes surrounding text, spaces and dashes then auto-verifies the canonical value', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      const field = setOrderIdValue('  Order # 205 1234567 1234567  ')
      expect(field).toHaveValue(VALID_ORDER_ID)

      await advanceDebounce()

      expect(verifyOrder).toHaveBeenCalledTimes(1)
      expect(verifyOrder).toHaveBeenCalledWith(VALID_ORDER_ID)
    })

    it('collapses repeated identical input events into a single verification', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      // Digits then the already-canonical value: mirrors autofill/mobile input
      // that re-fires change events for the same normalized Order ID.
      setOrderIdValue(VALID_ORDER_ID_DIGITS)
      setOrderIdValue(VALID_ORDER_ID)

      await advanceDebounce()

      expect(verifyOrder).toHaveBeenCalledTimes(1)
    })

    it('does not repeatedly verify the same unchanged Order ID over time', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue(VALID_ORDER_ID_DIGITS)
      await advanceDebounce()
      expect(verifyOrder).toHaveBeenCalledTimes(1)

      // Well beyond the debounce window: no auto re-verification of the same value.
      await advanceDebounce(5_000)
      expect(verifyOrder).toHaveBeenCalledTimes(1)
    })

    it('auto-verifies again when the Order ID is changed to a different valid value', async () => {
      vi.useFakeTimers()
      const verifyOrder = vi
        .fn()
        .mockResolvedValueOnce({ kind: 'business_status', status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue(VALID_ORDER_ID_DIGITS)
      await advanceDebounce()
      expect(verifyOrder).toHaveBeenCalledTimes(1)

      // NOT_FOUND returns to the entry field with the value preserved.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Check the number' }))
        await Promise.resolve()
      })

      setOrderIdValue(OTHER_VALID_ORDER_ID_DIGITS)
      await advanceDebounce()

      expect(verifyOrder).toHaveBeenCalledTimes(2)
      expect(verifyOrder).toHaveBeenLastCalledWith(OTHER_VALID_ORDER_ID)
    })

    it('does not duplicate a pending auto-verification when the manual button is used', async () => {
      vi.useFakeTimers()
      const { verifyOrder, resolveVerify } = createPendingVerifyMock()
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue(VALID_ORDER_ID_DIGITS)

      // Manual submit before the debounce elapses.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Check my order' }))
        await Promise.resolve()
      })
      expect(verifyOrder).toHaveBeenCalledTimes(1)

      // The previously-armed auto-verify timer must have been cancelled.
      await advanceDebounce(500)
      expect(verifyOrder).toHaveBeenCalledTimes(1)

      resolveVerify({ kind: 'business_status', status: 'ELIGIBLE' })
      await act(async () => {
        await Promise.resolve()
      })
    })

    it('does not auto-retry a transient failure but allows a manual retry', async () => {
      vi.useFakeTimers()
      const verifyOrder = vi
        .fn()
        .mockResolvedValueOnce({ kind: 'service_unavailable' })
        .mockResolvedValueOnce({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue(VALID_ORDER_ID_DIGITS)
      await advanceDebounce()
      expect(verifyOrder).toHaveBeenCalledTimes(1)

      // No self-driven retry, even long after the failure.
      await advanceDebounce(5_000)
      expect(verifyOrder).toHaveBeenCalledTimes(1)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await Promise.resolve()
      })
      expect(verifyOrder).toHaveBeenCalledTimes(2)
    })

    it('auto-verifies a canonical dashed Order ID entered via change', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue(VALID_ORDER_ID)
      await advanceDebounce()

      expect(verifyOrder).toHaveBeenCalledTimes(1)
      expect(verifyOrder).toHaveBeenCalledWith(VALID_ORDER_ID)
    })

    it('does not auto-verify when pasted free-form text contains extra digits', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      const field = screen.getByLabelText('Amazon order number')
      fireEvent.paste(field, {
        clipboardData: {
          getData: (type: string) =>
            type === 'text' ? `Order # ${VALID_ORDER_ID} ref 99` : '',
        },
      })

      expect(field).toHaveValue(VALID_ORDER_ID)
      await advanceDebounce(500)

      expect(verifyOrder).not.toHaveBeenCalled()
    })

    it('does not auto-verify 18 bare digits even when the field displays 17', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      const field = screen.getByLabelText('Amazon order number')
      fireEvent.paste(field, {
        clipboardData: {
          getData: (type: string) =>
            type === 'text' ? `${VALID_ORDER_ID_DIGITS}9` : '',
        },
      })

      expect(field).toHaveValue(VALID_ORDER_ID)
      await advanceDebounce(500)

      expect(verifyOrder).not.toHaveBeenCalled()
    })

    it('does not auto-verify when extra digits follow a valid ID separated by spaces', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue(`${VALID_ORDER_ID} 55`)
      await advanceDebounce(500)

      expect(verifyOrder).not.toHaveBeenCalled()
    })

    it('does not auto-verify when extra digits follow a valid ID separated by text', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue(`Order ${VALID_ORDER_ID} ref 99`)
      await advanceDebounce(500)

      expect(verifyOrder).not.toHaveBeenCalled()
    })

    it('auto-verifies after correcting an overlong source to exactly 17 digits', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      const field = screen.getByLabelText('Amazon order number')
      fireEvent.paste(field, {
        clipboardData: {
          getData: (type: string) =>
            type === 'text' ? `${VALID_ORDER_ID_DIGITS}9` : '',
        },
      })
      await advanceDebounce(500)
      expect(verifyOrder).not.toHaveBeenCalled()

      fireEvent.change(field, { target: { value: VALID_ORDER_ID_DIGITS } })
      await advanceDebounce()

      expect(verifyOrder).toHaveBeenCalledTimes(1)
      expect(verifyOrder).toHaveBeenCalledWith(VALID_ORDER_ID)
    })

    it('auto-verifies after clearing an overlong paste and re-entering a valid ID', async () => {
      vi.useFakeTimers()
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      const field = screen.getByLabelText('Amazon order number')
      fireEvent.paste(field, {
        clipboardData: {
          getData: (type: string) =>
            type === 'text' ? `Order # ${VALID_ORDER_ID} ref 99` : '',
        },
      })
      await advanceDebounce(500)
      expect(verifyOrder).not.toHaveBeenCalled()

      fireEvent.change(field, { target: { value: '' } })
      setOrderIdValue(VALID_ORDER_ID_DIGITS)
      await advanceDebounce()

      expect(verifyOrder).toHaveBeenCalledTimes(1)
      expect(verifyOrder).toHaveBeenCalledWith(VALID_ORDER_ID)
    })

    it('does not duplicate verification while a request is in flight', async () => {
      vi.useFakeTimers()
      const { verifyOrder, resolveVerify } = createPendingVerifyMock()
      render(<ActivationStep1 verifyOrder={verifyOrder} />)

      setOrderIdValue(VALID_ORDER_ID_DIGITS)
      await advanceDebounce()
      expect(verifyOrder).toHaveBeenCalledTimes(1)

      const form = screen.getByTestId('activation-entry-form')
      await act(async () => {
        fireEvent.submit(form)
        await Promise.resolve()
      })
      expect(verifyOrder).toHaveBeenCalledTimes(1)

      resolveVerify({ kind: 'business_status', status: 'ELIGIBLE' })
      await act(async () => {
        await Promise.resolve()
      })
    })

    it('still creates activation context after auto-verified eligible result', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const verifyOrder = createVerifyMock({ kind: 'business_status', status: 'ELIGIBLE' })
      const createContext = vi.fn().mockResolvedValue({ kind: 'created' })
      const onContinueToAccount = vi.fn()
      render(
        <ActivationStep1
          verifyOrder={verifyOrder}
          createContext={createContext}
          onContinueToAccount={onContinueToAccount}
        />,
      )

      setOrderIdValue(VALID_ORDER_ID_DIGITS)
      await advanceDebounce()

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Your purchase is verified' }),
        ).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Continue to account setup' }),
        )
        await Promise.resolve()
      })

      expect(createContext).toHaveBeenCalledWith(VALID_ORDER_ID)
      expect(onContinueToAccount).toHaveBeenCalledTimes(1)
    })
  })
})

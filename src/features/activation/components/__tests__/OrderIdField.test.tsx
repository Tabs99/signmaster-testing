import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OrderIdField from '../OrderIdField'
import { CLIPBOARD_NO_ORDER_ID_MESSAGE } from '../../utils/formatting'
import { isValidOrderId, VALIDATION_MESSAGES } from '../../utils/validation'

const FORMATTED_ORDER_ID = '205-1234567-1234567'
const RAW_ORDER_ID_DIGITS = '20512345671234567'

function renderOrderIdField(
  initialValue = '',
  options: { showError?: boolean } = {},
) {
  function Harness() {
    const [value, setValue] = useState(initialValue)

    return (
      <OrderIdField
        value={value}
        onChange={(next) => setValue(next)}
        onOpenHelp={vi.fn()}
        showError={options.showError ?? false}
      />
    )
  }

  render(<Harness />)
  return screen.getByLabelText('Amazon order number') as HTMLInputElement
}

function stubClipboard(readText: () => Promise<string>) {
  vi.stubGlobal('isSecureContext', true)
  const readTextMock = vi.fn(readText)
  if (!('clipboard' in navigator) || !navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: readTextMock },
      configurable: true,
      writable: true,
    })
    return readTextMock
  }
  return vi.spyOn(navigator.clipboard, 'readText').mockImplementation(readTextMock)
}

function renderOrderIdFieldWithSubmitValidation() {
  function Harness() {
    const [value, setValue] = useState('')
    const [submitAttempted, setSubmitAttempted] = useState(false)
    const showError = submitAttempted && !isValidOrderId(value)

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitAttempted(true)
        }}
      >
        <OrderIdField
          value={value}
          onChange={setValue}
          onOpenHelp={vi.fn()}
          showError={showError}
        />
        <button type="submit">Submit order check</button>
      </form>
    )
  }

  render(<Harness />)
  return screen.getByLabelText('Amazon order number') as HTMLInputElement
}

function expectShowMeWhereVisible() {
  expect(screen.getByRole('button', { name: 'Show me where' })).toBeInTheDocument()
}

function fireRepeatedDigit(field: HTMLInputElement, digit: string, times: number) {
  for (let index = 0; index < times; index++) {
    fireEvent.keyDown(field, { key: digit, repeat: true })
  }
}

async function flushSelectionUpdate() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  })
}

describe('OrderIdField', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('normal typing', () => {
    it('formats 17 digits while typing', async () => {
      const user = userEvent.setup()
      renderOrderIdField()

      const field = screen.getByLabelText('Amazon order number')
      await user.type(field, RAW_ORDER_ID_DIGITS)

      expect(field).toHaveValue(FORMATTED_ORDER_ID)
      expect(screen.getByText('17/17 digits')).toBeInTheDocument()
    })
  })

  describe('repeated key input', () => {
    it('appends repeated numeric keydown events without dropping characters', () => {
      const field = renderOrderIdField()

      fireEvent.change(field, { target: { value: '0' } })
      expect(field).toHaveValue('0')

      fireRepeatedDigit(field, '0', 3)

      expect(field).toHaveValue('000-0')
      expect(screen.getByText('4/17 digits')).toBeInTheDocument()
    })

    it('continues hyphen formatting while repeated input is added', () => {
      const field = renderOrderIdField()

      fireEvent.change(field, { target: { value: '205123456' } })
      expect(field).toHaveValue('205-123456')

      fireRepeatedDigit(field, '7', 7)

      expect(field).toHaveValue('205-1234567-777777')
      expect(screen.getByText('16/17 digits')).toBeInTheDocument()
    })
  })

  describe('paste', () => {
    it('formats pasted raw digits', () => {
      const field = renderOrderIdField()

      fireEvent.paste(field, {
        clipboardData: {
          getData: () => RAW_ORDER_ID_DIGITS,
        },
      })

      expect(field).toHaveValue(FORMATTED_ORDER_ID)
    })

    it('normalises pasted formatted order IDs', () => {
      const field = renderOrderIdField()

      fireEvent.paste(field, {
        clipboardData: {
          getData: () => `  ${FORMATTED_ORDER_ID}  `,
        },
      })

      expect(field).toHaveValue(FORMATTED_ORDER_ID)
    })
  })

  describe('mixed input', () => {
    it('continues from typed digits when repeated key input follows', () => {
      const field = renderOrderIdField()

      fireEvent.change(field, { target: { value: '205123456' } })
      expect(field).toHaveValue('205-123456')

      fireRepeatedDigit(field, '7', 4)

      expect(field).toHaveValue('205-1234567-777')
      expect(screen.getByText('13/17 digits')).toBeInTheDocument()
    })
  })

  describe('edit in the middle', () => {
    it('inserts repeated digits at the caret and keeps formatting correct', async () => {
      const field = renderOrderIdField('205-1234567-123456')

      field.setSelectionRange(4, 4)
      fireEvent.keyDown(field, { key: '9', repeat: true })
      await flushSelectionUpdate()

      expect(field).toHaveValue('205-9123456-7123456')
      expect(field.selectionStart).toBe(5)
      expect(field.selectionEnd).toBe(5)
    })

    it('replaces a selected digit span before applying repeat formatting', async () => {
      const field = renderOrderIdField('205-1234567-1234567')

      field.setSelectionRange(5, 8)
      fireEvent.keyDown(field, { key: '9', repeat: true })
      await flushSelectionUpdate()

      expect(field).toHaveValue('205-1956712-34567')
      expect(field.selectionStart).toBe(6)
    })
  })

  describe('backspace and delete near separators', () => {
    it('reformats correctly after deleting near hyphens and accepts further typing', () => {
      const field = renderOrderIdField(FORMATTED_ORDER_ID)

      fireEvent.change(field, { target: { value: '205-1234567-123456' } })
      expect(field).toHaveValue('205-1234567-123456')
      expect(screen.getByText('16/17 digits')).toBeInTheDocument()

      fireEvent.change(field, { target: { value: '20512345671234567' } })
      expect(field).toHaveValue(FORMATTED_ORDER_ID)
    })

    it('recovers from a hyphen-adjacent deletion without corrupting groups', () => {
      const field = renderOrderIdField('205-1234567-1234567')

      fireEvent.change(field, { target: { value: '20512345671234567' } })
      expect(field).toHaveValue(FORMATTED_ORDER_ID)

      fireEvent.change(field, { target: { value: '2051234567123456' } })
      expect(field).toHaveValue('205-1234567-123456')

      fireEvent.change(field, { target: { value: '20512345671234567' } })
      expect(field).toHaveValue(FORMATTED_ORDER_ID)
    })
  })

  describe('invalid characters', () => {
    it('strips letters and symbols from typed input', () => {
      const field = renderOrderIdField()

      fireEvent.change(field, {
        target: { value: '20a5!@#-1234567-1234567' },
      })

      expect(field).toHaveValue(FORMATTED_ORDER_ID)
    })

    it('strips invalid characters from pasted input', () => {
      const field = renderOrderIdField()

      fireEvent.paste(field, {
        clipboardData: {
          getData: () => 'Order 205-1234567-1234567!!!',
        },
      })

      expect(field).toHaveValue(FORMATTED_ORDER_ID)
    })
  })

  describe('maximum length', () => {
    it('does not accept more than 17 digits from typing or paste', () => {
      const field = renderOrderIdField()

      fireEvent.change(field, {
        target: { value: `${RAW_ORDER_ID_DIGITS}89` },
      })
      expect(field).toHaveValue(FORMATTED_ORDER_ID)

      fireEvent.paste(field, {
        clipboardData: {
          getData: () => `${RAW_ORDER_ID_DIGITS}999`,
        },
      })
      expect(field).toHaveValue(FORMATTED_ORDER_ID)
    })

    it('reports auto-verify ineligibility when paste source has more than 17 digits', () => {
      const onChange = vi.fn()
      render(
        <OrderIdField
          value=""
          onChange={onChange}
          onOpenHelp={vi.fn()}
          showError={false}
        />,
      )
      const field = screen.getByLabelText('Amazon order number')

      fireEvent.paste(field, {
        clipboardData: {
          getData: () => `Order # ${FORMATTED_ORDER_ID} ref 99`,
        },
      })

      expect(onChange).toHaveBeenLastCalledWith(FORMATTED_ORDER_ID, {
        autoVerifyEligible: false,
        sourceWithinDigitLimit: false,
      })
    })

    it('reports auto-verify eligibility for a clean 17-digit paste source', () => {
      const onChange = vi.fn()
      render(
        <OrderIdField
          value=""
          onChange={onChange}
          onOpenHelp={vi.fn()}
          showError={false}
        />,
      )
      const field = screen.getByLabelText('Amazon order number')

      fireEvent.paste(field, {
        clipboardData: {
          getData: () => `Order # ${FORMATTED_ORDER_ID}`,
        },
      })

      expect(onChange).toHaveBeenLastCalledWith(FORMATTED_ORDER_ID, {
        autoVerifyEligible: true,
        sourceWithinDigitLimit: true,
      })
    })

    it('ignores repeated key input once the 17-digit limit is reached', () => {
      const field = renderOrderIdField(FORMATTED_ORDER_ID)

      field.setSelectionRange(FORMATTED_ORDER_ID.length, FORMATTED_ORDER_ID.length)
      fireRepeatedDigit(field, '9', 3)

      expect(field).toHaveValue(FORMATTED_ORDER_ID)
      expect(screen.getByText('17/17 digits')).toBeInTheDocument()
    })
  })

  describe('inline order ID help', () => {
    it('shows Where do I find this? and expands with example format', async () => {
      const user = userEvent.setup()
      renderOrderIdField()

      const details = screen.getByText('Where do I find this?').closest('details')
      expect(details).toBeTruthy()
      expect(details).not.toHaveAttribute('open')

      await user.click(screen.getByText('Where do I find this?'))

      expect(details).toHaveAttribute('open')
      expect(screen.getByText(/Your Orders/i)).toBeVisible()
      expect(screen.getByText('123-1234567-1234567')).toBeVisible()
    })

    it('opens detailed help when Show me where is clicked', async () => {
      const user = userEvent.setup()
      const onOpenHelp = vi.fn()
      render(
        <OrderIdField
          value=""
          onChange={vi.fn()}
          onOpenHelp={onOpenHelp}
          showError={false}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Show me where' }))
      expect(onOpenHelp).toHaveBeenCalledTimes(1)
    })
  })

  describe('clipboard Paste button', () => {
    it('shows Paste when clipboard read is supported', () => {
      stubClipboard(async () => RAW_ORDER_ID_DIGITS)
      renderOrderIdField()
      expect(screen.getByRole('button', { name: 'Paste' })).toBeInTheDocument()
    })

    it('populates the field from clipboard with formatting', async () => {
      const readText = stubClipboard(async () => RAW_ORDER_ID_DIGITS)
      const field = renderOrderIdField()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        await Promise.resolve()
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(readText).toHaveBeenCalledTimes(1)
        expect(field).toHaveValue(FORMATTED_ORDER_ID)
      })
    })

    it('passes auto-verify eligibility for a clean 17-digit clipboard source', async () => {
      stubClipboard(async () => RAW_ORDER_ID_DIGITS)
      const onChange = vi.fn()
      render(
        <OrderIdField value="" onChange={onChange} onOpenHelp={vi.fn()} showError={false} />,
      )

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        await Promise.resolve()
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(FORMATTED_ORDER_ID, {
          autoVerifyEligible: true,
          sourceWithinDigitLimit: true,
        })
      })
    })

    it('does not paste overlong clipboard text and shows an informational notice', async () => {
      stubClipboard(async () => `${RAW_ORDER_ID_DIGITS}99`)
      const onChange = vi.fn()
      render(
        <OrderIdField value="" onChange={onChange} onOpenHelp={vi.fn()} showError={false} />,
      )
      const field = screen.getByLabelText('Amazon order number')

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        await Promise.resolve()
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(CLIPBOARD_NO_ORDER_ID_MESSAGE)
      })
      expect(onChange).not.toHaveBeenCalled()
      expect(field).toHaveValue('')
    })

    it.each([
      ['empty clipboard', ''],
      ['whitespace-only clipboard', '   \n\t  '],
      ['incomplete digits', '123456'],
      ['unrelated text', 'hello from my notes'],
    ])('rejects %s without changing the field', async (_label, clipboardText) => {
      stubClipboard(async () => clipboardText)
      const onChange = vi.fn()
      render(
        <OrderIdField
          value=""
          onChange={onChange}
          onOpenHelp={vi.fn()}
          showError={false}
        />,
      )
      const field = screen.getByLabelText('Amazon order number')

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        await Promise.resolve()
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(CLIPBOARD_NO_ORDER_ID_MESSAGE)
      })
      expect(onChange).not.toHaveBeenCalled()
      expect(field).toHaveValue('')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('preserves an existing field value when clipboard content is invalid', async () => {
      stubClipboard(async () => '123456')
      const onChange = vi.fn()
      render(
        <OrderIdField
          value={FORMATTED_ORDER_ID}
          onChange={onChange}
          onOpenHelp={vi.fn()}
          showError={false}
        />,
      )

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        await Promise.resolve()
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(CLIPBOARD_NO_ORDER_ID_MESSAGE)
      })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not show the informational notice after a successful dedicated paste', async () => {
      stubClipboard(async () => RAW_ORDER_ID_DIGITS)
      const field = renderOrderIdField()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        await Promise.resolve()
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(field).toHaveValue(FORMATTED_ORDER_ID)
      })
      expect(screen.queryByText(CLIPBOARD_NO_ORDER_ID_MESSAGE)).not.toBeInTheDocument()
    })

    it('shows a safe message when clipboard read fails', async () => {
      stubClipboard(async () => {
        throw new Error('denied')
      })
      // readText failure path — clipboard content irrelevant
      const field = renderOrderIdField()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        await Promise.resolve()
        await Promise.resolve()
      })

      const status = await screen.findByRole('status')
      expect(status).toHaveTextContent(/Couldn't read your clipboard/i)
      expect(field).toHaveValue('')
      expect(field).not.toBeDisabled()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(screen.getByRole('status')).toHaveTextContent(/Couldn't read your clipboard/i)
      expect(screen.getByRole('button', { name: 'Paste' })).toBeEnabled()
    })
  })

  describe('Show me where help link visibility', () => {
    it('shows the help link on an untouched field', () => {
      renderOrderIdField()
      expectShowMeWhereVisible()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('opens detailed help without showing required validation on an empty focused field', async () => {
      const user = userEvent.setup()
      const onOpenHelp = vi.fn()
      render(
        <OrderIdField value="" onChange={vi.fn()} onOpenHelp={onOpenHelp} showError={false} />,
      )
      const field = screen.getByLabelText('Amazon order number')
      await user.click(field)
      await user.click(screen.getByRole('button', { name: 'Show me where' }))

      expect(onOpenHelp).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(field).not.toHaveAttribute('aria-invalid', 'true')
    })

    it('keeps the help link visible when empty-field validation is shown after submit', async () => {
      const user = userEvent.setup()
      const field = renderOrderIdFieldWithSubmitValidation()

      expectShowMeWhereVisible()
      await user.click(screen.getByRole('button', { name: 'Submit order check' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        VALIDATION_MESSAGES.orderIdRequired,
      )
      expectShowMeWhereVisible()
      expect(field).toHaveAttribute('aria-invalid', 'true')
    })

    it('keeps the help link visible for a partial invalid order ID with validation shown', () => {
      renderOrderIdField('205-12345', { showError: true })

      expect(screen.getByRole('alert')).toHaveTextContent(VALIDATION_MESSAGES.orderIdInvalid)
      expectShowMeWhereVisible()
    })

    it('keeps the help link visible after entering a valid order ID following validation', async () => {
      const user = userEvent.setup()
      const field = renderOrderIdFieldWithSubmitValidation()

      await user.click(screen.getByRole('button', { name: 'Submit order check' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        VALIDATION_MESSAGES.orderIdRequired,
      )

      await user.type(field, RAW_ORDER_ID_DIGITS)

      expect(field).toHaveValue(FORMATTED_ORDER_ID)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expectShowMeWhereVisible()
    })

    it('describes the input with both error and hint when validation is shown', () => {
      const field = renderOrderIdField('', { showError: true })

      const describedBy = field.getAttribute('aria-describedby') ?? ''
      const ids = describedBy.split(/\s+/).filter(Boolean)
      expect(ids).toHaveLength(2)
      expect(document.getElementById(ids[0])).toHaveAttribute('role', 'alert')
      expect(document.getElementById(ids[1])).toHaveTextContent(/Where do I find this/)
    })
  })
})

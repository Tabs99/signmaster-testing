import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import OrderIdField from '../OrderIdField'

const FORMATTED_ORDER_ID = '205-1234567-1234567'
const RAW_ORDER_ID_DIGITS = '20512345671234567'

function renderOrderIdField(initialValue = '') {
  function Harness() {
    const [value, setValue] = useState(initialValue)

    return (
      <OrderIdField
        value={value}
        onChange={setValue}
        onOpenHelp={vi.fn()}
        showError={false}
      />
    )
  }

  render(<Harness />)
  return screen.getByLabelText('Amazon order number') as HTMLInputElement
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

    it('ignores repeated key input once the 17-digit limit is reached', () => {
      const field = renderOrderIdField(FORMATTED_ORDER_ID)

      field.setSelectionRange(FORMATTED_ORDER_ID.length, FORMATTED_ORDER_ID.length)
      fireRepeatedDigit(field, '9', 3)

      expect(field).toHaveValue(FORMATTED_ORDER_ID)
      expect(screen.getByText('17/17 digits')).toBeInTheDocument()
    })
  })
})

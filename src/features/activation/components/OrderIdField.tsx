import { useId, useRef, type KeyboardEvent } from 'react'
import { countOrderIdDigits, isValidOrderId, validateOrderId } from '../utils/validation'
import {
  countDigitsBeforeIndex,
  cursorPositionAfterDigits,
  formatOrderId,
  insertOrderIdDigit,
  normalisePastedOrderId,
} from '../utils/formatting'
import FieldError from './FieldError'

interface OrderIdFieldProps {
  value: string
  onChange: (value: string) => void
  onOpenHelp: () => void
  showError: boolean
  disabled?: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
  helpButtonRef?: React.RefObject<HTMLButtonElement | null>
  onBlur?: () => void
}

export default function OrderIdField({
  value,
  onChange,
  onOpenHelp,
  showError,
  disabled = false,
  inputRef,
  helpButtonRef,
  onBlur,
}: OrderIdFieldProps) {
  const hintId = useId()
  const errorId = useId()
  const valueRef = useRef(value)
  valueRef.current = value
  const digitCount = countOrderIdDigits(value)
  const isValid = isValidOrderId(value)
  const errorMessage = showError ? validateOrderId(value) : null

  const counterLabel = isValid ? '17/17 digits' : `${digitCount}/17 digits`

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled || !event.repeat || !/^\d$/.test(event.key)) {
      return
    }

    // Controlled inputs reset the native value on each React commit, which
    // breaks the browser's key-repeat insertion chain. Handle repeats explicitly.
    event.preventDefault()

    const input = event.currentTarget
    const currentValue = valueRef.current
    const selectionStart = input.selectionStart ?? currentValue.length
    const selectionEnd = input.selectionEnd ?? currentValue.length
    const nextValue = insertOrderIdDigit(
      currentValue,
      event.key,
      selectionStart,
      selectionEnd,
    )

    if (nextValue === currentValue) {
      return
    }

    valueRef.current = nextValue
    onChange(nextValue)

    const insertedDigitIndex = countDigitsBeforeIndex(currentValue, selectionStart) + 1
    const nextCaret = cursorPositionAfterDigits(nextValue, insertedDigitIndex)

    requestAnimationFrame(() => {
      input.setSelectionRange(nextCaret, nextCaret)
    })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label
          htmlFor="amazon-order-number"
          className={`font-mono text-[10.5px] font-semibold uppercase tracking-field ${
            showError && errorMessage ? 'text-error-text' : 'text-white/[0.65]'
          }`}
        >
          Amazon order number
        </label>
        <span
          className="font-mono text-[10.5px] text-white/40"
          aria-live="polite"
        >
          {counterLabel}
        </span>
      </div>

      <input
        ref={inputRef}
        id="amazon-order-number"
        name="orderId"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        aria-disabled={disabled}
        aria-invalid={showError && Boolean(errorMessage)}
        aria-describedby={
          [errorMessage ? errorId : null, !errorMessage ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={(event) => onChange(formatOrderId(event.target.value))}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          event.preventDefault()
          const pasted = event.clipboardData.getData('text')
          onChange(normalisePastedOrderId(pasted))
        }}
        onBlur={onBlur}
        className={`keyline-field keyline-focus w-full ${
          showError && errorMessage ? 'keyline-field-error' : 'border-white/20'
        }`}
      />

      {errorMessage ? (
        <FieldError id={errorId}>{errorMessage}</FieldError>
      ) : (
        <p id={hintId} className="mt-2.5 text-[13px] leading-[1.55] text-white/[0.55]">
          Find it in your Amazon confirmation email or order details.{' '}
          <button
            ref={helpButtonRef}
            type="button"
            onClick={onOpenHelp}
            className="keyline-text-action inline min-h-0 p-0 text-[13px] font-medium text-white underline decoration-white/45"
          >
            Show me where
          </button>
        </p>
      )}
    </div>
  )
}

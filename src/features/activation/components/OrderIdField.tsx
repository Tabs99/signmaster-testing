import { useId } from 'react'
import { countOrderIdDigits, isValidOrderId, validateOrderId } from '../utils/validation'
import { formatOrderId, normalisePastedOrderId } from '../utils/formatting'
import FieldError from './FieldError'

interface OrderIdFieldProps {
  value: string
  onChange: (value: string) => void
  onOpenHelp: () => void
  showError: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
  helpButtonRef?: React.RefObject<HTMLButtonElement | null>
  onBlur?: () => void
}

export default function OrderIdField({
  value,
  onChange,
  onOpenHelp,
  showError,
  inputRef,
  helpButtonRef,
  onBlur,
}: OrderIdFieldProps) {
  const hintId = useId()
  const errorId = useId()
  const digitCount = countOrderIdDigits(value)
  const isValid = isValidOrderId(value)
  const errorMessage = showError ? validateOrderId(value) : null

  const counterLabel = isValid ? '17/17 digits' : `${digitCount}/17 digits`

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
        aria-invalid={showError && Boolean(errorMessage)}
        aria-describedby={
          [errorMessage ? errorId : null, !errorMessage ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={(event) => onChange(formatOrderId(event.target.value))}
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

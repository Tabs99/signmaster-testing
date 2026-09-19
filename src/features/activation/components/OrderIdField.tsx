import { useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  countOrderIdDigits,
  isValidOrderId,
  validateOrderId,
} from '../utils/validation'
import {
  countDigitsBeforeIndex,
  cursorPositionAfterDigits,
  insertOrderIdDigit,
  isClipboardPasteSupported,
  CLIPBOARD_NO_ORDER_ID_MESSAGE,
  parseCompleteOrderIdFromClipboard,
  processOrderIdInput,
} from '../utils/formatting'
import FieldError from './FieldError'
import OrderIdInlineHelp from './OrderIdInlineHelp'

export type OrderIdFieldChangeMeta = {
  autoVerifyEligible: boolean
  sourceWithinDigitLimit: boolean
}

interface OrderIdFieldProps {
  value: string
  onChange: (value: string, meta: OrderIdFieldChangeMeta) => void
  onOpenHelp: () => void
  showError: boolean
  errorMessageOverride?: string | null
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
  errorMessageOverride = null,
  disabled = false,
  inputRef,
  helpButtonRef,
  onBlur,
}: OrderIdFieldProps) {
  const hintId = useId()
  const errorId = useId()
  const clipboardNoticeId = useId()
  const valueRef = useRef(value)
  valueRef.current = value
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null)
  const showPasteButton = isClipboardPasteSupported()
  const digitCount = countOrderIdDigits(value)
  const isValid = isValidOrderId(value)
  const errorMessage = showError
    ? (errorMessageOverride ?? validateOrderId(value))
    : null

  const counterLabel = isValid ? '17/17 digits' : `${digitCount}/17 digits`

  function applyRawInput(raw: string, options: { trim?: boolean }) {
    setClipboardNotice(null)
    const processed = processOrderIdInput(raw, options)
    onChange(processed.value, {
      autoVerifyEligible: processed.autoVerifyEligible,
      sourceWithinDigitLimit: processed.sourceWithinDigitLimit,
    })
  }

  async function handlePasteFromClipboard() {
    if (disabled || !showPasteButton) {
      return
    }

    setClipboardNotice(null)

    try {
      const text = await navigator.clipboard.readText()
      const accepted = parseCompleteOrderIdFromClipboard(text)
      if (!accepted) {
        setClipboardNotice(CLIPBOARD_NO_ORDER_ID_MESSAGE)
        inputRef?.current?.focus()
        return
      }

      onChange(accepted.value, {
        autoVerifyEligible: accepted.autoVerifyEligible,
        sourceWithinDigitLimit: accepted.sourceWithinDigitLimit,
      })
      setClipboardNotice(null)
      inputRef?.current?.focus()
    } catch {
      setClipboardNotice(
        "Couldn't read your clipboard. You can still paste with Ctrl+V or Cmd+V in the field.",
      )
      inputRef?.current?.focus()
    }
  }

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
    applyRawInput(nextValue, { trim: false })

    const insertedDigitIndex = countDigitsBeforeIndex(currentValue, selectionStart) + 1
    const nextCaret = cursorPositionAfterDigits(nextValue, insertedDigitIndex)

    requestAnimationFrame(() => {
      input.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const describedBy = [
    errorMessage ? errorId : null,
    clipboardNotice ? clipboardNoticeId : null,
    hintId,
  ]
    .filter(Boolean)
    .join(' ')

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

      <div className="flex gap-2">
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
          aria-describedby={describedBy || undefined}
          onChange={(event) => {
            applyRawInput(event.target.value, { trim: false })
          }}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            event.preventDefault()
            applyRawInput(event.clipboardData.getData('text'), { trim: true })
          }}
          onBlur={onBlur}
          className={`keyline-field keyline-focus min-w-0 flex-1 ${
            showError && errorMessage ? 'keyline-field-error' : 'border-white/20'
          }`}
        />
        {showPasteButton ? (
          <button
            type="button"
            disabled={disabled}
            aria-disabled={disabled}
            onClick={() => {
              void handlePasteFromClipboard()
            }}
            className="keyline-focus shrink-0 rounded-xl border border-white/20 bg-white/[0.06] px-3.5 py-3 text-[14px] font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Paste
          </button>
        ) : null}
      </div>

      {errorMessage ? <FieldError id={errorId}>{errorMessage}</FieldError> : null}

      {clipboardNotice ? (
        <p
          id={clipboardNoticeId}
          role="status"
          className="mt-2 text-[13px] leading-snug text-amber-300/90"
        >
          {clipboardNotice}
        </p>
      ) : null}

      <div id={hintId}>
        <OrderIdInlineHelp
          onOpenDetailedHelp={onOpenHelp}
          detailedHelpButtonRef={helpButtonRef}
        />
      </div>
    </div>
  )
}

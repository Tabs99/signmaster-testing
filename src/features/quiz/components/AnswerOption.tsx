/**
 * One of the four answers.
 *
 * Tapping an option is the submission — there is no separate submit step and no
 * changing an answer, which is what lets feedback appear the instant a learner
 * commits. Once answered all four lock.
 *
 * Feedback never relies on colour alone. A resolved option carries a glyph in
 * place of its letter, a heavier border, a fill and a word tag, so it reads the
 * same to someone who cannot distinguish the green from the coral.
 */

export type AnswerOptionState =
  | 'idle'
  | 'correct_chosen'
  | 'correct_revealed'
  | 'incorrect_chosen'
  | 'muted'

export interface AnswerOptionProps {
  label: string
  /** Position in the list, used for the A/B/C/D prefix and the keyboard hint. */
  index: number
  state: AnswerOptionState
  onSelect: () => void
  disabled: boolean
}

const LETTERS = ['A', 'B', 'C', 'D']

const CONTAINER_STATE: Record<AnswerOptionState, string> = {
  // Hover is pointer-only (`md:`) so a touch does not leave a stuck highlight.
  idle: 'border-white/[0.14] bg-keyline-plate cursor-pointer md:hover:-translate-y-px md:hover:border-white/35 md:hover:bg-white/[0.04] active:translate-y-0 active:scale-[0.995]',
  correct_chosen: 'border-2 border-success bg-success/[0.12]',
  correct_revealed: 'border-2 border-success bg-success/[0.12]',
  incorrect_chosen: 'border-2 border-error bg-error/[0.12]',
  muted: 'border-white/[0.14] bg-keyline-plate opacity-[0.42]',
}

const LABEL_STATE: Record<AnswerOptionState, string> = {
  idle: 'text-white',
  correct_chosen: 'text-success-text',
  correct_revealed: 'text-success-text',
  incorrect_chosen: 'text-error-text',
  muted: 'text-white',
}

const TAG: Partial<Record<AnswerOptionState, string>> = {
  correct_chosen: 'Yours',
  correct_revealed: 'Correct',
  incorrect_chosen: 'Yours',
}

function Marker({ state, index }: { state: AnswerOptionState; index: number }) {
  if (state === 'correct_chosen' || state === 'correct_revealed') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 text-success-text">
        <path
          d="M4 10.5l4 4 8-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (state === 'incorrect_chosen') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 text-error-text">
        <path
          d="M5 5l10 10M15 5L5 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <span className="font-mono text-[12px] font-semibold tracking-field text-white/50">
      {LETTERS[index] ?? index + 1}
    </span>
  )
}

export default function AnswerOption({
  label,
  index,
  state,
  onSelect,
  disabled,
}: AnswerOptionProps) {
  const tag = TAG[state]

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-disabled={disabled}
      data-testid={`answer-option-${index}`}
      data-state={state}
      className={`keyline-focus flex min-h-[56px] w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out ${CONTAINER_STATE[state]}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <Marker state={state} index={index} />
      </span>
      <span
        className={`flex-1 text-[14px] font-semibold leading-snug sm:text-[15px] ${LABEL_STATE[state]}`}
      >
        {label}
      </span>
      {tag ? (
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-step text-white/55">
          {tag}
        </span>
      ) : null}
    </button>
  )
}

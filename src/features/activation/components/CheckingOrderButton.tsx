import type { ButtonHTMLAttributes } from 'react'
import CheckingOrderButtonLabel from './CheckingOrderButtonLabel'
import PrimaryButton from './PrimaryButton'

interface CheckingOrderButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  type?: 'button' | 'submit'
}

export default function CheckingOrderButton({
  type = 'button',
  ...props
}: CheckingOrderButtonProps) {
  return (
    <PrimaryButton type={type} enabled loading {...props}>
      <CheckingOrderButtonLabel />
    </PrimaryButton>
  )
}

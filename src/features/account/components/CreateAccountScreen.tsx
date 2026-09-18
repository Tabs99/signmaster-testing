import type { CreateAccountScreenProps } from '../types'
import ActivationAccountSetup from './ActivationAccountSetup'

export default function CreateAccountScreen(props: CreateAccountScreenProps) {
  return <ActivationAccountSetup variant="page" {...props} />
}

export interface ActivationFormProps {
  onSuccess?: () => void
}

export const ACTIVATION_STORAGE_KEY = 'signmaster_activated'

export type ActivationStatus = 'idle' | 'loading' | 'failed'

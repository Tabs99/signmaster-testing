import { useState } from 'react'
import CreateAccountScreen from './features/account/components/CreateAccountScreen'
import ActivationForm from './features/activation/components/ActivationForm'
import { ACCOUNT_STORAGE_KEY } from './features/account/types'
import { ACTIVATION_STORAGE_KEY } from './features/activation/types'

type AppStep = 'activation' | 'create-account' | 'complete'

function getInitialStep(): AppStep {
  if (localStorage.getItem(ACCOUNT_STORAGE_KEY) === 'true') {
    return 'complete'
  }

  if (localStorage.getItem(ACTIVATION_STORAGE_KEY) === 'true') {
    return 'create-account'
  }

  return 'activation'
}

function App() {
  const [step, setStep] = useState<AppStep>(getInitialStep)

  if (step === 'complete') {
    return <CreateAccountScreen />
  }

  if (step === 'create-account') {
    return (
      <CreateAccountScreen
        onComplete={() => setStep('complete')}
        onSignIn={() => setStep('activation')}
      />
    )
  }

  return (
    <ActivationForm
      onSuccess={() => {
        localStorage.setItem(ACTIVATION_STORAGE_KEY, 'true')
        setStep('create-account')
      }}
    />
  )
}

export default App

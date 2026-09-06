import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import CreateAccountScreen from './features/account/components/CreateAccountScreen'
import SignInScreen from './features/account/components/SignInScreen'
import ActivationStep1 from './features/activation/components/ActivationStep1'
import { AuthProvider } from './features/auth/context/AuthProvider'

function AppRoutes() {
  const navigate = useNavigate()

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/activate" replace />} />
      <Route
        path="/activate"
        element={
          <ActivationStep1
            onContinueToAccount={() => navigate('/create-account')}
            onSignIn={() => navigate('/sign-in')}
          />
        }
      />
      <Route
        path="/create-account"
        element={
          <CreateAccountScreen
            onSignIn={() => navigate('/sign-in')}
            onRestartActivation={() => navigate('/activate')}
          />
        }
      />
      <Route
        path="/sign-in"
        element={
          <SignInScreen
            onCreateAccount={() => navigate('/create-account')}
            onRestartActivation={() => navigate('/activate')}
          />
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App

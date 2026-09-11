import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import CreateAccountScreen from './features/account/components/CreateAccountScreen'
import SignInScreen from './features/account/components/SignInScreen'
import ForgotPasswordScreen from './features/account/components/ForgotPasswordScreen'
import ResetPasswordScreen from './features/account/components/ResetPasswordScreen'
import ActivationStep1 from './features/activation/components/ActivationStep1'
import ActivationContinueScreen from './features/activation/components/ActivationContinueScreen'
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
            onForgotPassword={() => navigate('/forgot-password')}
          />
        }
      />
      <Route
        path="/forgot-password"
        element={
          <ForgotPasswordScreen onBackToSignIn={() => navigate('/sign-in')} />
        }
      />
      <Route
        path="/reset-password"
        element={
          <ResetPasswordScreen
            onContinue={() => navigate('/create-account', { replace: true })}
            onSignIn={() => navigate('/sign-in')}
            onRequestNewLink={() => navigate('/forgot-password')}
          />
        }
      />
      <Route
        path="/activation/continue"
        element={
          <ActivationContinueScreen
            onResume={() => navigate('/create-account', { replace: true })}
            onSignIn={() => navigate('/sign-in')}
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

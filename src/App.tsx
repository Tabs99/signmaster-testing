import { useCallback } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import CreateAccountScreen from './features/account/components/CreateAccountScreen'
import DashboardScreen from './features/dashboard/components/DashboardScreen'
import LandingScreen from './features/landing/components/LandingScreen'
import QuizScreen from './features/quiz/components/QuizScreen'
import QuizHomeScreen from './features/quiz/components/QuizHomeScreen'
import SignInScreen from './features/account/components/SignInScreen'
import ForgotPasswordScreen from './features/account/components/ForgotPasswordScreen'
import ResetPasswordScreen from './features/account/components/ResetPasswordScreen'
import ActivationStep1 from './features/activation/components/ActivationStep1'
import ActivationContinueScreen from './features/activation/components/ActivationContinueScreen'
import ProtectedRoute from './features/routing/components/ProtectedRoute'
import { AuthProvider } from './features/auth/context/AuthProvider'

function AppRoutes() {
  const navigate = useNavigate()
  // Stable identity so the post-activation auto-navigation effect in
  // ActivationClaimResult depends on a callback that never changes, and
  // therefore fires exactly once when finalisation succeeds.
  const enterApp = useCallback(() => {
    navigate('/app')
  }, [navigate])

  return (
    <Routes>
      {/*
        `/` used to redirect straight to activation. It now serves the public
        landing page, which is the only change this feature makes to existing
        behaviour. `/activate` is untouched, so the QR printed on the cards —
        https://signmastercards.co.uk/activate — is unaffected.
      */}
      <Route path="/" element={<LandingScreen />} />
      <Route
        path="/activate"
        element={
          <ActivationStep1
            onSignIn={() => navigate('/sign-in')}
            onEnterApp={enterApp}
          />
        }
      />
      <Route
        path="/create-account"
        element={
          <CreateAccountScreen
            onSignIn={() => navigate('/sign-in')}
            onRestartActivation={() => navigate('/activate')}
            onEnterApp={enterApp}
          />
        }
      />
      <Route
        path="/sign-in"
        element={
          <SignInScreen
            onCreateAccount={() => navigate('/create-account')}
            onForgotPassword={() => navigate('/forgot-password')}
            onEnterApp={enterApp}
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
            onContinue={() => navigate('/app', { replace: true })}
            onSignIn={() => navigate('/sign-in')}
            onRequestNewLink={() => navigate('/forgot-password')}
          />
        }
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <DashboardScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/quiz"
        element={
          <ProtectedRoute>
            <QuizHomeScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/quiz/play"
        element={
          <ProtectedRoute>
            <QuizScreen />
          </ProtectedRoute>
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

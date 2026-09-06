import { useActivationCompletion } from '../hooks/useActivationCompletion'
import type { ActivationClaimState } from '../hooks/useActivationClaimWhenReady'
import type { ActivationCompletionResult } from '../../../lib/api/activationCompletionApi'
import {
  resolveActivationContinuationView,
  type ActivationContinuationView,
} from '../utils/activationContinuation'
import { ACTIVATION_INELIGIBLE_COPY } from '../utils/activationResultCopy'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import ActivationStatusPlate, {
  type ActivationStatusTone,
} from './ActivationStatusPlate'
import LoadingSpinner from './LoadingSpinner'

export interface ActivationClaimResultProps {
  claimState: ActivationClaimState
  onRetryClaim?: () => void
  onSignIn?: () => void
  onRestartActivation?: () => void
  onGetSupport?: () => void
  onContinue?: () => void
  complete?: (options?: {
    fetchFn?: typeof fetch
    getAccessToken?: () => Promise<string | null>
  }) => Promise<ActivationCompletionResult>
}

interface PlateAction {
  label: string
  onClick: () => void
  loading?: boolean
  disabled?: boolean
}

interface PlateContent {
  tone: ActivationStatusTone
  heading: string
  body: readonly string[]
  primaryAction?: PlateAction
  secondaryAction?: PlateAction
}

function claimOutcomeAttribute(claimState: ActivationClaimState): string | undefined {
  return claimState.kind === 'outcome' ? claimState.outcome : undefined
}

function LoadingCard({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex items-center gap-3 rounded-md border border-white/20 bg-keyline-pane px-4 py-4 text-left"
    >
      <LoadingSpinner />
      <p className="text-[14px] font-semibold leading-snug text-white/80">{message}</p>
    </div>
  )
}

export default function ActivationClaimResult({
  claimState,
  onRetryClaim,
  onSignIn,
  onRestartActivation,
  onGetSupport,
  onContinue,
  complete,
}: ActivationClaimResultProps) {
  const completion = useActivationCompletion(complete ? { complete } : {})
  const view = resolveActivationContinuationView(claimState, completion.state)

  if (view === 'idle') {
    return null
  }

  if (view === 'claiming') {
    return (
      <div
        className="w-full max-w-[420px]"
        data-continuation-view={view}
        data-claim-outcome={claimOutcomeAttribute(claimState)}
      >
        <LoadingCard message="Activating your access…" />
      </div>
    )
  }

  const content = resolvePlateContent(view, {
    completion,
    onRetryClaim,
    onSignIn,
    onRestartActivation,
    onGetSupport,
    onContinue,
  })

  return (
    <div
      className="w-full max-w-[420px]"
      data-continuation-view={view}
      data-claim-outcome={claimOutcomeAttribute(claimState)}
    >
      <ActivationStatusPlate
        data-testid="activation-claim-result"
        tone={content.tone}
        heading={content.heading}
        body={content.body}
        primaryAction={content.primaryAction}
        secondaryAction={content.secondaryAction}
      />
    </div>
  )
}

interface PlateContentDeps {
  completion: ReturnType<typeof useActivationCompletion>
  onRetryClaim?: () => void
  onSignIn?: () => void
  onRestartActivation?: () => void
  onGetSupport?: () => void
  onContinue?: () => void
}

function resolvePlateContent(
  view: Exclude<ActivationContinuationView, 'idle' | 'claiming'>,
  deps: PlateContentDeps,
): PlateContent {
  const {
    completion,
    onRetryClaim,
    onSignIn,
    onRestartActivation,
    onGetSupport,
    onContinue,
  } = deps

  const continueAction = (label: string, loading: boolean): PlateAction => ({
    label,
    onClick: () => completion.run(),
    loading,
  })

  const restartAction = (label: string): PlateAction | undefined =>
    onRestartActivation ? { label, onClick: onRestartActivation } : undefined

  const supportAction = (): PlateAction | undefined =>
    onGetSupport ? { label: 'Get support', onClick: onGetSupport } : undefined

  switch (view) {
    case 'activated_pending_finalize':
      return {
        tone: 'success',
        heading: "You're in — SignMaster is activated",
        body: [
          'Your purchase is verified and your app access is now active on this account.',
        ],
        primaryAction: continueAction('Continue', false),
      }
    case 'finalizing':
      return {
        tone: 'success',
        heading: "You're in — SignMaster is activated",
        body: [
          'Your purchase is verified and your app access is now active on this account.',
        ],
        primaryAction: continueAction('Continue', true),
      }
    case 'activated':
      return {
        tone: 'success',
        heading: 'Your SignMaster access is active',
        body: [
          'Everything is set up on this account.',
          'Your companion learning app opens here in an upcoming update.',
        ],
        primaryAction: onContinue
          ? { label: 'Continue', onClick: onContinue }
          : undefined,
      }
    case 'finalize_retryable_error':
      return {
        tone: 'success',
        heading: 'Your SignMaster access is active',
        body: [
          'Your access is active on this account.',
          "We couldn't finish tidying up your activation session. You can try again.",
        ],
        primaryAction: {
          label: 'Try again',
          onClick: () => completion.run(),
          loading: completion.state.kind === 'loading',
        },
      }
    case 'already_claimed': {
      const signInAction = onSignIn
        ? { label: 'Sign in', onClick: onSignIn }
        : undefined
      const anotherOrderAction = restartAction('Use another order')

      return {
        tone: 'info',
        heading: 'This order is linked to another account',
        body: [
          'This SignMaster order has already been used to activate a different account.',
          'Sign in to that account, or verify a different order to continue.',
        ],
        primaryAction: signInAction ?? anotherOrderAction,
        secondaryAction: signInAction
          ? (anotherOrderAction ?? supportAction())
          : supportAction(),
      }
    }
    case 'not_eligible':
      return {
        tone: 'warning',
        heading: "This order can't activate SignMaster",
        body: [ACTIVATION_INELIGIBLE_COPY.fallback],
        primaryAction: restartAction('Use another order'),
        secondaryAction: supportAction(),
      }
    case 'no_context':
      return {
        tone: 'neutral',
        heading: "Let's verify your order",
        body: [
          "We couldn't find a verified purchase for this session.",
          'Verify your Amazon order again to continue activation.',
        ],
        primaryAction: restartAction('Verify my order'),
      }
    case 'context_expired':
      return {
        tone: 'warning',
        heading: 'Your activation session expired',
        body: ['Please verify your Amazon order again to continue.'],
        primaryAction: restartAction('Restart activation'),
      }
    case 'email_not_confirmed':
      return {
        tone: 'neutral',
        heading: 'Confirm your email to continue',
        body: [AUTH_MESSAGES.emailConfirmationRequired],
        primaryAction: onSignIn ? { label: 'Sign in', onClick: onSignIn } : undefined,
      }
    case 'unauthenticated':
      return {
        tone: 'neutral',
        heading: 'Please sign in to continue',
        body: ['Sign in to your SignMaster account to activate access.'],
        primaryAction: onSignIn ? { label: 'Sign in', onClick: onSignIn } : undefined,
      }
    case 'claim_retryable_error':
      return {
        tone: 'neutral',
        heading: "We couldn't activate your access right now",
        body: [
          'SignMaster is temporarily unavailable and your purchase has not been changed.',
          'Please try again in a moment.',
        ],
        primaryAction: onRetryClaim
          ? { label: 'Try again', onClick: onRetryClaim }
          : undefined,
      }
  }
}

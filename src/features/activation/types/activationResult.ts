import type { ActivationVerifyResult } from '../../../lib/api/activationApi'
import type { ActivationContextCreateResult } from '../../../lib/api/activationContextApi'

export type ActivationUiPhase = 'entry' | 'checking' | 'result'

export type ActivationResultKind =
  | 'eligible'
  | 'not_found'
  | 'not_shipped'
  | 'already_claimed'
  | 'cancelled'
  | 'returned'
  | 'rate_limited'
  | 'service_unavailable'
  | 'connection_error'

export interface ActivationStep1Props {
  verifyOrder?: (orderId: string) => Promise<ActivationVerifyResult>
  createContext?: (orderId: string) => Promise<ActivationContextCreateResult>
  /** @deprecated Progressive activation reveals account setup inline; optional legacy hook. */
  onContinueToAccount?: () => void
  onSignIn?: () => void
  onEnterApp?: () => void
}

export interface ActivationStatusContent {
  tone: 'success' | 'info' | 'neutral' | 'warning'
  heading: string
  body: readonly string[]
  showOrderId: boolean
  primaryLabel: string
  secondaryLabel?: string
  secondaryKind?: 'support' | 'help' | 'use_another_order'
}

export function mapVerifyResultToKind(result: ActivationVerifyResult): ActivationResultKind {
  switch (result.kind) {
    case 'business_status':
      switch (result.status) {
        case 'ELIGIBLE':
          return 'eligible'
        case 'NOT_FOUND':
          return 'not_found'
        case 'NOT_SHIPPED':
          return 'not_shipped'
        case 'ALREADY_CLAIMED':
          return 'already_claimed'
        case 'CANCELLED':
          return 'cancelled'
        case 'RETURNED':
          return 'returned'
      }
      break
    case 'invalid_order_id':
      throw new Error('invalid_order_id must be handled before mapping to UI state')
    case 'rate_limited':
      return 'rate_limited'
    case 'service_unavailable':
      return 'service_unavailable'
    case 'connection_error':
      return 'connection_error'
  }
}

export function getActivationStatusContent(
  kind: ActivationResultKind,
): ActivationStatusContent {
  switch (kind) {
    case 'eligible':
      return {
        tone: 'success',
        heading: 'Your purchase is verified',
        body: [
          'Your SignMaster purchase has been verified.',
          'Next, create an account or sign in to activate access and save your progress.',
        ],
        showOrderId: true,
        primaryLabel: 'Continue to account setup',
      }
    case 'not_found':
      return {
        tone: 'warning',
        heading: "We can't verify that order",
        body: [
          'Please check the digits and make sure this is the Amazon order for your SignMaster flashcards.',
          'If you placed the order recently, it may take a little time to appear. Please try again later.',
        ],
        showOrderId: true,
        primaryLabel: 'Check the number',
        secondaryLabel: 'Show me where to look',
        secondaryKind: 'help',
      }
    case 'not_shipped':
      return {
        tone: 'neutral',
        heading: 'Your order is confirmed',
        body: [
          'App access will be available once Amazon dispatches your order.',
          'Please try again after dispatch.',
        ],
        showOrderId: true,
        primaryLabel: 'Check again',
        secondaryLabel: 'Use another order',
        secondaryKind: 'use_another_order',
      }
    case 'already_claimed':
      return {
        tone: 'info',
        heading: 'This order has already been used',
        body: [
          'A SignMaster account has already been activated with this order.',
          'Sign in to that account to carry on where you left off.',
        ],
        showOrderId: true,
        primaryLabel: 'Sign in',
        secondaryLabel: 'Use another order',
        secondaryKind: 'use_another_order',
      }
    case 'cancelled':
      return {
        tone: 'warning',
        heading: 'That order was cancelled',
        body: ["This order was cancelled, so it can't be used to activate SignMaster."],
        showOrderId: true,
        primaryLabel: 'Try another Order ID',
        secondaryLabel: 'Get support',
        secondaryKind: 'support',
      }
    case 'returned':
      return {
        tone: 'warning',
        heading: 'That pack was returned',
        body: [
          "It looks like the SignMaster pack from this order was returned, so this order can't be used to activate app access.",
          "If that's not right, get in touch.",
        ],
        showOrderId: true,
        primaryLabel: 'Try another Order ID',
        secondaryLabel: 'Get support',
        secondaryKind: 'support',
      }
    case 'rate_limited':
      return {
        tone: 'neutral',
        heading: "Let's give that a moment",
        body: [
          "We've had several verification attempts. Please wait a few minutes before trying again.",
          'If you still need help, contact support.',
        ],
        showOrderId: true,
        primaryLabel: 'Check again',
        secondaryLabel: 'Use another order',
        secondaryKind: 'use_another_order',
      }
    case 'service_unavailable':
      return {
        tone: 'neutral',
        heading: "We can't check your order right now",
        body: [
          'SignMaster is temporarily unavailable. Your order number has been kept.',
          'Please try again in a few minutes.',
        ],
        showOrderId: true,
        primaryLabel: 'Try again',
        secondaryLabel: 'Use another order',
        secondaryKind: 'use_another_order',
      }
    case 'connection_error':
      return {
        tone: 'neutral',
        heading: "We couldn't connect",
        body: [
          'Check your internet connection and try again.',
          'Your order number has been kept.',
        ],
        showOrderId: true,
        primaryLabel: 'Try again',
        secondaryLabel: 'Use another order',
        secondaryKind: 'use_another_order',
      }
  }
}

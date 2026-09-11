import PageShell from '../../../components/layout/PageShell'
import BrandLockup from '../../activation/components/BrandLockup'
import ActivationStatusPlate from '../../activation/components/ActivationStatusPlate'

const SUPPORT_EMAIL = 'support@signmastercards.co.uk'

export interface ActivationRequiredScreenProps {
  /** "Verify my order" — routes to the activation entry point. */
  onVerifyOrder: () => void
  /** "Use another account" — signs out, then returns to sign in. */
  onUseAnotherAccount: () => void
}

/**
 * Frozen state B10: an authenticated user with no active entitlement and no
 * resumable activation context. Their account exists, but access is not
 * unlocked until they verify an Amazon order. This screen never reveals any
 * order/entitlement detail — it only offers the two forward paths plus support.
 */
export default function ActivationRequiredScreen({
  onVerifyOrder,
  onUseAnotherAccount,
}: ActivationRequiredScreenProps) {
  return (
    <PageShell>
      <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
        <BrandLockup variant="desktop" />
        <div className="w-full" data-testid="activation-required">
          <ActivationStatusPlate
            tone="neutral"
            heading="Finish activating SignMaster"
            body={[
              'Your account is ready. Verify your Amazon order to activate access.',
            ]}
            primaryAction={{ label: 'Verify my order', onClick: onVerifyOrder }}
            secondaryAction={{
              label: 'Use another account',
              onClick: onUseAnotherAccount,
            }}
          />
          <div className="mt-4 text-center">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=SignMaster%20activation%20help`}
              className="text-[13px] font-semibold text-accent-gold underline underline-offset-2"
            >
              Get support
            </a>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

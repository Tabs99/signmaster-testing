import logo from '../../../assets/signmaster-logo.png'

interface BrandLockupProps {
  variant?: 'mobile' | 'desktop'
  /** Decorative gold bar under the tagline; off when it would crowd nearby status UI. */
  showDivider?: boolean
}

const LOGO_WIDTH: Record<NonNullable<BrandLockupProps['variant']>, string> = {
  mobile: 'w-[163px] max-[667px]:w-[130px]',
  desktop: 'w-[212px]',
}

export default function BrandLockup({ variant = 'mobile', showDivider = true }: BrandLockupProps) {
  const isMobile = variant === 'mobile'

  return (
    <div
      className={`flex flex-col items-center text-center ${isMobile ? 'mb-7 max-[667px]:mb-4 lg:hidden' : ''}`}
    >
      <img
        src={logo}
        alt="SignMaster"
        className={`h-auto object-contain ${LOGO_WIDTH[variant]}`}
      />
      <p className="mt-3 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.13em] text-white/[0.55] max-[667px]:mt-2">
        Master the Road. One Sign at a Time.
      </p>
      {showDivider ? (
        <div
          data-testid="brand-lockup-gold-divider"
          className={`mt-[18px] bg-keyline-gold/55 max-[667px]:mt-3 ${isMobile ? 'h-0.5 w-8' : 'h-0.5 w-10'}`}
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}

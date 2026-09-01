import logo from '../../../assets/logo.png'

export default function SignMasterLogo() {
  return (
    <div className="mb-7 flex flex-col items-center">
      <img
        src={logo}
        alt="SignMaster"
        className="h-[100px] w-auto object-contain xs:h-[140px]"
      />
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.13em] text-white/40">
        Master the Road. One Sign at a Time.
      </p>
    </div>
  )
}

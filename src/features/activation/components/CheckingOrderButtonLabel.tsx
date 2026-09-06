import LoadingSpinner from './LoadingSpinner'

export default function CheckingOrderButtonLabel() {
  return (
    <span className="inline-flex items-center gap-2">
      <LoadingSpinner />
      Checking your order…
    </span>
  )
}

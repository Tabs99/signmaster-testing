interface OrderIdHintProps {
  onOpenHelp: () => void
}

export default function OrderIdHint({ onOpenHelp }: OrderIdHintProps) {
  return (
    <button
      type="button"
      onClick={onOpenHelp}
      className="block min-h-11 py-3.5 text-xs font-medium text-accent-gold/90 underline underline-offset-2 transition-opacity hover:opacity-80"
    >
      Where can I find this?
    </button>
  )
}

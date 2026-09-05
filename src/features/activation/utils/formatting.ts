export function formatOrderId(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 17)

  if (digits.length <= 3) {
    return digits
  }

  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
}

export function normalisePastedOrderId(raw: string): string {
  return formatOrderId(raw.trim())
}

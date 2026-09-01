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

export function normalisePostcode(raw: string): string {
  const stripped = raw.toUpperCase().replace(/\s+/g, '')

  if (stripped.length >= 5) {
    return `${stripped.slice(0, -3)} ${stripped.slice(-3)}`
  }

  return stripped
}

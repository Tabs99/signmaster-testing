export class SearchOrdersError extends Error {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'SearchOrdersError'
    this.statusCode = statusCode
  }
}

export function getSafeSearchOrdersErrorMessage(
  data: unknown,
  statusCode: number,
): string {
  if (
    data &&
    typeof data === 'object' &&
    'errors' in data &&
    Array.isArray(data.errors)
  ) {
    const firstError = data.errors[0]

    if (
      firstError &&
      typeof firstError === 'object' &&
      'message' in firstError &&
      typeof firstError.message === 'string' &&
      firstError.message.trim()
    ) {
      return `Amazon searchOrders failed with status ${statusCode}: ${firstError.message.trim()}`
    }
  }

  return `Amazon searchOrders failed with status ${statusCode}`
}

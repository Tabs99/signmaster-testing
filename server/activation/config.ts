export class ActivationConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActivationConfigError'
  }
}

export function getActivationTargetAsin(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const targetAsin = env.TARGET_ASIN?.trim()

  if (!targetAsin) {
    throw new ActivationConfigError(
      'Missing required activation environment variable: TARGET_ASIN',
    )
  }

  return targetAsin
}

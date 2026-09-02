export interface SpApiConfig {
  endpoint: string
  marketplaceId: string
  targetAsin: string
}

const REQUIRED_SP_API_ENV_VARS = [
  'SP_API_ENDPOINT',
  'SP_API_MARKETPLACE_ID',
  'TARGET_ASIN',
] as const

export function getMissingSpApiEnvVars(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return REQUIRED_SP_API_ENV_VARS.filter((name) => !env[name]?.trim())
}

export function getSpApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): SpApiConfig {
  const missing = getMissingSpApiEnvVars(env)

  if (missing.length > 0) {
    throw new Error(
      `Missing required Amazon SP-API environment variables: ${missing.join(', ')}`,
    )
  }

  return {
    endpoint: env.SP_API_ENDPOINT!.trim().replace(/\/$/, ''),
    marketplaceId: env.SP_API_MARKETPLACE_ID!.trim(),
    targetAsin: env.TARGET_ASIN!.trim(),
  }
}

export function hasSpApiSearchConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getMissingSpApiEnvVars(env).length === 0
}

export interface LwaCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
}

const REQUIRED_LWA_ENV_VARS = [
  'SP_API_CLIENT_ID',
  'SP_API_CLIENT_SECRET',
  'SP_API_REFRESH_TOKEN',
] as const

export function getMissingLwaEnvVars(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return REQUIRED_LWA_ENV_VARS.filter((name) => !env[name]?.trim())
}

export function getLwaCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LwaCredentials {
  const missing = getMissingLwaEnvVars(env)

  if (missing.length > 0) {
    throw new Error(
      `Missing required Amazon LWA environment variables: ${missing.join(', ')}`,
    )
  }

  return {
    clientId: env.SP_API_CLIENT_ID!.trim(),
    clientSecret: env.SP_API_CLIENT_SECRET!.trim(),
    refreshToken: env.SP_API_REFRESH_TOKEN!.trim(),
  }
}

export function hasLwaCredentials(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getMissingLwaEnvVars(env).length === 0
}

export interface SupabaseConfig {
  url: string
  secretKey: string
}

const REQUIRED_SUPABASE_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
] as const

export const LOCAL_TASK3_REFUSAL_MESSAGE =
  'Task 3 local sync refused: Supabase URL is not local'

export function getMissingSupabaseEnvVars(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return REQUIRED_SUPABASE_ENV_VARS.filter((name) => !env[name]?.trim())
}

export function hasSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getMissingSupabaseEnvVars(env).length === 0
}

export function getSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseConfig {
  const missing = getMissingSupabaseEnvVars(env)

  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase environment variables: ${missing.join(', ')}`,
    )
  }

  return {
    url: env.SUPABASE_URL!.trim(),
    secretKey: env.SUPABASE_SECRET_KEY!.trim(),
  }
}

export function isLocalSupabaseUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === '127.0.0.1' || hostname === 'localhost'
  } catch {
    return false
  }
}

export function assertLocalSupabaseUrl(url: string): void {
  if (!isLocalSupabaseUrl(url)) {
    throw new Error(LOCAL_TASK3_REFUSAL_MESSAGE)
  }
}

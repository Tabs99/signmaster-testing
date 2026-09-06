export interface BrowserSupabaseConfig {
  url: string
  anonKey: string
}

const REQUIRED_BROWSER_SUPABASE_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const

export function getMissingBrowserSupabaseEnvVars(
  env: Record<string, string | undefined> = import.meta.env,
): string[] {
  return REQUIRED_BROWSER_SUPABASE_ENV_VARS.filter((name) => !env[name]?.trim())
}

export function getBrowserSupabaseConfig(
  env: Record<string, string | undefined> = import.meta.env,
): BrowserSupabaseConfig {
  const missing = getMissingBrowserSupabaseEnvVars(env)
  if (missing.length > 0) {
    throw new Error(
      `Missing required browser Supabase environment variables: ${missing.join(', ')}`,
    )
  }

  return {
    url: env.VITE_SUPABASE_URL!.trim(),
    anonKey: env.VITE_SUPABASE_ANON_KEY!.trim(),
  }
}

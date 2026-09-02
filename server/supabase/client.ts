import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseConfig, type SupabaseConfig } from './config.ts'

export function createServiceRoleClient(
  config: SupabaseConfig,
): SupabaseClient {
  return createClient(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function createServiceRoleClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseClient {
  return createServiceRoleClient(getSupabaseConfig(env))
}

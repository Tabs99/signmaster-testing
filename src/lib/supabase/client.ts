import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getBrowserSupabaseConfig } from './config'

let browserClient: SupabaseClient | null = null

export function createBrowserSupabaseClient(
  url: string,
  anonKey: string,
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })
}

export function getBrowserSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    const config = getBrowserSupabaseConfig()
    browserClient = createBrowserSupabaseClient(config.url, config.anonKey)
  }

  return browserClient
}

export function resetBrowserSupabaseClientForTests(): void {
  browserClient = null
}

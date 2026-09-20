import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FIXTURE_CLEANUP_TABLES = [
  'public.activation_continuations',
  'public.activation_contexts',
  'public.app_entitlements',
  'public.amazon_order_items',
  'public.amazon_orders',
] as const

const MIGRATION_PREFIX = '20260921120000_service_role_fixture_table_delete'

function readFixtureDeleteGrantMigration(): string {
  const migrationsDir = join(process.cwd(), 'supabase/migrations')
  const filename = readdirSync(migrationsDir).find((name) =>
    name.startsWith(MIGRATION_PREFIX),
  )

  if (!filename) {
    throw new Error(`Missing migration ${MIGRATION_PREFIX}*.sql`)
  }

  return readFileSync(join(migrationsDir, filename), 'utf8')
}

describe('service_role fixture cleanup table DELETE grants', () => {
  it('grants delete on every fixture cleanup table to service_role only', () => {
    const sql = readFixtureDeleteGrantMigration()

    for (const table of FIXTURE_CLEANUP_TABLES) {
      expect(sql).toMatch(
        new RegExp(
          `grant\\s+delete\\s+on\\s+table\\s+${table.replace('.', '\\.')}\\s+to\\s+service_role`,
          'i',
        ),
      )
    }

    expect(sql.toLowerCase()).not.toMatch(/grant\s+delete[\s\S]*\bto\s+anon\b/)
    expect(sql.toLowerCase()).not.toMatch(
      /grant\s+delete[\s\S]*\bto\s+authenticated\b/,
    )
  })
})

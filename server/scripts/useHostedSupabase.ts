import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Points `.env.local` at a hosted Supabase project.
 *
 * There is no container runtime on every machine that works on this app, so a
 * local Supabase stack is not always available. This rewrites the four Supabase
 * variables to target a hosted project instead, and leaves every other line in
 * the file exactly as it was.
 *
 *   npm run env:hosted -- <project-ref>
 *
 * It uses the new-format keys (`sb_publishable_…` and `sb_secret_…`) rather
 * than the legacy JWT ones, so a project whose legacy keys have been rotated
 * keeps working.
 *
 * No key is ever printed. The script reports only which variables it set and
 * the first few characters of each, which is what the dashboard shows too.
 */

const SUPABASE_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
] as const

interface ApiKey {
  api_key: string
  type: string
  name: string
}

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function fetchApiKeys(projectRef: string): ApiKey[] {
  // `--reveal` is required for the secret key; the output is parsed here and
  // never written to stdout.
  const raw = execFileSync(
    'npx',
    [
      'supabase',
      'projects',
      'api-keys',
      '--project-ref',
      projectRef,
      '--reveal',
      '--output',
      'json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )

  try {
    return JSON.parse(raw) as ApiKey[]
  } catch {
    fail('Could not read the API key list from the Supabase CLI')
  }
}

function pickKey(keys: readonly ApiKey[], type: 'publishable' | 'secret'): string {
  const match = keys.find((key) => key.type === type)

  if (!match?.api_key || match.api_key.includes('·')) {
    fail(
      `No readable ${type} key for this project. Run \`npx supabase login\` and try again.`,
    )
  }

  return match.api_key
}

/**
 * Replaces each variable in place, keeping its position, and appends any that
 * were not already present. Every other line — Amazon credentials, activation
 * settings, anything else — is passed through untouched.
 *
 * A name that appears more than once is rewritten at every occurrence. Updating
 * only the first would leave a later duplicate holding the old value, and both
 * dotenv and `process.loadEnvFile` keep the last one — so the stale value would
 * silently win.
 */
function applyValues(
  contents: string,
  values: Readonly<Record<string, string>>,
): string {
  const lines = contents.length > 0 ? contents.split('\n') : []
  const applied = new Set<string>()

  const updated = lines.map((line) => {
    const name = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1]

    if (!name || !(name in values)) {
      return line
    }

    applied.add(name)
    return `${name}=${values[name]}`
  })

  const missing = Object.keys(values).filter((name) => !applied.has(name))

  if (missing.length > 0) {
    if (updated.length > 0 && updated[updated.length - 1].trim() !== '') {
      updated.push('')
    }

    updated.push('# Hosted Supabase, set by npm run env:hosted')
    for (const name of missing) {
      updated.push(`${name}=${values[name]}`)
    }
  }

  return `${updated.join('\n').replace(/\n+$/, '')}\n`
}

function preview(value: string): string {
  return value.startsWith('http') ? value : `${value.slice(0, 12)}…`
}

function main(): void {
  const projectRef = process.argv[2]

  if (!projectRef || !/^[a-z]{20}$/.test(projectRef)) {
    fail('Usage: npm run env:hosted -- <project-ref>')
  }

  const repoRoot = resolve(import.meta.dirname, '..', '..')
  const envPath = join(repoRoot, '.env.local')
  const keys = fetchApiKeys(projectRef)

  const values: Record<string, string> = {
    VITE_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    VITE_SUPABASE_ANON_KEY: pickKey(keys, 'publishable'),
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_SECRET_KEY: pickKey(keys, 'secret'),
  }

  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''

  if (existing) {
    const backupPath = `${envPath}.bak-${Date.now()}`
    copyFileSync(envPath, backupPath)
    console.log(`  previous file kept at ${backupPath.replace(repoRoot + '/', '')}`)
  }

  writeFileSync(envPath, applyValues(existing, values), 'utf8')

  console.log(`✓ .env.local now points at ${projectRef}`)
  for (const name of SUPABASE_KEYS) {
    console.log(`  ${name} = ${preview(values[name])}`)
  }
  console.log('\n  Start the full stack with: npm run dev:full')
}

main()

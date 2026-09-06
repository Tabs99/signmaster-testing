import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface VercelConfig {
  rewrites?: Array<{ source: string; destination: string }>
}

function isApiRoute(path: string): boolean {
  return path.startsWith('/api/')
}

describe('vercel.json', () => {
  it('rewrites non-API browser routes to index.html for SPA refresh', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig

    expect(config.rewrites).toEqual([
      {
        source: '/((?!api/).*)',
        destination: '/index.html',
      },
    ])

    for (const path of ['/sign-in', '/create-account', '/activate', '/']) {
      expect(isApiRoute(path)).toBe(false)
    }

    expect(isApiRoute('/api/activation/verify')).toBe(true)
  })
})

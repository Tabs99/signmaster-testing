import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface VercelConfig {
  rewrites?: Array<{ source: string; destination: string }>
}

const SPA_REWRITE_SOURCE =
  '/((?!api/|src/|@vite|@react-refresh|@id|node_modules|assets|vite\\.svg).*)'

function matchesSpaRewrite(path: string, rewriteSource: string): boolean {
  const innerPattern = rewriteSource.match(/^\/\((.+)\)$/)?.[1]

  if (!innerPattern) {
    throw new Error(`Unexpected rewrite source format: ${rewriteSource}`)
  }

  return new RegExp(`^/${innerPattern}$`).test(path)
}

describe('vercel.json', () => {
  it('rewrites SPA browser routes to index.html while excluding API and Vite dev paths', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig

    expect(config.rewrites).toEqual([
      {
        source: SPA_REWRITE_SOURCE,
        destination: '/index.html',
      },
    ])

    const rewriteSource = config.rewrites![0]!.source

    const spaPaths = ['/sign-in', '/create-account', '/activate', '/']
    for (const path of spaPaths) {
      expect(matchesSpaRewrite(path, rewriteSource)).toBe(true)
    }

    const excludedPaths = [
      '/api/activation/verify',
      '/src/main.tsx',
      '/@vite/client',
      '/@react-refresh',
      '/@id/react',
      '/node_modules/.vite/deps/react.js',
      '/assets/index-abc123.js',
      '/vite.svg',
    ]
    for (const path of excludedPaths) {
      expect(matchesSpaRewrite(path, rewriteSource)).toBe(false)
    }
  })
})

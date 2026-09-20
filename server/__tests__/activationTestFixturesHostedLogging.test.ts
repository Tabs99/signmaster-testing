import { describe, expect, it, vi } from 'vitest'
import { ACTIVATION_TEST_RESET_ORDER_IDS } from '../scripts/activationTestFixturesLocalHelpers.ts'
import { logHostedFixtureOperationIntent } from '../scripts/activationTestFixturesHostedLogging.ts'

describe('hosted fixture operation logging', () => {
  it('prints only safe metadata and never secret env names as values', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    logHostedFixtureOperationIntent({
      operation: 'seed',
      projectRef: 'abcdefghijklmnop',
      targetAsin: 'B0H8ZRL6DK',
    })

    const output = log.mock.calls.flat().join('\n')
    expect(output).toContain('abcdefghijklmnop')
    expect(output).toContain('B0H8ZRL6DK')
    expect(output).toContain(String(ACTIVATION_TEST_RESET_ORDER_IDS.length))
    expect(output).not.toMatch(/SUPABASE_SECRET_KEY=/)
    expect(output).not.toMatch(/eyJ/)

    log.mockRestore()
  })
})

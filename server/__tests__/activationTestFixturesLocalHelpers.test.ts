import { describe, expect, it } from 'vitest'
import {
  assertLocalSupabaseUrl,
  LOCAL_TASK3_REFUSAL_MESSAGE,
} from '../supabase/config.ts'
import {
  ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID,
  ACTIVATION_TEST_RESET_ORDER_IDS,
  ACTIVATION_TEST_SEED_ORDER_IDS,
  assertOnlyActivationTestResetOrderIds,
  buildActivationTestOrderSeeds,
  buildFixtureCleanupSqlStatements,
  getActivationTestFixtureExpectations,
  getPartialReturnRetainedQuantity,
  getWrongProductFixtureAsin,
} from '../scripts/activationTestFixturesLocalHelpers.ts'

describe('activation test fixture helpers', () => {
  it('lists all reserved reset order IDs including the absent NOT_FOUND fixture', () => {
    expect(ACTIVATION_TEST_RESET_ORDER_IDS).toEqual([
      '000-0000000-0000000',
      '111-1111111-1111111',
      '222-2222222-2222222',
      '333-3333333-3333333',
      '444-4444444-4444444',
      '555-5555555-5555555',
      '666-6666666-6666666',
      '777-7777777-7777777',
    ])
  })

  it('does not seed the absent NOT_FOUND fixture order', () => {
    expect(ACTIVATION_TEST_SEED_ORDER_IDS).not.toContain(
      ACTIVATION_TEST_NOT_FOUND_ABSENT_ORDER_ID,
    )
    expect(ACTIVATION_TEST_SEED_ORDER_IDS).toHaveLength(7)
  })

  it('builds cleanup SQL constrained to reserved fixture IDs only', () => {
    const statements = buildFixtureCleanupSqlStatements()

    expect(statements).toHaveLength(3)
    for (const statement of statements) {
      expect(statement).toContain("'000-0000000-0000000'")
      expect(statement).toContain("'777-7777777-7777777'")
      expect(statement).not.toMatch(/where amazon_order_id in \(\);/)
      expect(statement).not.toContain('true')
    }
  })

  it('refuses cleanup for non-reserved order IDs', () => {
    expect(() =>
      assertOnlyActivationTestResetOrderIds(['999-9999999-9999999']),
    ).toThrow(/non-reserved order ID/)
  })

  it('rejects remote Supabase URLs through the shared local guard', () => {
    expect(() =>
      assertLocalSupabaseUrl('https://abcdef.supabase.co'),
    ).toThrow(LOCAL_TASK3_REFUSAL_MESSAGE)
  })

  it('maps fixture definitions to expected backend statuses', () => {
    expect(getActivationTestFixtureExpectations()).toEqual([
      expect.objectContaining({
        orderId: '000-0000000-0000000',
        expectedStatus: 'ELIGIBLE',
        seedable: true,
      }),
      expect.objectContaining({
        orderId: '111-1111111-1111111',
        expectedStatus: 'NOT_FOUND',
        seedable: false,
      }),
      expect.objectContaining({
        orderId: '222-2222222-2222222',
        expectedStatus: 'NOT_SHIPPED',
        seedable: true,
      }),
      expect.objectContaining({
        orderId: '333-3333333-3333333',
        expectedStatus: 'ALREADY_CLAIMED',
        seedable: true,
      }),
      expect.objectContaining({
        orderId: '444-4444444-4444444',
        expectedStatus: 'CANCELLED',
        seedable: true,
      }),
      expect.objectContaining({
        orderId: '555-5555555-5555555',
        expectedStatus: 'RETURNED',
        seedable: true,
      }),
      expect.objectContaining({
        orderId: '666-6666666-6666666',
        expectedStatus: 'NOT_FOUND',
        seedable: true,
      }),
      expect.objectContaining({
        orderId: '777-7777777-7777777',
        expectedStatus: 'ELIGIBLE',
        seedable: true,
      }),
    ])
  })

  it('never uses the current TARGET_ASIN for the wrong-product fixture', () => {
    const targetAsin = 'B0FKBBN52C'
    const seeds = buildActivationTestOrderSeeds(targetAsin)
    const wrongProductSeed = seeds.find(
      (seed) => seed.orderId === '666-6666666-6666666',
    )

    expect(wrongProductSeed).toBeDefined()
    expect(wrongProductSeed!.items[0]?.asin).not.toBe(targetAsin)
    expect(getWrongProductFixtureAsin(targetAsin)).not.toBe(targetAsin)
  })

  it('keeps retained quantity above zero for the partial-return fixture', () => {
    const targetAsin = 'B0TEST12345'
    const partialReturnSeed = buildActivationTestOrderSeeds(targetAsin).find(
      (seed) => seed.orderId === '777-7777777-7777777',
    )

    expect(partialReturnSeed).toBeDefined()

    const item = partialReturnSeed!.items[0]
    expect(
      getPartialReturnRetainedQuantity(
        item.quantityFulfilled,
        item.quantityReturned,
      ),
    ).toBe(1)
  })
})

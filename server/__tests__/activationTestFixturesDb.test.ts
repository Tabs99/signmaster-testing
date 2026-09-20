import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVATION_TEST_RESET_ORDER_IDS,
  buildActivationTestOrderSeeds,
} from '../scripts/activationTestFixturesLocalHelpers.ts'
import {
  deleteActivationTestFixtures,
  FIXTURE_DELETE_TABLES_IN_ORDER,
  fixtureCleanupOrderIds,
  upsertActivationTestFixtures,
} from '../scripts/activationTestFixturesDb.ts'

describe('activationTestFixturesDb', () => {
  it('limits cleanup to reserved synthetic order IDs only', () => {
    expect(() => fixtureCleanupOrderIds(['999-9999999-9999999'] as never)).toThrow(
      /non-reserved order ID/,
    )

    expect(fixtureCleanupOrderIds()).toEqual(ACTIVATION_TEST_RESET_ORDER_IDS)
  })

  it('refuses delete when the allowlist length is unexpected', async () => {
    const client = { from: vi.fn() }

    await expect(
      deleteActivationTestFixtures(client as never, ['000-0000000-0000000'] as never),
    ).rejects.toThrow(/expected 9 reserved order IDs/)
  })

  it('deletes fixture rows from dependent tables before amazon_orders', async () => {
    const calls: Array<{ table: string; orderIds: string[] }> = []

    const client = {
      from(table: string) {
        return {
          delete() {
            return {
              in(column: string, orderIds: string[]) {
                expect(column).toBe('amazon_order_id')
                calls.push({ table, orderIds: [...orderIds] })
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }

    await deleteActivationTestFixtures(client as never)

    expect(calls.map((call) => call.table)).toEqual([
      ...FIXTURE_DELETE_TABLES_IN_ORDER,
    ])

    for (const call of calls) {
      expect(call.orderIds).toEqual([...ACTIVATION_TEST_RESET_ORDER_IDS])
      expect(call.orderIds).not.toContain('205-1234567-1234567')
    }
  })

  it('uses TARGET_ASIN for eligible fixtures and a different ASIN for wrong-product', async () => {
    const targetAsin = 'B0H8ZRL6DK'
    const upserts: Array<{ table: string; row: Record<string, unknown> }> = []

    const client = {
      from(table: string) {
        return {
          upsert(row: Record<string, unknown>) {
            upserts.push({ table, row })
            return Promise.resolve({ error: null })
          },
          delete() {
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }

    await upsertActivationTestFixtures(
      client as never,
      targetAsin,
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    )

    const orderUpserts = upserts.filter((entry) => entry.table === 'amazon_order_items')
    const eligible000 = orderUpserts.find(
      (entry) => entry.row.amazon_order_id === '000-0000000-0000000',
    )
    const wrong666 = orderUpserts.find(
      (entry) => entry.row.amazon_order_id === '666-6666666-6666666',
    )
    const claimed333 = upserts.find(
      (entry) =>
        entry.table === 'app_entitlements' &&
        entry.row.amazon_order_id === '333-3333333-3333333',
    )

    expect(eligible000?.row.asin).toBe(targetAsin)
    expect(wrong666?.row.asin).not.toBe(targetAsin)
    expect(claimed333?.row.user_id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
  })

  it('is idempotent when rerun with the same seeds (upsert per order/item)', async () => {
    const targetAsin = 'B0H8ZRL6DK'
    const upsertCalls = vi.fn().mockResolvedValue({ error: null })

    const client = {
      from(table: string) {
        return {
          upsert(row: Record<string, unknown>, options?: unknown) {
            upsertCalls({ table, row, options })
            return Promise.resolve({ error: null })
          },
          delete() {
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }

    const claimOwner = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

    await upsertActivationTestFixtures(client as never, targetAsin, claimOwner)
    await upsertActivationTestFixtures(client as never, targetAsin, claimOwner)

    const seeds = buildActivationTestOrderSeeds(targetAsin)
    const expectedOrderUpserts = seeds.length
    const expectedItemUpserts = seeds.reduce(
      (count, seed) => count + seed.items.length,
      0,
    )
    const expectedEntitlementUpserts = seeds.filter((seed) => seed.createEntitlement).length

    const orderUpsertCount = upsertCalls.mock.calls.filter(
      (call) => call[0].table === 'amazon_orders',
    ).length
    const itemUpsertCount = upsertCalls.mock.calls.filter(
      (call) => call[0].table === 'amazon_order_items',
    ).length
    const entitlementUpsertCount = upsertCalls.mock.calls.filter(
      (call) => call[0].table === 'app_entitlements',
    ).length

    expect(orderUpsertCount).toBe(expectedOrderUpserts * 2)
    expect(itemUpsertCount).toBe(expectedItemUpserts * 2)
    expect(entitlementUpsertCount).toBe(expectedEntitlementUpserts * 2)
  })
})

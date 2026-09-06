import { describe, expect, it, vi } from 'vitest'
import {
  ActivationClaimError,
  claimActivationEntitlement,
  fetchEntitlementByOrderId,
  resolveExistingEntitlementOwnership,
  type AppEntitlementRow,
} from '../activationClaimService.ts'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const CURRENT_USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'

function createEntitlementRow(
  overrides: Partial<AppEntitlementRow> = {},
): AppEntitlementRow {
  return {
    id: 'entitlement-1',
    amazon_order_id: FIXTURE_ORDER_ID,
    user_id: CURRENT_USER_ID,
    status: 'active',
    ...overrides,
  }
}

function createMockClient(options: {
  selectResult?: AppEntitlementRow | null
  selectError?: { code?: string; message?: string } | null
  insertError?: { code?: string; message?: string } | null
  rereadAfterInsert?: AppEntitlementRow | null
}) {
  let selectCalls = 0

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            selectCalls += 1

            if (selectCalls > 1 && options.rereadAfterInsert !== undefined) {
              return {
                data: options.rereadAfterInsert,
                error: null,
              }
            }

            if (options.selectError) {
              return { data: null, error: options.selectError }
            }

            return {
              data: options.selectResult ?? null,
              error: null,
            }
          }),
        })),
      })),
      insert: vi.fn(async () => ({
        error: options.insertError ?? null,
      })),
    })),
  }
}

describe('claimActivationEntitlement', () => {
  it('inserts and returns SUCCESS for an unclaimed eligible order', async () => {
    const supabaseClient = createMockClient({ selectResult: null })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).resolves.toBe('SUCCESS')

    expect(supabaseClient.from).toHaveBeenCalledWith('app_entitlements')
  })

  it('returns SUCCESS without insert when already owned by current user with active status', async () => {
    const supabaseClient = createMockClient({
      selectResult: createEntitlementRow(),
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).resolves.toBe('SUCCESS')

    const table = supabaseClient.from.mock.results[0]?.value
    expect(table.insert).not.toHaveBeenCalled()
  })

  it('returns NOT_ELIGIBLE when already owned by current user with revoked status', async () => {
    const supabaseClient = createMockClient({
      selectResult: createEntitlementRow({ status: 'revoked' }),
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).resolves.toBe('NOT_ELIGIBLE')

    const table = supabaseClient.from.mock.results[0]?.value
    expect(table.insert).not.toHaveBeenCalled()
  })

  it('returns ALREADY_CLAIMED when owned by another user with active status', async () => {
    const supabaseClient = createMockClient({
      selectResult: createEntitlementRow({ user_id: OTHER_USER_ID }),
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).resolves.toBe('ALREADY_CLAIMED')
  })

  it('returns ALREADY_CLAIMED when owned by another user with revoked status', async () => {
    const supabaseClient = createMockClient({
      selectResult: createEntitlementRow({ user_id: OTHER_USER_ID, status: 'revoked' }),
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).resolves.toBe('ALREADY_CLAIMED')
  })

  it('returns SUCCESS after unique race when reread shows same user with active status', async () => {
    const supabaseClient = createMockClient({
      selectResult: null,
      insertError: { code: '23505' },
      rereadAfterInsert: createEntitlementRow(),
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).resolves.toBe('SUCCESS')
  })

  it('returns NOT_ELIGIBLE after unique race when reread shows same user with revoked status', async () => {
    const supabaseClient = createMockClient({
      selectResult: null,
      insertError: { code: '23505' },
      rereadAfterInsert: createEntitlementRow({ status: 'revoked' }),
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).resolves.toBe('NOT_ELIGIBLE')
  })

  it('returns ALREADY_CLAIMED after unique race when reread shows other user with revoked status', async () => {
    const supabaseClient = createMockClient({
      selectResult: null,
      insertError: { code: '23505' },
      rereadAfterInsert: createEntitlementRow({
        user_id: OTHER_USER_ID,
        status: 'revoked',
      }),
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).resolves.toBe('ALREADY_CLAIMED')
  })

  it('returns ALREADY_CLAIMED after unique race when reread shows other user with active status', async () => {
    const supabaseClient = createMockClient({
      selectResult: null,
      insertError: { code: '23505' },
      rereadAfterInsert: createEntitlementRow({ user_id: OTHER_USER_ID }),
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).resolves.toBe('ALREADY_CLAIMED')
  })

  it('throws when entitlement lookup fails', async () => {
    const supabaseClient = createMockClient({
      selectError: { code: 'XX000', message: 'select failed' },
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).rejects.toBeInstanceOf(ActivationClaimError)
  })

  it('throws on unexpected insert failures', async () => {
    const supabaseClient = createMockClient({
      selectResult: null,
      insertError: { code: 'XX000', message: 'insert failed' },
    })

    await expect(
      claimActivationEntitlement({
        supabaseClient,
        userId: CURRENT_USER_ID,
        amazonOrderId: FIXTURE_ORDER_ID,
      }),
    ).rejects.toBeInstanceOf(ActivationClaimError)
  })

  it('does not transfer ownership on conflict', async () => {
    const supabaseClient = createMockClient({
      selectResult: createEntitlementRow({ user_id: OTHER_USER_ID }),
    })

    const result = await claimActivationEntitlement({
      supabaseClient,
      userId: CURRENT_USER_ID,
      amazonOrderId: FIXTURE_ORDER_ID,
    })

    expect(result).toBe('ALREADY_CLAIMED')
    const table = supabaseClient.from.mock.results[0]?.value
    expect(table.insert).not.toHaveBeenCalled()
  })

  it('does not create duplicate rows when entitlement already exists', async () => {
    const supabaseClient = createMockClient({
      selectResult: createEntitlementRow(),
    })

    await claimActivationEntitlement({
      supabaseClient,
      userId: CURRENT_USER_ID,
      amazonOrderId: FIXTURE_ORDER_ID,
    })

    const table = supabaseClient.from.mock.results[0]?.value
    expect(table.insert).not.toHaveBeenCalled()
  })
})

describe('resolveExistingEntitlementOwnership', () => {
  it('maps all four ownership/status combinations', () => {
    expect(
      resolveExistingEntitlementOwnership(
        createEntitlementRow({ user_id: CURRENT_USER_ID, status: 'active' }),
        CURRENT_USER_ID,
      ),
    ).toBe('SUCCESS')
    expect(
      resolveExistingEntitlementOwnership(
        createEntitlementRow({ user_id: CURRENT_USER_ID, status: 'revoked' }),
        CURRENT_USER_ID,
      ),
    ).toBe('NOT_ELIGIBLE')
    expect(
      resolveExistingEntitlementOwnership(
        createEntitlementRow({ user_id: OTHER_USER_ID, status: 'active' }),
        CURRENT_USER_ID,
      ),
    ).toBe('ALREADY_CLAIMED')
    expect(
      resolveExistingEntitlementOwnership(
        createEntitlementRow({ user_id: OTHER_USER_ID, status: 'revoked' }),
        CURRENT_USER_ID,
      ),
    ).toBe('ALREADY_CLAIMED')
  })
})

describe('fetchEntitlementByOrderId', () => {
  it('returns parsed entitlement rows', async () => {
    const supabaseClient = createMockClient({
      selectResult: createEntitlementRow(),
    })

    await expect(
      fetchEntitlementByOrderId(supabaseClient, FIXTURE_ORDER_ID),
    ).resolves.toEqual(createEntitlementRow())
  })
})

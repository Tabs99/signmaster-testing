import { describe, expect, it, vi } from 'vitest'
import {
  EntitlementServiceError,
  checkUserEntitlement,
  type EntitlementClient,
  type EntitlementStatusRow,
} from '../entitlementService.ts'

const USER_ID = '11111111-1111-4111-8111-111111111111'

interface QueryOutcome {
  data: EntitlementStatusRow[] | null
  error: { code?: string; message?: string } | null
}

function createClient(outcome: QueryOutcome) {
  const limit = vi.fn().mockResolvedValue(outcome)
  const eqStatus = vi.fn(() => ({ limit }))
  const eqUser = vi.fn(() => ({ eq: eqStatus }))
  const select = vi.fn(() => ({ eq: eqUser }))
  const from = vi.fn(() => ({ select }))

  const client = { from } as unknown as EntitlementClient

  return { client, from, select, eqUser, eqStatus, limit }
}

describe('checkUserEntitlement', () => {
  it('returns ACTIVE when an active entitlement row exists for the user', async () => {
    const { client, from, select, eqUser, eqStatus, limit } = createClient({
      data: [{ status: 'active' }],
      error: null,
    })

    await expect(
      checkUserEntitlement({ supabaseClient: client, userId: USER_ID }),
    ).resolves.toBe('ACTIVE')

    expect(from).toHaveBeenCalledWith('app_entitlements')
    expect(select).toHaveBeenCalledWith('status')
    expect(eqUser).toHaveBeenCalledWith('user_id', USER_ID)
    expect(eqStatus).toHaveBeenCalledWith('status', 'active')
    expect(limit).toHaveBeenCalledWith(1)
  })

  it('returns NONE when the user has no active entitlement rows', async () => {
    const { client } = createClient({ data: [], error: null })

    await expect(
      checkUserEntitlement({ supabaseClient: client, userId: USER_ID }),
    ).resolves.toBe('NONE')
  })

  it('returns NONE when the query returns null data', async () => {
    const { client } = createClient({ data: null, error: null })

    await expect(
      checkUserEntitlement({ supabaseClient: client, userId: USER_ID }),
    ).resolves.toBe('NONE')
  })

  it('does not grant access for a non-active row that slips through (defence in depth)', async () => {
    const { client } = createClient({ data: [{ status: 'revoked' }], error: null })

    await expect(
      checkUserEntitlement({ supabaseClient: client, userId: USER_ID }),
    ).resolves.toBe('NONE')
  })

  it('throws EntitlementServiceError on a query error so the caller can fail closed', async () => {
    const { client } = createClient({
      data: null,
      error: { code: '500', message: 'db exploded: secret-detail' },
    })

    await expect(
      checkUserEntitlement({ supabaseClient: client, userId: USER_ID }),
    ).rejects.toBeInstanceOf(EntitlementServiceError)
  })
})

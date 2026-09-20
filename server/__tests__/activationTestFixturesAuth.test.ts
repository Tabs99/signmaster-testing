import { describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import {
  findAuthUserIdByEmailPaginated,
  FIXTURE_AUTH_USER_LIST_MAX_PAGES,
  FIXTURE_AUTH_USER_LIST_PAGE_SIZE,
  getOrCreateActivationFixtureAuthUserId,
} from '../scripts/activationTestFixturesAuth.ts'

const FIXTURE_EMAIL = 'activation-fixture-hosted@example.invalid'

function mockAuthUser(partial: Pick<User, 'id' | 'email'>): User {
  return partial as User
}

function createMockClient(listUsers: ReturnType<typeof vi.fn>, createUser = vi.fn()) {
  return {
    auth: {
      admin: {
        listUsers,
        createUser,
      },
    },
  }
}

function fillPage(count: number, emailPrefix: string) {
  return Array.from({ length: count }, (_, index) =>
    mockAuthUser({
      id: `user-${emailPrefix}-${index}`,
      email: `${emailPrefix}-${index}@example.invalid`,
    }),
  )
}

describe('activationTestFixturesAuth', () => {
  it('finds the fixture user on page 1', async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [
          mockAuthUser({ id: 'other-id', email: 'other@example.invalid' }),
          mockAuthUser({ id: 'fixture-id', email: FIXTURE_EMAIL }),
        ],
      },
      error: null,
    })

    const id = await findAuthUserIdByEmailPaginated(
      createMockClient(listUsers) as never,
      FIXTURE_EMAIL,
    )

    expect(id).toBe('fixture-id')
    expect(listUsers).toHaveBeenCalledTimes(1)
    expect(listUsers).toHaveBeenCalledWith({
      page: 1,
      perPage: FIXTURE_AUTH_USER_LIST_PAGE_SIZE,
    })
  })

  it('finds the fixture user on a later page', async () => {
    const fullPage = fillPage(FIXTURE_AUTH_USER_LIST_PAGE_SIZE, 'filler')

    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
      .mockResolvedValueOnce({
        data: {
          users: [mockAuthUser({ id: 'fixture-id', email: FIXTURE_EMAIL })],
        },
        error: null,
      })

    const id = await findAuthUserIdByEmailPaginated(
      createMockClient(listUsers) as never,
      FIXTURE_EMAIL,
    )

    expect(id).toBe('fixture-id')
    expect(listUsers).toHaveBeenCalledTimes(2)
    expect(listUsers).toHaveBeenNthCalledWith(2, {
      page: 2,
      perPage: FIXTURE_AUTH_USER_LIST_PAGE_SIZE,
    })
  })

  it('creates the fixture user once when no existing user is found', async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [] },
      error: null,
    })
    const createUser = vi.fn().mockResolvedValue({
      data: { user: mockAuthUser({ id: 'new-fixture-id', email: FIXTURE_EMAIL }) },
      error: null,
    })

    const id = await getOrCreateActivationFixtureAuthUserId(
      createMockClient(listUsers, createUser) as never,
      FIXTURE_EMAIL,
      'activation-test-hosted',
    )

    expect(id).toBe('new-fixture-id')
    expect(createUser).toHaveBeenCalledTimes(1)
    expect(createUser).toHaveBeenCalledWith({
      email: FIXTURE_EMAIL,
      email_confirm: true,
      user_metadata: { signmaster_fixture: 'activation-test-hosted' },
    })
  })

  it('fails safely when listUsers returns an error', async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'admin API unavailable' },
    })

    await expect(
      findAuthUserIdByEmailPaginated(
        createMockClient(listUsers) as never,
        FIXTURE_EMAIL,
      ),
    ).rejects.toThrow(/Failed to list fixture auth users \(page 1\)/)

    expect(listUsers).toHaveBeenCalledTimes(1)
  })

  it('terminates pagination on a short final page without scanning further', async () => {
    const fullPage = fillPage(FIXTURE_AUTH_USER_LIST_PAGE_SIZE, 'filler')

    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
      .mockResolvedValueOnce({
        data: {
          users: [mockAuthUser({ id: 'leftover', email: 'leftover@example.invalid' })],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { users: [mockAuthUser({ id: 'should-not-run', email: 'nope@example.invalid' })],
        },
        error: null,
      })

    const id = await findAuthUserIdByEmailPaginated(
      createMockClient(listUsers) as never,
      FIXTURE_EMAIL,
    )

    expect(id).toBeNull()
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  it('refuses unbounded pagination when every page stays full', async () => {
    const fullPage = fillPage(FIXTURE_AUTH_USER_LIST_PAGE_SIZE, 'filler')
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: fullPage },
      error: null,
    })

    await expect(
      findAuthUserIdByEmailPaginated(
        createMockClient(listUsers) as never,
        FIXTURE_EMAIL,
      ),
    ).rejects.toThrow(
      new RegExp(`exceeded ${FIXTURE_AUTH_USER_LIST_MAX_PAGES} pages`),
    )

    expect(listUsers).toHaveBeenCalledTimes(FIXTURE_AUTH_USER_LIST_MAX_PAGES)
  })
})

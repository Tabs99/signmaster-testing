import { describe, expect, it } from 'vitest'
import {
  extractBearerToken,
  getAuthenticatedUserFromRequest,
  mapAuthenticatedRequestUser,
} from '../requestAuth.ts'

describe('requestAuth', () => {
  it('extracts bearer tokens', () => {
    expect(extractBearerToken('Bearer test-token')).toBe('test-token')
    expect(extractBearerToken(['Bearer array-token'])).toBe('array-token')
    expect(extractBearerToken(undefined)).toBeNull()
  })

  it('maps confirmed email state', () => {
    expect(
      mapAuthenticatedRequestUser({
        id: 'user-1',
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      } as never),
    ).toEqual({
      id: 'user-1',
      emailConfirmed: true,
    })
  })

  it('returns null when token validation fails', async () => {
    await expect(
      getAuthenticatedUserFromRequest(
        { authorization: 'Bearer bad-token' },
        {
          getUserFromAccessToken: async () => ({
            data: { user: null },
            error: new Error('invalid'),
          }),
        },
      ),
    ).resolves.toBeNull()
  })

  it('returns authenticated user from validated token', async () => {
    await expect(
      getAuthenticatedUserFromRequest(
        { authorization: 'Bearer good-token' },
        {
          getUserFromAccessToken: async () => ({
            data: {
              user: {
                id: 'user-1',
                email_confirmed_at: '2026-01-01T00:00:00.000Z',
              },
            },
            error: null,
          }),
        },
      ),
    ).resolves.toEqual({
      id: 'user-1',
      emailConfirmed: true,
    })
  })
})

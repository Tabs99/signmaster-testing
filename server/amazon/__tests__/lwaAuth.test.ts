import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getLwaAccessToken,
  LwaAuthError,
  requestLwaAccessToken,
} from '../lwaAuth.ts'
import {
  getLwaCredentialsFromEnv,
  getMissingLwaEnvVars,
  hasLwaCredentials,
} from '../lwaConfig.ts'

const validEnv = {
  SP_API_CLIENT_ID: 'amzn1.application-oa2-client.test-client-id',
  SP_API_CLIENT_SECRET: 'test-client-secret',
  SP_API_REFRESH_TOKEN: 'Atzr|test-refresh-token',
}

describe('lwaConfig', () => {
  it('reports missing environment variables', () => {
    expect(getMissingLwaEnvVars({})).toEqual([
      'SP_API_CLIENT_ID',
      'SP_API_CLIENT_SECRET',
      'SP_API_REFRESH_TOKEN',
    ])
  })

  it('throws a clear error when required environment variables are missing', () => {
    expect(() => getLwaCredentialsFromEnv({})).toThrow(
      'Missing required Amazon LWA environment variables: SP_API_CLIENT_ID, SP_API_CLIENT_SECRET, SP_API_REFRESH_TOKEN',
    )
  })

  it('returns false when credentials are not configured', () => {
    expect(hasLwaCredentials({})).toBe(false)
  })

  it('returns credentials when all required environment variables are present', () => {
    expect(getLwaCredentialsFromEnv(validEnv)).toEqual({
      clientId: validEnv.SP_API_CLIENT_ID,
      clientSecret: validEnv.SP_API_CLIENT_SECRET,
      refreshToken: validEnv.SP_API_REFRESH_TOKEN,
    })
  })
})

describe('lwaAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps a successful Amazon token response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'Atza|test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const token = await requestLwaAccessToken(
      {
        clientId: validEnv.SP_API_CLIENT_ID,
        clientSecret: validEnv.SP_API_CLIENT_SECRET,
        refreshToken: validEnv.SP_API_REFRESH_TOKEN,
      },
      fetchMock,
    )

    expect(token).toEqual({
      accessToken: 'Atza|test-access-token',
      tokenType: 'bearer',
      expiresIn: 3600,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.amazon.com/auth/o2/token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    )

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(URLSearchParams)
    expect((requestBody as URLSearchParams).get('grant_type')).toBe(
      'refresh_token',
    )
  })

  it('handles Amazon auth failures without exposing secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'The refresh token is invalid.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(
      getLwaAccessToken(validEnv, fetchMock),
    ).rejects.toMatchObject({
      name: 'LwaAuthError',
      message: 'The refresh token is invalid.',
      statusCode: 400,
    })
  })

  it('handles invalid token responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token_type: 'bearer' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      requestLwaAccessToken(
        {
          clientId: validEnv.SP_API_CLIENT_ID,
          clientSecret: validEnv.SP_API_CLIENT_SECRET,
          refreshToken: validEnv.SP_API_REFRESH_TOKEN,
        },
        fetchMock,
      ),
    ).rejects.toThrow(
      'Amazon LWA authentication returned an invalid token response',
    )
  })
})

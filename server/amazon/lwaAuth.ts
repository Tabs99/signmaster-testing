import {
  getLwaCredentialsFromEnv,
  type LwaCredentials,
} from './lwaConfig.ts'

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token'

export interface LwaAccessToken {
  accessToken: string
  tokenType: string
  expiresIn: number
}

export class LwaAuthError extends Error {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'LwaAuthError'
    this.statusCode = statusCode
  }
}

export async function requestLwaAccessToken(
  credentials: LwaCredentials,
  fetchFn: typeof fetch = fetch,
): Promise<LwaAccessToken> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  })

  const response = await fetchFn(LWA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const errorDescription = getAmazonErrorDescription(data)
    throw new LwaAuthError(
      errorDescription ?? `Amazon LWA authentication failed with status ${response.status}`,
      response.status,
    )
  }

  return mapLwaTokenResponse(data)
}

export async function getLwaAccessToken(
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<LwaAccessToken> {
  const credentials = getLwaCredentialsFromEnv(env)
  return requestLwaAccessToken(credentials, fetchFn)
}

function mapLwaTokenResponse(data: unknown): LwaAccessToken {
  if (
    !data ||
    typeof data !== 'object' ||
    !('access_token' in data) ||
    typeof data.access_token !== 'string'
  ) {
    throw new LwaAuthError(
      'Amazon LWA authentication returned an invalid token response',
    )
  }

  return {
    accessToken: data.access_token,
    tokenType:
      'token_type' in data && typeof data.token_type === 'string'
        ? data.token_type
        : 'bearer',
    expiresIn:
      'expires_in' in data && typeof data.expires_in === 'number'
        ? data.expires_in
        : 0,
  }
}

function getAmazonErrorDescription(data: unknown): string | undefined {
  if (
    data &&
    typeof data === 'object' &&
    'error_description' in data &&
    typeof data.error_description === 'string'
  ) {
    return data.error_description
  }

  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    typeof data.error === 'string'
  ) {
    return data.error
  }

  return undefined
}

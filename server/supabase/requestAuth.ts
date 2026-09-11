import type { User } from '@supabase/supabase-js'
import { createServiceRoleClientFromEnv } from './client.ts'

export interface AuthenticatedRequestUser {
  id: string
  email: string
  emailConfirmed: boolean
}

export interface RequestAuthDeps {
  getUserFromAccessToken: (
    accessToken: string,
  ) => Promise<{ data: { user: User | null }; error: Error | null }>
}

function defaultGetUserFromAccessToken(accessToken: string) {
  const client = createServiceRoleClientFromEnv()
  return client.auth.getUser(accessToken)
}

export function extractBearerToken(
  authorizationHeader: string | string[] | undefined,
): string | null {
  if (!authorizationHeader) {
    return null
  }

  const headerValue = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader

  if (!headerValue?.startsWith('Bearer ')) {
    return null
  }

  const token = headerValue.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

export function mapAuthenticatedRequestUser(user: User): AuthenticatedRequestUser {
  return {
    id: user.id,
    email: user.email ?? '',
    emailConfirmed: Boolean(user.email_confirmed_at),
  }
}

export async function getAuthenticatedUserFromRequest(
  headers: Record<string, string | string[] | undefined> | undefined,
  deps: RequestAuthDeps = {
    getUserFromAccessToken: defaultGetUserFromAccessToken,
  },
): Promise<AuthenticatedRequestUser | null> {
  const accessToken = extractBearerToken(headers?.authorization)

  if (!accessToken) {
    return null
  }

  const { data, error } = await deps.getUserFromAccessToken(accessToken)

  if (error || !data.user) {
    return null
  }

  return mapAuthenticatedRequestUser(data.user)
}

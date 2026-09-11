/**
 * Server-authoritative entitlement check.
 *
 * Answers the single question protected routing needs — "does this authenticated
 * user have an ACTIVE SignMaster entitlement?" — using the service-role Supabase
 * client. Authentication and entitlement are deliberately separate (see
 * ARCHITECTURE.md "Authentication versus entitlement"): a valid session does not
 * imply access. Only `status = 'active'` grants access; anything else (revoked,
 * missing) is NONE. Dependency failures throw so the caller can fail closed.
 */

export interface EntitlementStatusRow {
  status: string
}

export interface EntitlementQueryError {
  code?: string
  message?: string
}

export interface EntitlementClient {
  from(table: 'app_entitlements'): EntitlementTableQuery
}

interface EntitlementTableQuery {
  select(columns: string): EntitlementSelectByUser
}

interface EntitlementSelectByUser {
  eq(column: 'user_id', value: string): EntitlementSelectByStatus
}

interface EntitlementSelectByStatus {
  eq(column: 'status', value: string): EntitlementLimitQuery
}

interface EntitlementLimitQuery {
  limit(count: number): PromiseLike<{
    data: EntitlementStatusRow[] | null
    error: EntitlementQueryError | null
  }>
}

export type EntitlementCheckResult = 'ACTIVE' | 'NONE'

export class EntitlementServiceError extends Error {
  readonly supabaseCode?: string

  constructor(message: string, supabaseCode?: string) {
    super(message)
    this.name = 'EntitlementServiceError'
    this.supabaseCode = supabaseCode
  }
}

export interface CheckUserEntitlementOptions {
  supabaseClient: EntitlementClient
  userId: string
}

const ACTIVE_STATUS = 'active'

/**
 * Returns ACTIVE only when the user owns at least one entitlement row whose
 * status is `active`. The query filters on `status = 'active'` in the database
 * (leveraging the entitlement indexes), and the returned rows are re-checked in
 * code as defence in depth so a non-active row can never grant access. Any query
 * error is surfaced as {@link EntitlementServiceError} so the endpoint fails
 * closed rather than guessing access.
 */
export async function checkUserEntitlement(
  options: CheckUserEntitlementOptions,
): Promise<EntitlementCheckResult> {
  const { supabaseClient, userId } = options

  const result = await supabaseClient
    .from('app_entitlements')
    .select('status')
    .eq('user_id', userId)
    .eq('status', ACTIVE_STATUS)
    .limit(1)

  if (result.error) {
    throw new EntitlementServiceError(
      'Failed to look up entitlement for the authenticated user',
      result.error.code,
    )
  }

  const rows = result.data ?? []
  const hasActive = rows.some((row) => row.status === ACTIVE_STATUS)

  return hasActive ? 'ACTIVE' : 'NONE'
}

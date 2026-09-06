export interface AppEntitlementRow {
  id: string
  amazon_order_id: string
  user_id: string
  status: string
}

export interface ActivationClaimQueryError {
  code?: string
  message?: string
}

export interface ActivationClaimClient {
  from(table: 'app_entitlements'): ActivationClaimTableQuery
}

interface ActivationClaimTableQuery {
  select(columns: string): ActivationClaimSelectQuery
  insert(values: Record<string, unknown>): PromiseLike<{
    error: ActivationClaimQueryError | null
  }>
}

interface ActivationClaimSelectQuery {
  eq(
    column: string,
    value: string,
  ): ActivationClaimSingleQuery
}

interface ActivationClaimSingleQuery {
  maybeSingle(): PromiseLike<{
    data: AppEntitlementRow | null
    error: ActivationClaimQueryError | null
  }>
}

export type ActivationClaimServiceResult = 'SUCCESS' | 'ALREADY_CLAIMED' | 'NOT_ELIGIBLE'

export type ActivationClaimOwnershipResult = ActivationClaimServiceResult

export class ActivationClaimError extends Error {
  readonly supabaseCode?: string

  constructor(message: string, supabaseCode?: string) {
    super(message)
    this.name = 'ActivationClaimError'
    this.supabaseCode = supabaseCode
  }
}

export interface ClaimActivationEntitlementOptions {
  supabaseClient: ActivationClaimClient
  userId: string
  amazonOrderId: string
  now?: Date
}

const UNIQUE_VIOLATION_CODE = '23505'

export async function fetchEntitlementByOrderId(
  client: ActivationClaimClient,
  amazonOrderId: string,
): Promise<AppEntitlementRow | null> {
  const result = await client
    .from('app_entitlements')
    .select('id, amazon_order_id, user_id, status')
    .eq('amazon_order_id', amazonOrderId)
    .maybeSingle()

  if (result.error) {
    throw new ActivationClaimError(
      'Failed to look up entitlement for claim',
      result.error.code,
    )
  }

  if (!result.data) {
    return null
  }

  return parseEntitlementRow(result.data)
}

function parseEntitlementRow(value: AppEntitlementRow): AppEntitlementRow {
  if (
    typeof value.id !== 'string' ||
    typeof value.amazon_order_id !== 'string' ||
    typeof value.user_id !== 'string' ||
    typeof value.status !== 'string'
  ) {
    throw new ActivationClaimError(
      'Activation claim received an unexpected entitlement record shape',
    )
  }

  return value
}

export function resolveExistingEntitlementOwnership(
  entitlement: AppEntitlementRow,
  userId: string,
): ActivationClaimOwnershipResult {
  if (entitlement.user_id !== userId) {
    return 'ALREADY_CLAIMED'
  }

  if (entitlement.status === 'active') {
    return 'SUCCESS'
  }

  if (entitlement.status === 'revoked') {
    return 'NOT_ELIGIBLE'
  }

  return 'NOT_ELIGIBLE'
}

export async function claimActivationEntitlement(
  options: ClaimActivationEntitlementOptions,
): Promise<ActivationClaimServiceResult> {
  const { supabaseClient, userId, amazonOrderId } = options
  const now = options.now ?? new Date()

  const existing = await fetchEntitlementByOrderId(supabaseClient, amazonOrderId)

  if (existing) {
    return resolveExistingEntitlementOwnership(existing, userId)
  }

  const insertResult = await supabaseClient.from('app_entitlements').insert({
    amazon_order_id: amazonOrderId,
    user_id: userId,
    status: 'active',
    claimed_at: now.toISOString(),
  })

  if (!insertResult.error) {
    return 'SUCCESS'
  }

  if (insertResult.error.code === UNIQUE_VIOLATION_CODE) {
    const reread = await fetchEntitlementByOrderId(supabaseClient, amazonOrderId)

    if (!reread) {
      throw new ActivationClaimError(
        'Entitlement unique conflict could not be resolved',
        insertResult.error.code,
      )
    }

    return resolveExistingEntitlementOwnership(reread, userId)
  }

  throw new ActivationClaimError(
    'Failed to create entitlement',
    insertResult.error.code,
  )
}

import type { AmazonOrderItemRow, AmazonOrderRow } from './amazonOrderPersistence.ts'

export type ActivationVerificationStatus =
  | 'ELIGIBLE'
  | 'NOT_FOUND'
  | 'NOT_SHIPPED'
  | 'ALREADY_CLAIMED'
  | 'CANCELLED'
  | 'RETURNED'

export interface ActivationVerificationResult {
  status: ActivationVerificationStatus
}

export interface ActivationVerificationQueryError {
  code?: string
  message?: string
}

export interface ActivationVerificationClient {
  from(
    table: 'amazon_orders' | 'amazon_order_items' | 'app_entitlements',
  ): ActivationVerificationTableQuery
}

interface ActivationVerificationTableQuery {
  select(columns: string): ActivationVerificationSelectQuery
}

interface ActivationVerificationSelectQuery {
  eq(
    column: string,
    value: string,
  ): ActivationVerificationFilterQuery
}

interface ActivationVerificationFilterQuery {
  maybeSingle(): PromiseLike<{
    data: unknown
    error: ActivationVerificationQueryError | null
  }>
  eq(
    column: string,
    value: string,
  ): PromiseLike<{
    data: unknown
    error: ActivationVerificationQueryError | null
  }>
}

export class ActivationVerificationError extends Error {
  readonly supabaseCode?: string

  constructor(message: string, supabaseCode?: string) {
    super(message)
    this.name = 'ActivationVerificationError'
    this.supabaseCode = supabaseCode
  }
}

export interface VerifyActivationEligibilityOptions {
  supabaseClient: ActivationVerificationClient
  targetAsin: string
}

export function isCancelledFulfillmentStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase()

  return normalized === 'CANCELLED' || normalized === 'CANCELED'
}

export function calculateTargetItemTotals(items: AmazonOrderItemRow[]): {
  totalFulfilled: number
  totalRetained: number
} {
  let totalFulfilled = 0
  let totalRetained = 0

  for (const item of items) {
    totalFulfilled += item.quantity_fulfilled
    totalRetained += Math.max(item.quantity_fulfilled - item.quantity_returned, 0)
  }

  return { totalFulfilled, totalRetained }
}

export async function verifyActivationEligibility(
  orderId: string,
  options: VerifyActivationEligibilityOptions,
): Promise<ActivationVerificationResult> {
  const order = await fetchAmazonOrder(options.supabaseClient, orderId)

  if (!order) {
    return { status: 'NOT_FOUND' }
  }

  const targetItems = await fetchTargetOrderItems(
    options.supabaseClient,
    orderId,
    options.targetAsin,
  )

  if (targetItems.length === 0) {
    return { status: 'NOT_FOUND' }
  }

  const entitlementExists = await fetchEntitlementExists(
    options.supabaseClient,
    orderId,
  )

  if (entitlementExists) {
    return { status: 'ALREADY_CLAIMED' }
  }

  if (isCancelledFulfillmentStatus(order.fulfillment_status)) {
    return { status: 'CANCELLED' }
  }

  const { totalFulfilled, totalRetained } = calculateTargetItemTotals(targetItems)

  if (totalFulfilled <= 0) {
    return { status: 'NOT_SHIPPED' }
  }

  if (totalRetained <= 0) {
    return { status: 'RETURNED' }
  }

  return { status: 'ELIGIBLE' }
}

async function fetchAmazonOrder(
  client: ActivationVerificationClient,
  orderId: string,
): Promise<AmazonOrderRow | null> {
  const result = await client
    .from('amazon_orders')
    .select('amazon_order_id, fulfillment_status')
    .eq('amazon_order_id', orderId)
    .maybeSingle()

  if (result.error) {
    throw new ActivationVerificationError(
      formatOrderLookupFailure(result.error),
      result.error.code,
    )
  }

  if (!result.data || typeof result.data !== 'object') {
    return null
  }

  const row = result.data as Partial<AmazonOrderRow>

  if (
    typeof row.amazon_order_id !== 'string' ||
    typeof row.fulfillment_status !== 'string'
  ) {
    throw new ActivationVerificationError(
      'Activation verification received an unexpected order record shape',
    )
  }

  return {
    amazon_order_id: row.amazon_order_id,
    purchase_date: null,
    fulfillment_status: row.fulfillment_status,
    last_amazon_update: '',
  }
}

async function fetchTargetOrderItems(
  client: ActivationVerificationClient,
  orderId: string,
  targetAsin: string,
): Promise<AmazonOrderItemRow[]> {
  const result = await client
    .from('amazon_order_items')
    .select(
      'order_item_id, amazon_order_id, asin, quantity_fulfilled, quantity_returned',
    )
    .eq('amazon_order_id', orderId)
    .eq('asin', targetAsin)

  if (result.error) {
    throw new ActivationVerificationError(
      formatItemLookupFailure(result.error),
      result.error.code,
    )
  }

  if (!Array.isArray(result.data)) {
    throw new ActivationVerificationError(
      'Activation verification received an unexpected order item record shape',
    )
  }

  return result.data.map(parseOrderItemRow)
}

async function fetchEntitlementExists(
  client: ActivationVerificationClient,
  orderId: string,
): Promise<boolean> {
  const result = await client
    .from('app_entitlements')
    .select('id')
    .eq('amazon_order_id', orderId)
    .maybeSingle()

  if (result.error) {
    throw new ActivationVerificationError(
      formatEntitlementLookupFailure(result.error),
      result.error.code,
    )
  }

  return result.data !== null && typeof result.data === 'object'
}

function parseOrderItemRow(value: unknown): AmazonOrderItemRow {
  if (!value || typeof value !== 'object') {
    throw new ActivationVerificationError(
      'Activation verification received an unexpected order item record shape',
    )
  }

  const row = value as Partial<AmazonOrderItemRow>

  if (
    typeof row.order_item_id !== 'string' ||
    typeof row.amazon_order_id !== 'string' ||
    typeof row.asin !== 'string' ||
    typeof row.quantity_fulfilled !== 'number' ||
    typeof row.quantity_returned !== 'number'
  ) {
    throw new ActivationVerificationError(
      'Activation verification received an unexpected order item record shape',
    )
  }

  return {
    order_item_id: row.order_item_id,
    amazon_order_id: row.amazon_order_id,
    asin: row.asin,
    sku: null,
    quantity_ordered: 0,
    quantity_fulfilled: row.quantity_fulfilled,
    quantity_returned: row.quantity_returned,
  }
}

function formatOrderLookupFailure(error: ActivationVerificationQueryError): string {
  const codeSuffix = error.code ? ` [${error.code}]` : ''
  const message = error.message?.trim() || 'Unknown Supabase error'

  return `Failed to look up order for activation verification${codeSuffix}: ${message}`
}

function formatItemLookupFailure(error: ActivationVerificationQueryError): string {
  const codeSuffix = error.code ? ` [${error.code}]` : ''
  const message = error.message?.trim() || 'Unknown Supabase error'

  return `Failed to look up order items for activation verification${codeSuffix}: ${message}`
}

function formatEntitlementLookupFailure(
  error: ActivationVerificationQueryError,
): string {
  const codeSuffix = error.code ? ` [${error.code}]` : ''
  const message = error.message?.trim() || 'Unknown Supabase error'

  return `Failed to look up entitlement for activation verification${codeSuffix}: ${message}`
}

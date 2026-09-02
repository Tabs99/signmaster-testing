export const ORDERS_CHECKPOINT_KEY = 'orders_checkpoint'

export interface OrdersCheckpointValue {
  lastSuccessfulSyncAt: string
}

export class SyncStateError extends Error {
  readonly supabaseCode?: string

  constructor(message: string, supabaseCode?: string) {
    super(message)
    this.name = 'SyncStateError'
    this.supabaseCode = supabaseCode
  }
}

export interface SyncStateQueryError {
  code?: string
  message?: string
}

export interface SyncStateReadClient {
  from(table: 'sync_state'): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: { key: string; value: unknown } | null
          error: SyncStateQueryError | null
        }>
      }
    }
  }
}

export interface SyncStateWriteClient extends SyncStateReadClient {
  from(table: 'sync_state'): SyncStateReadClient['from'] & {
    upsert(
      values: unknown,
      options?: { onConflict?: string },
    ): PromiseLike<{ error: SyncStateQueryError | null }>
  }
}

const INVALID_CHECKPOINT_MESSAGE = 'Invalid Amazon orders sync checkpoint'

// Matches Date.toISOString() output: YYYY-MM-DDTHH:mm:ss.sssZ
const ISO_UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function isValidIsoUtcTimestamp(value: string): boolean {
  if (!ISO_UTC_TIMESTAMP_PATTERN.test(value)) {
    return false
  }

  const parsed = Date.parse(value)

  if (Number.isNaN(parsed)) {
    return false
  }

  return new Date(parsed).toISOString() === value
}

export function parseOrdersCheckpointValue(
  value: unknown,
): OrdersCheckpointValue {
  if (
    !value ||
    typeof value !== 'object' ||
    !('lastSuccessfulSyncAt' in value) ||
    typeof value.lastSuccessfulSyncAt !== 'string' ||
    !value.lastSuccessfulSyncAt.trim()
  ) {
    throw new SyncStateError(INVALID_CHECKPOINT_MESSAGE)
  }

  const lastSuccessfulSyncAt = value.lastSuccessfulSyncAt.trim()

  if (!isValidIsoUtcTimestamp(lastSuccessfulSyncAt)) {
    throw new SyncStateError(INVALID_CHECKPOINT_MESSAGE)
  }

  return { lastSuccessfulSyncAt }
}

export async function getOrdersCheckpoint(
  client: SyncStateReadClient,
): Promise<OrdersCheckpointValue | null> {
  const result = await client
    .from('sync_state')
    .select('key, value')
    .eq('key', ORDERS_CHECKPOINT_KEY)
    .maybeSingle()

  if (result.error) {
    throw new SyncStateError(
      formatSyncStateReadFailure(result.error),
      result.error.code,
    )
  }

  if (!result.data) {
    return null
  }

  return parseOrdersCheckpointValue(result.data.value)
}

export async function saveOrdersCheckpoint(
  client: SyncStateWriteClient,
  lastSuccessfulSyncAt: string,
): Promise<void> {
  const result = await client.from('sync_state').upsert(
    {
      key: ORDERS_CHECKPOINT_KEY,
      value: { lastSuccessfulSyncAt },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )

  if (result.error) {
    throw new SyncStateError(
      formatSyncStateWriteFailure(result.error),
      result.error.code,
    )
  }
}

function formatSyncStateReadFailure(error: SyncStateQueryError): string {
  const codeSuffix = error.code ? ` [${error.code}]` : ''
  const message = error.message?.trim() || 'Unknown Supabase error'

  return `Failed to read Amazon orders sync checkpoint${codeSuffix}: ${message}`
}

function formatSyncStateWriteFailure(error: SyncStateQueryError): string {
  const codeSuffix = error.code ? ` [${error.code}]` : ''
  const message = error.message?.trim() || 'Unknown Supabase error'

  return `Failed to save Amazon orders sync checkpoint${codeSuffix}: ${message}`
}

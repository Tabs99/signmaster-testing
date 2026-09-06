import {
  generateActivationContextToken,
  hashActivationContextToken,
  isValidActivationContextTokenFormat,
} from '../activation/contextToken.ts'
import { ACTIVATION_CONTEXT_LIFETIME_SECONDS } from '../activation/contextCookie.ts'

export const ACTIVATION_CONTEXT_LIFETIME_MS =
  ACTIVATION_CONTEXT_LIFETIME_SECONDS * 1000

export type ActivationContextResolutionStatus = 'VALID' | 'EXPIRED' | 'NONE'

export interface ActivationContextRow {
  id: string
  token_hash: string
  amazon_order_id: string
  created_at: string
  updated_at: string
  expires_at: string
  invalidated_at: string | null
}

export interface ActivationContextQueryError {
  code?: string
  message?: string
}

export interface ActivationContextClient {
  from(table: 'activation_contexts'): ActivationContextTableQuery
}

interface ActivationContextTableQuery {
  insert(values: Record<string, unknown>): ActivationContextInsertQuery
  select(columns: string): ActivationContextSelectQuery
  update(values: Record<string, unknown>): ActivationContextUpdateQuery
}

interface ActivationContextInsertQuery {
  select(columns: string): ActivationContextSingleQuery
}

interface ActivationContextSelectQuery {
  eq(column: string, value: string): ActivationContextSingleQuery
}

interface ActivationContextUpdateQuery {
  eq(
    column: string,
    value: string,
  ): PromiseLike<{
    error: ActivationContextQueryError | null
  }>
}

interface ActivationContextSingleQuery {
  maybeSingle(): PromiseLike<{
    data: ActivationContextRow | null
    error: ActivationContextQueryError | null
  }>
}

export class ActivationContextError extends Error {
  readonly supabaseCode?: string

  constructor(message: string, supabaseCode?: string) {
    super(message)
    this.name = 'ActivationContextError'
    this.supabaseCode = supabaseCode
  }
}

export interface CreateActivationContextResult {
  token: string
  expiresAt: Date
}

export interface CreateActivationContextOptions {
  supabaseClient: ActivationContextClient
  now?: Date
  generateToken?: () => string
}

export interface ResolveActivationContextOptions {
  supabaseClient: ActivationContextClient
  token: string
  now?: Date
  touchOnValid?: boolean
}

export type ActivationContextWithOrderResult =
  | { status: 'VALID'; amazonOrderId: string }
  | { status: 'EXPIRED' }
  | { status: 'NONE' }

export interface ResolveActivationContextWithOrderOptions
  extends ResolveActivationContextOptions {}

function toIsoTimestamp(date: Date): string {
  return date.toISOString()
}

function addLifetime(date: Date): Date {
  return new Date(date.getTime() + ACTIVATION_CONTEXT_LIFETIME_MS)
}

function isActiveContext(row: ActivationContextRow, now: Date): boolean {
  if (row.invalidated_at) {
    return false
  }

  return Date.parse(row.expires_at) > now.getTime()
}

export async function createActivationContext(
  amazonOrderId: string,
  options: CreateActivationContextOptions,
): Promise<CreateActivationContextResult> {
  const now = options.now ?? new Date()
  const token = options.generateToken?.() ?? generateActivationContextToken()
  const tokenHash = hashActivationContextToken(token)
  const expiresAt = addLifetime(now)

  const { data, error } = await options.supabaseClient
    .from('activation_contexts')
    .insert({
      token_hash: tokenHash,
      amazon_order_id: amazonOrderId,
      created_at: toIsoTimestamp(now),
      updated_at: toIsoTimestamp(now),
      expires_at: toIsoTimestamp(expiresAt),
      invalidated_at: null,
    })
    .select('id, expires_at')
    .maybeSingle()

  if (error) {
    throw new ActivationContextError(
      'Failed to create activation context',
      error.code,
    )
  }

  if (!data) {
    throw new ActivationContextError('Failed to create activation context')
  }

  return {
    token,
    expiresAt,
  }
}

async function loadActivationContextRow(
  options: ResolveActivationContextOptions,
): Promise<
  | { kind: 'row'; row: ActivationContextRow }
  | { kind: 'none' }
  | { kind: 'expired' }
> {
  const { token } = options

  if (!isValidActivationContextTokenFormat(token)) {
    return { kind: 'none' }
  }

  const tokenHash = hashActivationContextToken(token)
  const now = options.now ?? new Date()

  const { data, error } = await options.supabaseClient
    .from('activation_contexts')
    .select(
      'id, token_hash, amazon_order_id, created_at, updated_at, expires_at, invalidated_at',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) {
    throw new ActivationContextError(
      'Failed to resolve activation context',
      error.code,
    )
  }

  if (!data) {
    return { kind: 'none' }
  }

  if (!isActiveContext(data, now)) {
    return { kind: 'expired' }
  }

  if (options.touchOnValid !== false) {
    const nextExpiry = addLifetime(now)
    const { error: touchError } = await options.supabaseClient
      .from('activation_contexts')
      .update({
        updated_at: toIsoTimestamp(now),
        expires_at: toIsoTimestamp(nextExpiry),
      })
      .eq('token_hash', tokenHash)

    if (touchError) {
      throw new ActivationContextError(
        'Failed to refresh activation context expiry',
        touchError.code,
      )
    }
  }

  return { kind: 'row', row: data }
}

export async function resolveActivationContextWithOrderId(
  options: ResolveActivationContextWithOrderOptions,
): Promise<ActivationContextWithOrderResult> {
  const loaded = await loadActivationContextRow(options)

  if (loaded.kind === 'none') {
    return { status: 'NONE' }
  }

  if (loaded.kind === 'expired') {
    return { status: 'EXPIRED' }
  }

  return {
    status: 'VALID',
    amazonOrderId: loaded.row.amazon_order_id,
  }
}

export async function resolveActivationContext(
  options: ResolveActivationContextOptions,
): Promise<ActivationContextResolutionStatus> {
  const loaded = await loadActivationContextRow(options)

  if (loaded.kind === 'none') {
    return 'NONE'
  }

  if (loaded.kind === 'expired') {
    return 'EXPIRED'
  }

  return 'VALID'
}

export async function invalidateActivationContext(
  token: string,
  options: {
    supabaseClient: ActivationContextClient
    now?: Date
  },
): Promise<void> {
  if (!isValidActivationContextTokenFormat(token)) {
    return
  }

  const tokenHash = hashActivationContextToken(token)
  const now = options.now ?? new Date()

  const { error } = await options.supabaseClient
    .from('activation_contexts')
    .update({
      invalidated_at: toIsoTimestamp(now),
      updated_at: toIsoTimestamp(now),
    })
    .eq('token_hash', tokenHash)

  if (error) {
    throw new ActivationContextError(
      'Failed to invalidate activation context',
      error.code,
    )
  }
}

import {
  ACTIVATION_CONTINUATION_LIFETIME_SECONDS,
  generateActivationContinuationReference,
  hashActivationContinuationReference,
  isValidActivationContinuationReferenceFormat,
} from '../activation/continuationReference.ts'
import {
  createActivationContext,
  resolveActivationContextWithOrderId,
  type ActivationContextClient,
} from './activationContextService.ts'

const ACTIVATION_CONTINUATION_LIFETIME_MS =
  ACTIVATION_CONTINUATION_LIFETIME_SECONDS * 1000

export interface ActivationContinuationRow {
  id: string
  token_hash: string
  amazon_order_id: string
  email: string
  created_at: string
  expires_at: string
  consumed_at: string | null
}

export interface ActivationContinuationQueryError {
  code?: string
  message?: string
}

export interface ActivationContinuationClient {
  from(table: 'activation_continuations'): ActivationContinuationTableQuery
}

interface ActivationContinuationTableQuery {
  insert(values: Record<string, unknown>): PromiseLike<{
    error: ActivationContinuationQueryError | null
  }>
  select(columns: string): ActivationContinuationSelectQuery
  update(values: Record<string, unknown>): ActivationContinuationUpdateQuery
}

interface ActivationContinuationSelectQuery {
  eq(column: string, value: string): ActivationContinuationSingleQuery
}

interface ActivationContinuationSingleQuery {
  maybeSingle(): PromiseLike<{
    data: ActivationContinuationRow | null
    error: ActivationContinuationQueryError | null
  }>
}

interface ActivationContinuationUpdateQuery {
  eq(column: string, value: string): ActivationContinuationUpdateFilter
}

interface ActivationContinuationUpdateFilter {
  is(column: string, value: null): ActivationContinuationUpdateSelect
}

interface ActivationContinuationUpdateSelect {
  select(columns: string): PromiseLike<{
    data: ActivationContinuationRow[] | null
    error: ActivationContinuationQueryError | null
  }>
}

/** A client capable of both continuation and (fresh) context operations. */
export type ActivationContinuationConsumeClient = ActivationContinuationClient &
  ActivationContextClient

export class ActivationContinuationError extends Error {
  readonly supabaseCode?: string

  constructor(message: string, supabaseCode?: string) {
    super(message)
    this.name = 'ActivationContinuationError'
    this.supabaseCode = supabaseCode
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toIso(date: Date): string {
  return date.toISOString()
}

// --- Create ---------------------------------------------------------------

export type CreateActivationContinuationResult =
  | { status: 'CREATED'; reference: string }
  | { status: 'NO_CONTEXT' }

export interface CreateActivationContinuationDeps {
  resolveContextWithOrderId: typeof resolveActivationContextWithOrderId
  generateReference: () => string
}

export const defaultCreateActivationContinuationDeps: CreateActivationContinuationDeps =
  {
    resolveContextWithOrderId: resolveActivationContextWithOrderId,
    generateReference: generateActivationContinuationReference,
  }

export interface CreateActivationContinuationInput {
  supabaseClient: ActivationContinuationConsumeClient
  contextToken: string
  email: string
  now?: Date
  deps?: CreateActivationContinuationDeps
}

/**
 * Mints a continuation reference bound to the activation context currently
 * resolved from the caller's HttpOnly cookie and to the sign-up email. The
 * order id is derived server-side; the browser only ever receives the opaque
 * reference. Returns NO_CONTEXT when there is no valid context to continue.
 */
export async function createActivationContinuation(
  input: CreateActivationContinuationInput,
): Promise<CreateActivationContinuationResult> {
  const { supabaseClient, contextToken, email, now } = input
  const deps = input.deps ?? defaultCreateActivationContinuationDeps

  const resolution = await deps.resolveContextWithOrderId({
    supabaseClient,
    token: contextToken,
    now,
    touchOnValid: false,
  })

  if (resolution.status !== 'VALID') {
    return { status: 'NO_CONTEXT' }
  }

  const createdAt = now ?? new Date()
  const expiresAt = new Date(
    createdAt.getTime() + ACTIVATION_CONTINUATION_LIFETIME_MS,
  )
  const reference = deps.generateReference()
  const tokenHash = hashActivationContinuationReference(reference)

  const { error } = await supabaseClient
    .from('activation_continuations')
    .insert({
      token_hash: tokenHash,
      amazon_order_id: resolution.amazonOrderId,
      email: normalizeEmail(email),
      created_at: toIso(createdAt),
      expires_at: toIso(expiresAt),
      consumed_at: null,
    })

  if (error) {
    throw new ActivationContinuationError(
      'Failed to create activation continuation reference',
      error.code,
    )
  }

  return { status: 'CREATED', reference }
}

// --- Consume --------------------------------------------------------------

export type ConsumeActivationContinuationResult =
  | { status: 'CONTINUED'; contextToken: string }
  | { status: 'INVALID' }
  | { status: 'EXPIRED' }
  | { status: 'ALREADY_CONSUMED' }

export interface ConsumeActivationContinuationDeps {
  createContext: typeof createActivationContext
}

export const defaultConsumeActivationContinuationDeps: ConsumeActivationContinuationDeps =
  {
    createContext: createActivationContext,
  }

export interface ConsumeActivationContinuationInput {
  supabaseClient: ActivationContinuationConsumeClient
  reference: string
  email: string
  now?: Date
  deps?: ConsumeActivationContinuationDeps
}

/**
 * Consumes a continuation reference for an authenticated, confirmed user whose
 * email matches the mint-time binding. On success it mints a *fresh* activation
 * context for the same verified order and returns its token so the caller can
 * re-establish the HttpOnly cookie on the confirming device.
 *
 * Single-use is enforced with a conditional `consumed_at IS NULL` update so two
 * concurrent consumes cannot both succeed. Unknown / expired / already-consumed
 * / mismatched-email references all resolve to safe recovery states without
 * revealing which condition failed (no account or order enumeration).
 */
export async function consumeActivationContinuation(
  input: ConsumeActivationContinuationInput,
): Promise<ConsumeActivationContinuationResult> {
  const { supabaseClient, reference, email, now } = input
  const deps = input.deps ?? defaultConsumeActivationContinuationDeps

  if (!isValidActivationContinuationReferenceFormat(reference)) {
    return { status: 'INVALID' }
  }

  const tokenHash = hashActivationContinuationReference(reference)
  const currentTime = now ?? new Date()

  const { data: row, error: selectError } = await supabaseClient
    .from('activation_continuations')
    .select('id, token_hash, amazon_order_id, email, created_at, expires_at, consumed_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (selectError) {
    throw new ActivationContinuationError(
      'Failed to resolve activation continuation reference',
      selectError.code,
    )
  }

  if (!row) {
    return { status: 'INVALID' }
  }

  // Bind to the confirmed account. Treated as INVALID (not a distinct status)
  // so a mismatched user cannot probe for valid references.
  if (row.email !== normalizeEmail(email)) {
    return { status: 'INVALID' }
  }

  if (row.consumed_at) {
    return { status: 'ALREADY_CONSUMED' }
  }

  if (Date.parse(row.expires_at) <= currentTime.getTime()) {
    return { status: 'EXPIRED' }
  }

  const { data: consumedRows, error: consumeError } = await supabaseClient
    .from('activation_continuations')
    .update({ consumed_at: toIso(currentTime) })
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .select('id')

  if (consumeError) {
    throw new ActivationContinuationError(
      'Failed to consume activation continuation reference',
      consumeError.code,
    )
  }

  if (!consumedRows || consumedRows.length === 0) {
    // Lost the single-use race: another request consumed it first.
    return { status: 'ALREADY_CONSUMED' }
  }

  const created = await deps.createContext(row.amazon_order_id, {
    supabaseClient,
    now: currentTime,
  })

  return { status: 'CONTINUED', contextToken: created.token }
}

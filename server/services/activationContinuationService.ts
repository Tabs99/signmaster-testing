import {
  ACTIVATION_CONTINUATION_LIFETIME_SECONDS,
  generateActivationContinuationReference,
  hashActivationContinuationReference,
  isValidActivationContinuationReferenceFormat,
} from '../activation/continuationReference.ts'
import {
  generateActivationContextToken,
  hashActivationContextToken,
} from '../activation/contextToken.ts'
import {
  ACTIVATION_CONTEXT_LIFETIME_MS,
  resolveActivationContextWithOrderId,
  type ActivationContextClient,
} from './activationContextService.ts'

const ACTIVATION_CONTINUATION_LIFETIME_MS =
  ACTIVATION_CONTINUATION_LIFETIME_SECONDS * 1000

/** Name of the atomic consume-and-create-context Postgres function. */
export const CONSUME_ACTIVATION_CONTINUATION_FN = 'consume_activation_continuation'

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

/** Client surface used to *mint* a continuation reference. */
export interface ActivationContinuationClient {
  from(table: 'activation_continuations'): ActivationContinuationTableQuery
}

interface ActivationContinuationTableQuery {
  insert(values: Record<string, unknown>): PromiseLike<{
    error: ActivationContinuationQueryError | null
  }>
}

/** A client capable of resolving a context (for minting) and inserting a continuation row. */
export type ActivationContinuationCreateClient = ActivationContinuationClient &
  ActivationContextClient

export interface ConsumeActivationContinuationRpcArgs {
  p_token_hash: string
  p_email: string
  p_now: string
  p_context_token_hash: string
  p_context_expires_at: string
}

/**
 * Client surface used to *consume* a continuation reference. Consumption runs
 * as a single server-side transaction via the `consume_activation_continuation`
 * Postgres function so marking the reference consumed and creating the fresh
 * activation context happen atomically (both or neither).
 */
export interface ActivationContinuationConsumeClient {
  rpc(
    fn: typeof CONSUME_ACTIVATION_CONTINUATION_FN,
    args: ConsumeActivationContinuationRpcArgs,
  ): PromiseLike<{
    data: unknown
    error: ActivationContinuationQueryError | null
  }>
}

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
  supabaseClient: ActivationContinuationCreateClient
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
  generateContextToken: () => string
  hashContextToken: (token: string) => string
  contextLifetimeMs: number
}

export const defaultConsumeActivationContinuationDeps: ConsumeActivationContinuationDeps =
  {
    generateContextToken: generateActivationContextToken,
    hashContextToken: hashActivationContextToken,
    contextLifetimeMs: ACTIVATION_CONTEXT_LIFETIME_MS,
  }

export interface ConsumeActivationContinuationInput {
  supabaseClient: ActivationContinuationConsumeClient
  reference: string
  email: string
  now?: Date
  deps?: Partial<ConsumeActivationContinuationDeps>
}

/**
 * Consumes a continuation reference for an authenticated, confirmed user whose
 * email matches the mint-time binding, and creates a *fresh* activation context
 * for the same verified order — atomically.
 *
 * Marking the reference consumed and inserting the new context happen inside a
 * single Postgres transaction (`consume_activation_continuation`). Either both
 * succeed (CONTINUED) or neither does: if context creation fails the whole
 * transaction rolls back, the reference stays unconsumed, and the exchange is
 * retryable. Concurrent consumes serialise on a `SELECT ... FOR UPDATE` row
 * lock in the function, so exactly one succeeds and exactly one context is
 * created; the loser resolves to ALREADY_CONSUMED. Unknown / expired /
 * already-consumed / mismatched-email references all resolve to safe recovery
 * states without revealing which condition failed (no account/order
 * enumeration). The raw context token is generated here so the browser can
 * receive only the resulting HttpOnly cookie value; the database stores only
 * its hash.
 */
export async function consumeActivationContinuation(
  input: ConsumeActivationContinuationInput,
): Promise<ConsumeActivationContinuationResult> {
  const { supabaseClient, reference, email, now } = input
  const deps = { ...defaultConsumeActivationContinuationDeps, ...input.deps }

  if (!isValidActivationContinuationReferenceFormat(reference)) {
    return { status: 'INVALID' }
  }

  const tokenHash = hashActivationContinuationReference(reference)
  const currentTime = now ?? new Date()

  // Generated up front but only persisted by the transaction on CONTINUED; a
  // non-continued outcome discards it, so no orphan/duplicate context is left.
  const contextToken = deps.generateContextToken()
  const contextTokenHash = deps.hashContextToken(contextToken)
  const contextExpiresAt = new Date(currentTime.getTime() + deps.contextLifetimeMs)

  const { data, error } = await supabaseClient.rpc(
    CONSUME_ACTIVATION_CONTINUATION_FN,
    {
      p_token_hash: tokenHash,
      p_email: normalizeEmail(email),
      p_now: toIso(currentTime),
      p_context_token_hash: contextTokenHash,
      p_context_expires_at: toIso(contextExpiresAt),
    },
  )

  if (error) {
    // Transaction failed (e.g. context insert error): the DB rolled back, so
    // the reference is still unconsumed and the exchange can be retried.
    throw new ActivationContinuationError(
      'Failed to consume activation continuation reference',
      error.code,
    )
  }

  const outcome = normalizeConsumeOutcome(data)

  switch (outcome) {
    case 'CONTINUED':
      return { status: 'CONTINUED', contextToken }
    case 'ALREADY_CONSUMED':
      return { status: 'ALREADY_CONSUMED' }
    case 'EXPIRED':
      return { status: 'EXPIRED' }
    case 'INVALID':
      return { status: 'INVALID' }
    default:
      throw new ActivationContinuationError(
        'Unexpected activation continuation consume outcome',
      )
  }
}

function normalizeConsumeOutcome(data: unknown): string | null {
  if (typeof data === 'string') {
    return data
  }

  // Defensive: some drivers wrap a scalar function result in an array/row.
  if (Array.isArray(data) && typeof data[0] === 'string') {
    return data[0]
  }

  return null
}

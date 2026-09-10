-- Atomic cross-device continuation exchange.
--
-- Consumes a continuation reference AND creates a fresh activation context for
-- the same order within a single transaction, so the two effects are all-or-
-- nothing. If context creation fails the whole function rolls back and the
-- continuation stays unconsumed (the exchange remains retryable).
--
-- Concurrency: the row is locked with SELECT ... FOR UPDATE, so two concurrent
-- consumes serialise. Exactly one observes consumed_at IS NULL and succeeds
-- (creating exactly one context); the other observes the row already consumed
-- and returns 'ALREADY_CONSUMED' without creating a context.
--
-- The raw activation-context token is generated in the application layer so it
-- can be set as the HttpOnly cookie; only its SHA-256 hash is passed here and
-- stored. This function returns a status enum only — never the order id, the
-- continuation hash, the context hash, or any database id.

create or replace function public.consume_activation_continuation(
  p_token_hash text,
  p_email text,
  p_now timestamptz,
  p_context_token_hash text,
  p_context_expires_at timestamptz
)
returns text
language plpgsql
as $$
declare
  v_row public.activation_continuations%rowtype;
begin
  select *
    into v_row
    from public.activation_continuations
   where token_hash = p_token_hash
   for update;

  if not found then
    return 'INVALID';
  end if;

  -- Bind to the confirmed account. Mismatches are reported as INVALID (not a
  -- distinct status) so a different user cannot probe for valid references.
  if v_row.email <> p_email then
    return 'INVALID';
  end if;

  if v_row.consumed_at is not null then
    return 'ALREADY_CONSUMED';
  end if;

  if v_row.expires_at <= p_now then
    return 'EXPIRED';
  end if;

  update public.activation_continuations
     set consumed_at = p_now
   where id = v_row.id;

  insert into public.activation_contexts
    (token_hash, amazon_order_id, created_at, updated_at, expires_at, invalidated_at)
  values
    (p_context_token_hash, v_row.amazon_order_id, p_now, p_now, p_context_expires_at, null);

  return 'CONTINUED';
end;
$$;

-- Server-side (service-role) only. The browser (anon / authenticated) must
-- never execute this, so it cannot bypass the authenticated-session authority
-- enforced by the API route.
revoke all on function public.consume_activation_continuation(
  text, text, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.consume_activation_continuation(
  text, text, timestamptz, timestamptz, timestamptz
) to service_role;

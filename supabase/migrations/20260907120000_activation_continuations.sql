-- Cross-device activation continuation references.
--
-- Lets the activation journey resume after email confirmation on a different
-- browser/device, where the original HttpOnly activation-context cookie is
-- absent. Only the SHA-256 hash of the opaque reference is stored; the raw
-- reference lives solely in the confirmation email link. Each reference is
-- short-lived (see ACTIVATION_CONTINUATION_LIFETIME_SECONDS) and single-use
-- (consumed_at is set on first successful consume).

create table public.activation_continuations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  amazon_order_id text not null references public.amazon_orders (amazon_order_id),
  -- Binding key captured at mint time (the sign-up email). The authoritative
  -- identity check happens at consume time against the authenticated session's
  -- email; this column only restricts which confirmed account may consume the
  -- reference. It is never exposed to the browser.
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint activation_continuations_expires_after_created
    check (expires_at > created_at)
);

create index activation_continuations_expires_at_idx
  on public.activation_continuations (expires_at);

alter table public.activation_continuations enable row level security;

revoke all privileges on table public.activation_continuations
  from anon, authenticated, service_role;

grant select, insert, update on table public.activation_continuations to service_role;

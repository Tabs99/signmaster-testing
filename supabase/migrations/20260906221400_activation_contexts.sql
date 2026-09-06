-- Server-side activation context for verified purchase continuity across auth navigation.

create table public.activation_contexts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  amazon_order_id text not null references public.amazon_orders (amazon_order_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  constraint activation_contexts_expires_after_created
    check (expires_at > created_at)
);

create index activation_contexts_expires_at_idx
  on public.activation_contexts (expires_at);

alter table public.activation_contexts enable row level security;

revoke all privileges on table public.activation_contexts
  from anon, authenticated, service_role;

grant select, insert, update on table public.activation_contexts to service_role;

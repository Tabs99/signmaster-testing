-- Initial SignMaster schema: Amazon order sync, entitlements, and sync checkpoints.

create table public.amazon_orders (
  amazon_order_id text primary key,
  purchase_date timestamptz,
  fulfillment_status text not null,
  last_amazon_update timestamptz not null
);

create table public.amazon_order_items (
  order_item_id text primary key,
  amazon_order_id text not null references public.amazon_orders (amazon_order_id),
  asin text not null,
  sku text,
  quantity_ordered integer not null,
  quantity_fulfilled integer not null,
  quantity_returned integer not null default 0,
  constraint amazon_order_items_quantity_ordered_non_negative
    check (quantity_ordered >= 0),
  constraint amazon_order_items_quantity_fulfilled_non_negative
    check (quantity_fulfilled >= 0),
  constraint amazon_order_items_quantity_returned_non_negative
    check (quantity_returned >= 0)
);

create index amazon_order_items_amazon_order_id_idx
  on public.amazon_order_items (amazon_order_id);

create index amazon_order_items_asin_idx
  on public.amazon_order_items (asin);

create table public.app_entitlements (
  id uuid primary key default gen_random_uuid(),
  amazon_order_id text not null unique references public.amazon_orders (amazon_order_id),
  user_id uuid not null references auth.users (id),
  status text not null default 'active',
  claimed_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  constraint app_entitlements_status_check
    check (status in ('active', 'revoked'))
);

create index app_entitlements_user_id_idx
  on public.app_entitlements (user_id);

create table public.sync_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.amazon_orders enable row level security;
alter table public.amazon_order_items enable row level security;
alter table public.app_entitlements enable row level security;
alter table public.sync_state enable row level security;

create policy app_entitlements_select_own
  on public.app_entitlements
  for select
  to authenticated
  using (auth.uid() = user_id);

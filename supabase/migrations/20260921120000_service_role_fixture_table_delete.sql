-- Server-side fixture seed/clean deletes reserved synthetic rows via the service_role
-- client (allowlisted amazon_order_id only). Initial migrations granted select/insert/update
-- but not delete on these tables.

grant delete on table public.activation_continuations to service_role;

grant delete on table public.activation_contexts to service_role;

grant delete on table public.app_entitlements to service_role;

grant delete on table public.amazon_order_items to service_role;

grant delete on table public.amazon_orders to service_role;

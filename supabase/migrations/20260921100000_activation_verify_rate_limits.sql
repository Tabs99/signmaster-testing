-- Sliding-window rate counters for POST /api/activation/verify (serverless-safe, Postgres-backed).

create table public.activation_verify_rate_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  attempt_count integer not null default 0,
  constraint activation_verify_rate_counters_attempt_count_non_negative
    check (attempt_count >= 0),
  primary key (bucket_key, window_start)
);

create index activation_verify_rate_counters_window_start_idx
  on public.activation_verify_rate_counters (window_start);

alter table public.activation_verify_rate_counters enable row level security;

revoke all privileges on table public.activation_verify_rate_counters
  from anon, authenticated, service_role;

grant select, insert, update, delete on table public.activation_verify_rate_counters to service_role;

-- Returns whether the attempt is allowed and optional retry hint (seconds until window resets).
-- bucket_key values are opaque hashes (ip:… / oid:…); never store raw Order IDs or IPs here.
create or replace function public.check_and_record_activation_verify_attempt(
  p_ip_bucket text,
  p_order_bucket text,
  p_now timestamptz default now(),
  p_window_seconds integer default 900,
  p_ip_limit integer default 40,
  p_order_limit integer default 15
)
returns jsonb
language plpgsql
as $$
declare
  v_epoch bigint;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_ip_count integer;
  v_order_count integer;
begin
  if p_ip_bucket is null or length(trim(p_ip_bucket)) = 0 then
    raise exception 'ip bucket required';
  end if;

  v_epoch := floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds;
  v_window_start := to_timestamp(v_epoch);
  v_window_end := v_window_start + (p_window_seconds * interval '1 second');

  delete from public.activation_verify_rate_counters
   where window_start < p_now - interval '48 hours';

  insert into public.activation_verify_rate_counters as counters (bucket_key, window_start, attempt_count)
  values (p_ip_bucket, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set attempt_count = counters.attempt_count + 1
  returning attempt_count into v_ip_count;

  if v_ip_count > p_ip_limit then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_window_end - p_now)))::integer)
    );
  end if;

  if p_order_bucket is not null and length(trim(p_order_bucket)) > 0 then
    insert into public.activation_verify_rate_counters as counters (bucket_key, window_start, attempt_count)
    values (p_order_bucket, v_window_start, 1)
    on conflict (bucket_key, window_start)
    do update set attempt_count = counters.attempt_count + 1
    returning attempt_count into v_order_count;

    if v_order_count > p_order_limit then
      return jsonb_build_object(
        'allowed', false,
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_window_end - p_now)))::integer)
      );
    end if;
  end if;

  return jsonb_build_object('allowed', true, 'retry_after_seconds', null);
end;
$$;

revoke all on function public.check_and_record_activation_verify_attempt(
  text, text, timestamptz, integer, integer, integer
) from public, anon, authenticated;

grant execute on function public.check_and_record_activation_verify_attempt(
  text, text, timestamptz, integer, integer, integer
) to service_role;

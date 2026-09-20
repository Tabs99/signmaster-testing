-- Rate limiting for POST /api/activation/claim (reuses activation_verify_rate_counters).

create or replace function public.check_and_record_activation_claim_attempt(
  p_ip_bucket text,
  p_user_bucket text,
  p_context_bucket text,
  p_now timestamptz default now(),
  p_window_seconds integer default 900,
  p_ip_limit integer default 40,
  p_user_limit integer default 60,
  p_context_limit integer default 45
)
returns jsonb
language plpgsql
as $$
declare
  v_epoch bigint;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_ip_count integer;
  v_user_count integer;
  v_context_count integer;
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

  if p_user_bucket is not null and length(trim(p_user_bucket)) > 0 then
    insert into public.activation_verify_rate_counters as counters (bucket_key, window_start, attempt_count)
    values (p_user_bucket, v_window_start, 1)
    on conflict (bucket_key, window_start)
    do update set attempt_count = counters.attempt_count + 1
    returning attempt_count into v_user_count;

    if v_user_count > p_user_limit then
      return jsonb_build_object(
        'allowed', false,
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_window_end - p_now)))::integer)
      );
    end if;
  end if;

  if p_context_bucket is not null and length(trim(p_context_bucket)) > 0 then
    insert into public.activation_verify_rate_counters as counters (bucket_key, window_start, attempt_count)
    values (p_context_bucket, v_window_start, 1)
    on conflict (bucket_key, window_start)
    do update set attempt_count = counters.attempt_count + 1
    returning attempt_count into v_context_count;

    if v_context_count > p_context_limit then
      return jsonb_build_object(
        'allowed', false,
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_window_end - p_now)))::integer)
      );
    end if;
  end if;

  return jsonb_build_object('allowed', true, 'retry_after_seconds', null);
end;
$$;

revoke all on function public.check_and_record_activation_claim_attempt(
  text, text, text, timestamptz, integer, integer, integer, integer
) from public, anon, authenticated;

grant execute on function public.check_and_record_activation_claim_attempt(
  text, text, text, timestamptz, integer, integer, integer, integer
) to service_role;

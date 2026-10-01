-- ONE FILE ONLY. Stop on any error; issue ROLLBACK and do not continue.
-- Source SHA-256: b6b8827fe1cb2b4236c7856bca4de993ed3b167f918515d0f5a3c4d83d9f9889
-- Application writes must remain suspended. Check baseline before running.
BEGIN;
DO $guard$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Use the reviewed postgres owner'; END IF;
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260903000000' THEN
    RAISE EXCEPTION 'Unexpected migration history: STOP';
  END IF;
END;
$guard$;
-- BEGIN EXACT APPROVED SOURCE
-- Additive: no existing guests are deleted or renamed.
-- On failure suspend guest writes and preserve rows for remediation. Never
-- restore the UUID-only endpoint. Deploy schema and authorized backend together.
-- Legacy rows remain NULL and fail closed: UUID possession cannot claim them.
alter table public.registrations add column management_token_hash text
  constraint registrations_management_token_hash_valid
  check (management_token_hash is null or management_token_hash ~ '^[a-f0-9]{64}$');

create function public.save_registration_guests(target_registration_id uuid, target_guests jsonb, target_token_hash text)
returns table (outcome text, result_payment_method text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.registrations%rowtype;
  requested jsonb;
  stored jsonb;
begin
  -- The same parent lock is used by cash/MP transitions. Concurrent saves and
  -- payment preparation therefore cannot observe a partially saved group.
  select * into target from public.registrations
  where id = target_registration_id for update;
  if not found or target.management_token_hash is null
    or target_token_hash is null or target.management_token_hash is distinct from target_token_hash
    or not exists (select 1 from public.weddings w
      where w.id = target.wedding_id and w.slug = 'ricardo-sabrina-2026' and w.is_active) then
    return query select 'unauthorized', null::text; return;
  end if;
  if target.attendance_status <> 'pending' then
    return query select 'invalid_status', target.payment_method; return;
  end if;
  if target_guests is null or jsonb_typeof(target_guests) <> 'array' then
    return query select 'invalid_guests', target.payment_method; return;
  end if;
  if jsonb_array_length(target_guests) <> target.guest_count then
    return query select 'invalid_guests', target.payment_method; return;
  end if;
  if exists (
    select 1 from jsonb_array_elements(target_guests) g
    where jsonb_typeof(g) <> 'object'
  ) then
    return query select 'invalid_guests', target.payment_method; return;
  end if;
  if exists (
    select 1 from jsonb_array_elements(target_guests) g
    where (g - array['first_name','last_name','age_category']) <> '{}'::jsonb
      or jsonb_typeof(g->'first_name') is distinct from 'string'
      or jsonb_typeof(g->'last_name') is distinct from 'string'
      or jsonb_typeof(g->'age_category') is distinct from 'string'
      or length(btrim(g->>'first_name')) not between 1 and 80
      or length(btrim(g->>'last_name')) not between 1 and 80
      or g->>'age_category' not in ('adult','child','young_child')
  ) or (select count(*) from jsonb_array_elements(target_guests) g where g->>'age_category' = 'adult') <> target.adult_count
    or (select count(*) from jsonb_array_elements(target_guests) g where g->>'age_category' = 'child') <> target.child_count
    or (select count(*) from jsonb_array_elements(target_guests) g where g->>'age_category' = 'young_child') <> target.young_child_count then
    return query select 'invalid_guests', target.payment_method; return;
  end if;

  -- Compare multisets, preserving duplicate names and allowing reordered retries.
  select jsonb_agg(jsonb_build_array(first_name,last_name,age_category)
    order by first_name,last_name,age_category) into stored
  from public.guests where registration_id = target.id;
  select jsonb_agg(jsonb_build_array(btrim(g->>'first_name'),btrim(g->>'last_name'),g->>'age_category')
    order by btrim(g->>'first_name'),btrim(g->>'last_name'),g->>'age_category') into requested
  from jsonb_array_elements(target_guests) g;
  if stored is not null then
    if stored = requested then
      return query select 'already_saved', target.payment_method;
    else
      return query select 'guests_conflict', target.payment_method;
    end if;
    return;
  end if;

  insert into public.guests (registration_id,first_name,last_name,age_category)
  select target.id,btrim(g->>'first_name'),btrim(g->>'last_name'),g->>'age_category'
  from jsonb_array_elements(target_guests) g;
  return query select 'saved', target.payment_method;
end;
$$;

revoke all on function public.save_registration_guests(uuid,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.save_registration_guests(uuid,jsonb,text) to service_role;

-- END EXACT APPROVED SOURCE
-- Version bookkeeping is committed in the same transaction as the migration.
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('20260929000000', 'atomic_guest_registration', ARRAY[$reviewed_migration$-- Additive: no existing guests are deleted or renamed.
-- On failure suspend guest writes and preserve rows for remediation. Never
-- restore the UUID-only endpoint. Deploy schema and authorized backend together.
-- Legacy rows remain NULL and fail closed: UUID possession cannot claim them.
alter table public.registrations add column management_token_hash text
  constraint registrations_management_token_hash_valid
  check (management_token_hash is null or management_token_hash ~ '^[a-f0-9]{64}$');

create function public.save_registration_guests(target_registration_id uuid, target_guests jsonb, target_token_hash text)
returns table (outcome text, result_payment_method text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.registrations%rowtype;
  requested jsonb;
  stored jsonb;
begin
  -- The same parent lock is used by cash/MP transitions. Concurrent saves and
  -- payment preparation therefore cannot observe a partially saved group.
  select * into target from public.registrations
  where id = target_registration_id for update;
  if not found or target.management_token_hash is null
    or target_token_hash is null or target.management_token_hash is distinct from target_token_hash
    or not exists (select 1 from public.weddings w
      where w.id = target.wedding_id and w.slug = 'ricardo-sabrina-2026' and w.is_active) then
    return query select 'unauthorized', null::text; return;
  end if;
  if target.attendance_status <> 'pending' then
    return query select 'invalid_status', target.payment_method; return;
  end if;
  if target_guests is null or jsonb_typeof(target_guests) <> 'array' then
    return query select 'invalid_guests', target.payment_method; return;
  end if;
  if jsonb_array_length(target_guests) <> target.guest_count then
    return query select 'invalid_guests', target.payment_method; return;
  end if;
  if exists (
    select 1 from jsonb_array_elements(target_guests) g
    where jsonb_typeof(g) <> 'object'
  ) then
    return query select 'invalid_guests', target.payment_method; return;
  end if;
  if exists (
    select 1 from jsonb_array_elements(target_guests) g
    where (g - array['first_name','last_name','age_category']) <> '{}'::jsonb
      or jsonb_typeof(g->'first_name') is distinct from 'string'
      or jsonb_typeof(g->'last_name') is distinct from 'string'
      or jsonb_typeof(g->'age_category') is distinct from 'string'
      or length(btrim(g->>'first_name')) not between 1 and 80
      or length(btrim(g->>'last_name')) not between 1 and 80
      or g->>'age_category' not in ('adult','child','young_child')
  ) or (select count(*) from jsonb_array_elements(target_guests) g where g->>'age_category' = 'adult') <> target.adult_count
    or (select count(*) from jsonb_array_elements(target_guests) g where g->>'age_category' = 'child') <> target.child_count
    or (select count(*) from jsonb_array_elements(target_guests) g where g->>'age_category' = 'young_child') <> target.young_child_count then
    return query select 'invalid_guests', target.payment_method; return;
  end if;

  -- Compare multisets, preserving duplicate names and allowing reordered retries.
  select jsonb_agg(jsonb_build_array(first_name,last_name,age_category)
    order by first_name,last_name,age_category) into stored
  from public.guests where registration_id = target.id;
  select jsonb_agg(jsonb_build_array(btrim(g->>'first_name'),btrim(g->>'last_name'),g->>'age_category')
    order by btrim(g->>'first_name'),btrim(g->>'last_name'),g->>'age_category') into requested
  from jsonb_array_elements(target_guests) g;
  if stored is not null then
    if stored = requested then
      return query select 'already_saved', target.payment_method;
    else
      return query select 'guests_conflict', target.payment_method;
    end if;
    return;
  end if;

  insert into public.guests (registration_id,first_name,last_name,age_category)
  select target.id,btrim(g->>'first_name'),btrim(g->>'last_name'),g->>'age_category'
  from jsonb_array_elements(target_guests) g;
  return query select 'saved', target.payment_method;
end;
$$;

revoke all on function public.save_registration_guests(uuid,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.save_registration_guests(uuid,jsonb,text) to service_role;
$reviewed_migration$]);
COMMIT;

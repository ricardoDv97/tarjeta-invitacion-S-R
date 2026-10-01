-- ONE FILE ONLY. Stop on any error; issue ROLLBACK and do not continue.
-- Source SHA-256: f8977617300ed00b3da16f9ba3eafb6e1cc7fddb08f016ba1c8e1d335cfdbe38
-- Application writes must remain suspended. Check baseline before running.
BEGIN;
DO $guard$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Use the reviewed postgres owner'; END IF;
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260929000000' THEN
    RAISE EXCEPTION 'Unexpected migration history: STOP';
  END IF;
END;
$guard$;
-- BEGIN EXACT APPROVED SOURCE
-- Keep payments as the single accounting row per registration. Provider
-- attempts are evidence, never extra rows summed by the existing dashboard.
-- No historical migration is changed. Apply transactionally before deploying.
-- Conceptual rollback: stop webhook processing, export this ledger, restore
-- the two previous RPC definitions, then archive (do not discard) the ledger.
-- Once multiple attempts exist, rollback to the old single-ID behavior loses
-- functionality and requires reconciliation; never silently delete history.
create table public.mercadopago_payment_attempts (
  provider_payment_id text primary key check (provider_payment_id ~ '^[0-9]{1,128}$'),
  payment_id uuid not null references public.payments(id) on delete cascade,
  preference_id text not null check (length(preference_id) > 0),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency = 'ARS'),
  status text not null check (status in ('pending','approved','rejected','cancelled')),
  paid_at timestamptz,
  requires_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercadopago_attempt_paid_at_valid check ((status = 'approved') = (paid_at is not null))
);
create index mercadopago_attempts_payment_idx on public.mercadopago_payment_attempts(payment_id);
create trigger mercadopago_attempts_set_updated_at before update on public.mercadopago_payment_attempts
for each row execute function public.set_updated_at();
alter table public.mercadopago_payment_attempts enable row level security;
revoke all on public.mercadopago_payment_attempts from public, anon, authenticated;
grant select, insert, update on public.mercadopago_payment_attempts to service_role;

-- Fail transactionally on inconsistent historical provider evidence instead
-- of inventing timestamps or dropping rows. Zero-cost payments have no ID.
insert into public.mercadopago_payment_attempts
  (provider_payment_id,payment_id,preference_id,amount,currency,status,paid_at,created_at,updated_at)
select provider_payment_id,id,provider_preference_id,amount,currency,status,paid_at,created_at,updated_at
from public.payments where provider = 'mercadopago' and provider_payment_id is not null;

create or replace function public.apply_mercadopago_payment_result(
  target_registration_id uuid,
  target_provider_payment_id text,
  target_preference_id text,
  target_amount numeric,
  target_currency text,
  target_status text,
  target_paid_at timestamptz
)
returns table (outcome text, result_payment_status text, result_attendance_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  registration public.registrations%rowtype;
  payment public.payments%rowtype;
  attempt public.mercadopago_payment_attempts%rowtype;
  selected_attempt public.mercadopago_payment_attempts%rowtype;
begin
  if target_provider_payment_id is null or target_provider_payment_id !~ '^[0-9]{1,128}$'
    or target_preference_id is null or length(target_preference_id) = 0
    or target_amount is null or target_amount <= 0
    or target_currency is distinct from 'ARS'
    or target_status is null or target_status not in ('pending','approved','rejected','cancelled')
    or (target_status = 'approved' and target_paid_at is null)
    or (target_status <> 'approved' and target_paid_at is not null) then
    return query select 'invalid_input',null::text,null::text; return;
  end if;
  select * into registration from public.registrations where id = target_registration_id for update;
  if not found then
    return query select 'not_found',null::text,null::text; return;
  end if;
  select * into payment from public.payments
  where registration_id = registration.id and provider = 'mercadopago' for update;
  if not found then
    return query select 'payment_not_found',null::text,null::text; return;
  end if;
  if registration.payment_method is distinct from 'mercadopago'
    or payment.external_reference is distinct from registration.id::text
    or payment.amount is distinct from registration.total_amount
    or payment.amount is distinct from target_amount
    or payment.currency is distinct from target_currency
    or payment.provider_preference_id is distinct from target_preference_id
    or registration.payment_status is distinct from payment.status
    or (payment.status = 'approved' and (registration.attendance_status <> 'confirmed' or payment.paid_at is null))
    or (payment.status <> 'approved' and (registration.attendance_status <> 'pending' or payment.paid_at is not null)) then
    return query select 'correlation_mismatch',null::text,null::text; return;
  end if;

  insert into public.mercadopago_payment_attempts
    (provider_payment_id,payment_id,preference_id,amount,currency,status,paid_at)
  values (target_provider_payment_id,payment.id,target_preference_id,target_amount,target_currency,target_status,target_paid_at)
  on conflict (provider_payment_id) do nothing;
  select * into attempt from public.mercadopago_payment_attempts
  where provider_payment_id = target_provider_payment_id for update;
  if attempt.payment_id is distinct from payment.id
    or attempt.preference_id is distinct from target_preference_id
    or attempt.amount is distinct from target_amount or attempt.currency is distinct from target_currency then
    return query select 'correlation_mismatch',null::text,null::text; return;
  end if;
  -- Approved is terminal, both per attempt and in the accounting aggregate.
  if attempt.status <> 'approved' and (attempt.status is distinct from target_status or attempt.paid_at is distinct from target_paid_at) then
    update public.mercadopago_payment_attempts set status = target_status, paid_at = target_paid_at
    where provider_payment_id = target_provider_payment_id;
  end if;
  if payment.status = 'approved' then
    if target_status = 'approved' and payment.provider_payment_id is distinct from target_provider_payment_id then
      update public.mercadopago_payment_attempts set requires_review = true
      where provider_payment_id = target_provider_payment_id and not requires_review;
      return query select 'additional_approved','approved'::text,'confirmed'::text; return;
    end if;
    return query select 'already_applied','approved'::text,'confirmed'::text; return;
  end if;

  -- One successful attempt wins. An old rejection cannot override another
  -- pending attempt. This remains deterministic for concurrent notifications.
  select * into selected_attempt from public.mercadopago_payment_attempts
  where payment_id = payment.id
  order by case status when 'approved' then 0 when 'pending' then 1 else 2 end,
    updated_at desc, provider_payment_id
  limit 1;
  update public.payments set provider_payment_id = selected_attempt.provider_payment_id,
    status = selected_attempt.status, paid_at = selected_attempt.paid_at where id = payment.id;
  update public.registrations set payment_status = selected_attempt.status,
    attendance_status = case when selected_attempt.status = 'approved' then 'confirmed' else 'pending' end
  where id = registration.id;
  return query select 'applied',selected_attempt.status,
    case when selected_attempt.status = 'approved' then 'confirmed' else 'pending' end;
end;
$$;

revoke all on function public.apply_mercadopago_payment_result(uuid,text,text,numeric,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_mercadopago_payment_result(uuid,text,text,numeric,text,text,timestamptz) to service_role;

-- Reuse the existing preference after a non-approved attempt. The attempt
-- ledger retains evidence; checkout never resets provider or payment states.
create or replace function public.prepare_mercadopago_checkout(target_registration_id uuid)
returns table (
  outcome text,
  result_payment_id uuid,
  result_preference_id text,
  result_amount numeric,
  result_couple_name text,
  result_payment_status text,
  result_attendance_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.registrations%rowtype;
  target_wedding public.weddings%rowtype;
  mp_payment public.payments%rowtype;
  actual_guest_count integer;
  actual_adult_count integer;
  actual_child_count integer;
  actual_young_child_count integer;
begin
  select * into target from public.registrations
  where id = target_registration_id for update;

  if not found then
    return query select 'not_found', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;
  if target.payment_method is distinct from 'mercadopago' then
    return query select 'wrong_payment_method', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;
  if target.guest_count is null or target.guest_count < 1
    or target.total_amount is null or target.total_amount < 0 then
    return query select 'invalid_registration', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;

  select * into target_wedding from public.weddings where id = target.wedding_id;
  if not found or target_wedding.payment_enabled is distinct from true then
    return query select 'payment_disabled', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;

  select count(*)::integer,
    count(*) filter (where age_category = 'adult')::integer,
    count(*) filter (where age_category = 'child')::integer,
    count(*) filter (where age_category = 'young_child')::integer
  into actual_guest_count, actual_adult_count, actual_child_count, actual_young_child_count
  from public.guests where registration_id = target.id;

  if actual_guest_count <> target.guest_count
    or actual_adult_count <> target.adult_count
    or actual_child_count <> target.child_count
    or actual_young_child_count <> target.young_child_count then
    return query select 'incomplete_guests', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;

  select * into mp_payment from public.payments
  where registration_id = target.id and provider = 'mercadopago';

  if found then
    if mp_payment.amount is distinct from target.total_amount
      or mp_payment.currency is distinct from 'ARS'
      or mp_payment.external_reference is distinct from target.id::text
      or (mp_payment.provider_payment_id is not null and mp_payment.provider_preference_id is null)
      or mp_payment.paid_at is not null then
      return query select 'inconsistent_existing_payment', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
    end if;

    if target.total_amount = 0 then
      if mp_payment.status is distinct from 'approved'
        or target.attendance_status is distinct from 'confirmed'
        or target.payment_status is distinct from 'approved' then
        return query select 'inconsistent_existing_payment', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
      end if;
      return query select 'free', mp_payment.id, null::text, target.total_amount, target_wedding.couple_name, 'approved', 'confirmed'; return;
    end if;

    if mp_payment.status not in ('pending', 'rejected', 'cancelled')
      or target.attendance_status is distinct from 'pending'
      or target.payment_status is distinct from mp_payment.status then
      return query select 'inconsistent_existing_payment', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
    end if;
    return query select 'ready', mp_payment.id, mp_payment.provider_preference_id, target.total_amount, target_wedding.couple_name, mp_payment.status, 'pending'; return;
  end if;

  if target.attendance_status is distinct from 'pending'
    or target.payment_status is distinct from 'pending' then
    return query select 'invalid_status', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;

  insert into public.payments (
    registration_id, provider, provider_payment_id, provider_preference_id,
    external_reference, amount, currency, status, paid_at
  ) values (
    target.id, 'mercadopago', null, null,
    target.id::text, target.total_amount, 'ARS',
    case when target.total_amount = 0 then 'approved' else 'pending' end, null
  ) returning * into mp_payment;

  if target.total_amount = 0 then
    update public.registrations set attendance_status = 'confirmed', payment_status = 'approved'
    where id = target.id;
    return query select 'free', mp_payment.id, null::text, target.total_amount, target_wedding.couple_name, 'approved', 'confirmed'; return;
  end if;

  return query select 'ready', mp_payment.id, null::text, target.total_amount, target_wedding.couple_name, 'pending', 'pending';
end;
$$;

revoke all on function public.prepare_mercadopago_checkout(uuid) from public;
revoke all on function public.prepare_mercadopago_checkout(uuid) from anon;
revoke all on function public.prepare_mercadopago_checkout(uuid) from authenticated;
grant execute on function public.prepare_mercadopago_checkout(uuid) to service_role;

-- END EXACT APPROVED SOURCE
-- Version bookkeeping is committed in the same transaction as the migration.
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('20260929000100', 'mercadopago_payment_attempts', ARRAY[$reviewed_migration$-- Keep payments as the single accounting row per registration. Provider
-- attempts are evidence, never extra rows summed by the existing dashboard.
-- No historical migration is changed. Apply transactionally before deploying.
-- Conceptual rollback: stop webhook processing, export this ledger, restore
-- the two previous RPC definitions, then archive (do not discard) the ledger.
-- Once multiple attempts exist, rollback to the old single-ID behavior loses
-- functionality and requires reconciliation; never silently delete history.
create table public.mercadopago_payment_attempts (
  provider_payment_id text primary key check (provider_payment_id ~ '^[0-9]{1,128}$'),
  payment_id uuid not null references public.payments(id) on delete cascade,
  preference_id text not null check (length(preference_id) > 0),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency = 'ARS'),
  status text not null check (status in ('pending','approved','rejected','cancelled')),
  paid_at timestamptz,
  requires_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercadopago_attempt_paid_at_valid check ((status = 'approved') = (paid_at is not null))
);
create index mercadopago_attempts_payment_idx on public.mercadopago_payment_attempts(payment_id);
create trigger mercadopago_attempts_set_updated_at before update on public.mercadopago_payment_attempts
for each row execute function public.set_updated_at();
alter table public.mercadopago_payment_attempts enable row level security;
revoke all on public.mercadopago_payment_attempts from public, anon, authenticated;
grant select, insert, update on public.mercadopago_payment_attempts to service_role;

-- Fail transactionally on inconsistent historical provider evidence instead
-- of inventing timestamps or dropping rows. Zero-cost payments have no ID.
insert into public.mercadopago_payment_attempts
  (provider_payment_id,payment_id,preference_id,amount,currency,status,paid_at,created_at,updated_at)
select provider_payment_id,id,provider_preference_id,amount,currency,status,paid_at,created_at,updated_at
from public.payments where provider = 'mercadopago' and provider_payment_id is not null;

create or replace function public.apply_mercadopago_payment_result(
  target_registration_id uuid,
  target_provider_payment_id text,
  target_preference_id text,
  target_amount numeric,
  target_currency text,
  target_status text,
  target_paid_at timestamptz
)
returns table (outcome text, result_payment_status text, result_attendance_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  registration public.registrations%rowtype;
  payment public.payments%rowtype;
  attempt public.mercadopago_payment_attempts%rowtype;
  selected_attempt public.mercadopago_payment_attempts%rowtype;
begin
  if target_provider_payment_id is null or target_provider_payment_id !~ '^[0-9]{1,128}$'
    or target_preference_id is null or length(target_preference_id) = 0
    or target_amount is null or target_amount <= 0
    or target_currency is distinct from 'ARS'
    or target_status is null or target_status not in ('pending','approved','rejected','cancelled')
    or (target_status = 'approved' and target_paid_at is null)
    or (target_status <> 'approved' and target_paid_at is not null) then
    return query select 'invalid_input',null::text,null::text; return;
  end if;
  select * into registration from public.registrations where id = target_registration_id for update;
  if not found then
    return query select 'not_found',null::text,null::text; return;
  end if;
  select * into payment from public.payments
  where registration_id = registration.id and provider = 'mercadopago' for update;
  if not found then
    return query select 'payment_not_found',null::text,null::text; return;
  end if;
  if registration.payment_method is distinct from 'mercadopago'
    or payment.external_reference is distinct from registration.id::text
    or payment.amount is distinct from registration.total_amount
    or payment.amount is distinct from target_amount
    or payment.currency is distinct from target_currency
    or payment.provider_preference_id is distinct from target_preference_id
    or registration.payment_status is distinct from payment.status
    or (payment.status = 'approved' and (registration.attendance_status <> 'confirmed' or payment.paid_at is null))
    or (payment.status <> 'approved' and (registration.attendance_status <> 'pending' or payment.paid_at is not null)) then
    return query select 'correlation_mismatch',null::text,null::text; return;
  end if;

  insert into public.mercadopago_payment_attempts
    (provider_payment_id,payment_id,preference_id,amount,currency,status,paid_at)
  values (target_provider_payment_id,payment.id,target_preference_id,target_amount,target_currency,target_status,target_paid_at)
  on conflict (provider_payment_id) do nothing;
  select * into attempt from public.mercadopago_payment_attempts
  where provider_payment_id = target_provider_payment_id for update;
  if attempt.payment_id is distinct from payment.id
    or attempt.preference_id is distinct from target_preference_id
    or attempt.amount is distinct from target_amount or attempt.currency is distinct from target_currency then
    return query select 'correlation_mismatch',null::text,null::text; return;
  end if;
  -- Approved is terminal, both per attempt and in the accounting aggregate.
  if attempt.status <> 'approved' and (attempt.status is distinct from target_status or attempt.paid_at is distinct from target_paid_at) then
    update public.mercadopago_payment_attempts set status = target_status, paid_at = target_paid_at
    where provider_payment_id = target_provider_payment_id;
  end if;
  if payment.status = 'approved' then
    if target_status = 'approved' and payment.provider_payment_id is distinct from target_provider_payment_id then
      update public.mercadopago_payment_attempts set requires_review = true
      where provider_payment_id = target_provider_payment_id and not requires_review;
      return query select 'additional_approved','approved'::text,'confirmed'::text; return;
    end if;
    return query select 'already_applied','approved'::text,'confirmed'::text; return;
  end if;

  -- One successful attempt wins. An old rejection cannot override another
  -- pending attempt. This remains deterministic for concurrent notifications.
  select * into selected_attempt from public.mercadopago_payment_attempts
  where payment_id = payment.id
  order by case status when 'approved' then 0 when 'pending' then 1 else 2 end,
    updated_at desc, provider_payment_id
  limit 1;
  update public.payments set provider_payment_id = selected_attempt.provider_payment_id,
    status = selected_attempt.status, paid_at = selected_attempt.paid_at where id = payment.id;
  update public.registrations set payment_status = selected_attempt.status,
    attendance_status = case when selected_attempt.status = 'approved' then 'confirmed' else 'pending' end
  where id = registration.id;
  return query select 'applied',selected_attempt.status,
    case when selected_attempt.status = 'approved' then 'confirmed' else 'pending' end;
end;
$$;

revoke all on function public.apply_mercadopago_payment_result(uuid,text,text,numeric,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_mercadopago_payment_result(uuid,text,text,numeric,text,text,timestamptz) to service_role;

-- Reuse the existing preference after a non-approved attempt. The attempt
-- ledger retains evidence; checkout never resets provider or payment states.
create or replace function public.prepare_mercadopago_checkout(target_registration_id uuid)
returns table (
  outcome text,
  result_payment_id uuid,
  result_preference_id text,
  result_amount numeric,
  result_couple_name text,
  result_payment_status text,
  result_attendance_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.registrations%rowtype;
  target_wedding public.weddings%rowtype;
  mp_payment public.payments%rowtype;
  actual_guest_count integer;
  actual_adult_count integer;
  actual_child_count integer;
  actual_young_child_count integer;
begin
  select * into target from public.registrations
  where id = target_registration_id for update;

  if not found then
    return query select 'not_found', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;
  if target.payment_method is distinct from 'mercadopago' then
    return query select 'wrong_payment_method', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;
  if target.guest_count is null or target.guest_count < 1
    or target.total_amount is null or target.total_amount < 0 then
    return query select 'invalid_registration', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;

  select * into target_wedding from public.weddings where id = target.wedding_id;
  if not found or target_wedding.payment_enabled is distinct from true then
    return query select 'payment_disabled', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;

  select count(*)::integer,
    count(*) filter (where age_category = 'adult')::integer,
    count(*) filter (where age_category = 'child')::integer,
    count(*) filter (where age_category = 'young_child')::integer
  into actual_guest_count, actual_adult_count, actual_child_count, actual_young_child_count
  from public.guests where registration_id = target.id;

  if actual_guest_count <> target.guest_count
    or actual_adult_count <> target.adult_count
    or actual_child_count <> target.child_count
    or actual_young_child_count <> target.young_child_count then
    return query select 'incomplete_guests', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;

  select * into mp_payment from public.payments
  where registration_id = target.id and provider = 'mercadopago';

  if found then
    if mp_payment.amount is distinct from target.total_amount
      or mp_payment.currency is distinct from 'ARS'
      or mp_payment.external_reference is distinct from target.id::text
      or (mp_payment.provider_payment_id is not null and mp_payment.provider_preference_id is null)
      or mp_payment.paid_at is not null then
      return query select 'inconsistent_existing_payment', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
    end if;

    if target.total_amount = 0 then
      if mp_payment.status is distinct from 'approved'
        or target.attendance_status is distinct from 'confirmed'
        or target.payment_status is distinct from 'approved' then
        return query select 'inconsistent_existing_payment', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
      end if;
      return query select 'free', mp_payment.id, null::text, target.total_amount, target_wedding.couple_name, 'approved', 'confirmed'; return;
    end if;

    if mp_payment.status not in ('pending', 'rejected', 'cancelled')
      or target.attendance_status is distinct from 'pending'
      or target.payment_status is distinct from mp_payment.status then
      return query select 'inconsistent_existing_payment', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
    end if;
    return query select 'ready', mp_payment.id, mp_payment.provider_preference_id, target.total_amount, target_wedding.couple_name, mp_payment.status, 'pending'; return;
  end if;

  if target.attendance_status is distinct from 'pending'
    or target.payment_status is distinct from 'pending' then
    return query select 'invalid_status', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
  end if;

  insert into public.payments (
    registration_id, provider, provider_payment_id, provider_preference_id,
    external_reference, amount, currency, status, paid_at
  ) values (
    target.id, 'mercadopago', null, null,
    target.id::text, target.total_amount, 'ARS',
    case when target.total_amount = 0 then 'approved' else 'pending' end, null
  ) returning * into mp_payment;

  if target.total_amount = 0 then
    update public.registrations set attendance_status = 'confirmed', payment_status = 'approved'
    where id = target.id;
    return query select 'free', mp_payment.id, null::text, target.total_amount, target_wedding.couple_name, 'approved', 'confirmed'; return;
  end if;

  return query select 'ready', mp_payment.id, null::text, target.total_amount, target_wedding.couple_name, 'pending', 'pending';
end;
$$;

revoke all on function public.prepare_mercadopago_checkout(uuid) from public;
revoke all on function public.prepare_mercadopago_checkout(uuid) from anon;
revoke all on function public.prepare_mercadopago_checkout(uuid) from authenticated;
grant execute on function public.prepare_mercadopago_checkout(uuid) to service_role;
$reviewed_migration$]);
COMMIT;

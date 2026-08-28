alter table public.payments
  add column provider_preference_id text,
  add constraint payments_provider_preference_id_provider_valid
    check (provider_preference_id is null or provider = 'mercadopago'),
  add constraint payments_provider_preference_id_nonempty
    check (provider_preference_id is null or length(provider_preference_id) > 0);

do $$
begin
  if exists (
    select 1 from public.payments where provider = 'mercadopago'
    group by registration_id having count(*) > 1
  ) then
    raise exception 'Cannot enforce Mercado Pago payment uniqueness: duplicate rows exist';
  end if;
end;
$$;

create unique index payments_one_mercadopago_per_registration_idx
  on public.payments (registration_id) where provider = 'mercadopago';

create unique index payments_provider_preference_id_unique_idx
  on public.payments (provider_preference_id)
  where provider_preference_id is not null;

create function public.prepare_mercadopago_checkout(target_registration_id uuid)
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
      or mp_payment.provider_payment_id is not null
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

    if mp_payment.status is distinct from 'pending'
      or target.attendance_status is distinct from 'pending'
      or target.payment_status is distinct from 'pending' then
      return query select 'inconsistent_existing_payment', null::uuid, null::text, null::numeric, null::text, null::text, null::text; return;
    end if;
    return query select 'ready', mp_payment.id, mp_payment.provider_preference_id, target.total_amount, target_wedding.couple_name, 'pending', 'pending'; return;
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

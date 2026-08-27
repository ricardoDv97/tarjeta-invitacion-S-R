-- Abort instead of silently discarding data if cash payments already contain
-- duplicates. The normal pre-Sprint-08 database has none.
do $$
begin
  if exists (
    select 1 from public.payments where provider = 'cash'
    group by registration_id having count(*) > 1
  ) then
    raise exception 'Cannot enforce cash payment uniqueness: duplicate rows exist';
  end if;
end;
$$;

create unique index payments_one_cash_per_registration_idx
  on public.payments (registration_id) where provider = 'cash';

create function public.confirm_cash_payment(target_registration_id uuid)
returns table (outcome text, result_payment_status text, result_attendance_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.registrations%rowtype;
  cash_payment public.payments%rowtype;
  actual_guest_count integer;
  actual_adult_count integer;
  actual_child_count integer;
  actual_young_child_count integer;
  final_payment_status text;
begin
  select * into target from public.registrations
  where id = target_registration_id for update;

  if not found then
    return query select 'not_found', null::text, null::text; return;
  end if;
  if target.payment_method is distinct from 'cash' then
    return query select 'wrong_payment_method', null::text, null::text; return;
  end if;
  if target.guest_count is null
    or target.guest_count < 1
    or target.total_amount is null
    or target.total_amount < 0 then
    return query select 'invalid_registration', null::text, null::text; return;
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
    return query select 'incomplete_guests', null::text, null::text; return;
  end if;

  select * into cash_payment from public.payments
  where registration_id = target.id and provider = 'cash';
  final_payment_status := case when target.total_amount = 0 then 'approved' else 'pending' end;

  if found then
    if cash_payment.amount is distinct from target.total_amount
      or cash_payment.currency is distinct from 'ARS'
      or cash_payment.status is distinct from final_payment_status
      or cash_payment.provider_payment_id is not null
      or cash_payment.paid_at is not null
      or target.attendance_status <> 'confirmed'
      or target.payment_status <> final_payment_status then
      return query select 'inconsistent_existing_payment', null::text, null::text; return;
    end if;
    return query select 'ok', final_payment_status, 'confirmed'::text; return;
  end if;

  if target.attendance_status <> 'pending' or target.payment_status <> 'pending' then
    return query select 'invalid_status', null::text, null::text; return;
  end if;

  insert into public.payments (
    registration_id, provider, provider_payment_id, external_reference,
    amount, currency, status, paid_at
  ) values (
    target.id, 'cash', null, null, target.total_amount, 'ARS', final_payment_status, null
  );

  update public.registrations
  set attendance_status = 'confirmed', payment_status = final_payment_status
  where id = target.id;

  return query select 'ok', final_payment_status, 'confirmed'::text;
end;
$$;

revoke all on function public.confirm_cash_payment(uuid) from public;
revoke all on function public.confirm_cash_payment(uuid) from anon;
revoke all on function public.confirm_cash_payment(uuid) from authenticated;
grant execute on function public.confirm_cash_payment(uuid) to service_role;

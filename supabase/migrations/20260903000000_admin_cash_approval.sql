create function public.approve_cash_payment(target_registration_id uuid)
returns table (outcome text, result_payment_status text, result_attendance_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.registrations%rowtype;
  cash_payment public.payments%rowtype;
begin
  select * into target
  from public.registrations
  where id = target_registration_id
  for update;

  if not found then
    return query select 'not_found', null::text, null::text; return;
  end if;
  if target.payment_method is distinct from 'cash' then
    return query select 'wrong_payment_method', target.payment_status, target.attendance_status; return;
  end if;
  if not exists (
    select 1 from public.weddings
    where id = target.wedding_id and slug = 'ricardo-sabrina-2026'
  ) then
    return query select 'wrong_wedding', target.payment_status, target.attendance_status; return;
  end if;

  select * into cash_payment
  from public.payments
  where registration_id = target.id and provider = 'cash'
  for update;

  if not found then
    return query select 'payment_not_found', target.payment_status, target.attendance_status; return;
  end if;
  if cash_payment.registration_id is distinct from target.id
    or cash_payment.amount is distinct from target.total_amount
    or cash_payment.currency is distinct from 'ARS' then
    return query select 'inconsistent_payment', target.payment_status, target.attendance_status; return;
  end if;

  if cash_payment.status = 'approved'
    and target.payment_status = 'approved'
    and target.attendance_status = 'confirmed'
    and cash_payment.paid_at is not null then
    return query select 'already_applied', 'approved'::text, 'confirmed'::text; return;
  end if;
  if cash_payment.status is distinct from 'pending'
    or target.payment_status is distinct from 'pending'
    or target.attendance_status is distinct from 'confirmed'
    or cash_payment.paid_at is not null then
    return query select 'invalid_status', target.payment_status, target.attendance_status; return;
  end if;

  update public.payments
  set status = 'approved', paid_at = statement_timestamp()
  where id = cash_payment.id;

  update public.registrations
  set payment_status = 'approved', attendance_status = 'confirmed'
  where id = target.id;

  return query select 'approved', 'approved'::text, 'confirmed'::text;
end;
$$;

revoke all on function public.approve_cash_payment(uuid) from public;
revoke all on function public.approve_cash_payment(uuid) from anon;
revoke all on function public.approve_cash_payment(uuid) from authenticated;
grant execute on function public.approve_cash_payment(uuid) to service_role;

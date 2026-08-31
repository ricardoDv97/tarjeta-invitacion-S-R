create function public.apply_mercadopago_payment_result(
  target_registration_id uuid,
  target_provider_payment_id text,
  target_preference_id text,
  target_amount numeric,
  target_currency text,
  target_status text,
  target_paid_at timestamptz
)
returns table (
  outcome text,
  result_payment_status text,
  result_attendance_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_registration public.registrations%rowtype;
  target_payment public.payments%rowtype;
  next_attendance_status text;
begin
  if target_provider_payment_id is null or target_provider_payment_id !~ '^[0-9]{1,128}$'
    or target_amount is null or target_amount < 0
    or target_currency is null or target_currency <> 'ARS'
    or target_status is null
    or target_status not in ('pending', 'approved', 'rejected', 'cancelled')
    or (target_status = 'approved' and target_paid_at is null)
    or (target_status <> 'approved' and target_paid_at is not null) then
    return query select 'invalid_input', null::text, null::text; return;
  end if;

  select * into target_registration
  from public.registrations
  where id = target_registration_id
  for update;

  if not found then
    return query select 'not_found', null::text, null::text; return;
  end if;

  select * into target_payment
  from public.payments
  where registration_id = target_registration.id and provider = 'mercadopago'
  for update;

  if not found then
    return query select 'payment_not_found', null::text, null::text; return;
  end if;

  if target_registration.payment_method is distinct from 'mercadopago'
    or target_payment.external_reference is distinct from target_registration.id::text
    or target_payment.amount is distinct from target_registration.total_amount
    or target_payment.amount is distinct from target_amount
    or target_payment.currency is distinct from target_currency
    or target_payment.provider_preference_id is null
    or (target_preference_id is not null
      and target_payment.provider_preference_id is distinct from target_preference_id) then
    return query select 'correlation_mismatch', null::text, null::text; return;
  end if;

  if target_payment.provider_payment_id is not null
    and target_payment.provider_payment_id is distinct from target_provider_payment_id then
    return query select 'different_payment_id', target_payment.status, target_registration.attendance_status; return;
  end if;

  if target_payment.status = 'approved' then
    if target_registration.payment_status = 'approved'
      and target_registration.attendance_status = 'confirmed'
      and target_payment.provider_payment_id = target_provider_payment_id
      and target_payment.paid_at is not null then
      return query select 'already_applied', 'approved'::text, 'confirmed'::text; return;
    end if;
    return query select 'correlation_mismatch', null::text, null::text; return;
  end if;

  if target_payment.paid_at is not null
    or target_registration.payment_status is distinct from target_payment.status
    or target_registration.attendance_status is distinct from 'pending' then
    return query select 'correlation_mismatch', null::text, null::text; return;
  end if;

  next_attendance_status := case when target_status = 'approved' then 'confirmed' else 'pending' end;

  update public.payments
  set provider_payment_id = target_provider_payment_id,
      status = target_status,
      paid_at = case when target_status = 'approved' then target_paid_at else null end
  where id = target_payment.id;

  update public.registrations
  set payment_status = target_status,
      attendance_status = next_attendance_status
  where id = target_registration.id;

  return query select 'applied', target_status, next_attendance_status;
end;
$$;

revoke all on function public.apply_mercadopago_payment_result(uuid, text, text, numeric, text, text, timestamptz) from public;
revoke all on function public.apply_mercadopago_payment_result(uuid, text, text, numeric, text, text, timestamptz) from anon;
revoke all on function public.apply_mercadopago_payment_result(uuid, text, text, numeric, text, text, timestamptz) from authenticated;
grant execute on function public.apply_mercadopago_payment_result(uuid, text, text, numeric, text, text, timestamptz) to service_role;

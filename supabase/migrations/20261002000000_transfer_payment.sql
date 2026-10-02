-- Sprint 15: additive transfer support. Historical MP schema and data retained.
alter table public.registrations add column if not exists payment_reported_at timestamptz;
alter table public.registrations drop constraint if exists registrations_payment_method_valid;
alter table public.registrations add constraint registrations_payment_method_valid
  check (payment_method is null or payment_method in ('cash','transfer','mercadopago'));
alter table public.payments drop constraint if exists payments_provider_valid;
alter table public.payments add constraint payments_provider_valid
  check (provider in ('cash','transfer','mercadopago'));
create unique index if not exists payments_one_transfer_per_registration_idx
  on public.payments(registration_id) where provider = 'transfer';

create or replace function public.prepare_transfer_payment(target_registration_id uuid, target_token_hash text)
returns table (outcome text, result_payment_status text, result_attendance_status text,
  result_payment_reported_at timestamptz, result_amount numeric)
language plpgsql security invoker set search_path = '' as $$
declare
  target public.registrations%rowtype;
  account public.payments%rowtype;
  event public.weddings%rowtype;
begin
  select * into target from public.registrations where id=target_registration_id for update;
  if not found or target_token_hash is null or target.management_token_hash is null
    or target.management_token_hash is distinct from target_token_hash then
    return query select 'unauthorized',null::text,null::text,null::timestamptz,null::numeric; return;
  end if;
  select * into event from public.weddings where id=target.wedding_id
    and slug='ricardo-sabrina-2026' and is_active;
  if not found then
    return query select 'unauthorized',null::text,null::text,null::timestamptz,null::numeric; return;
  end if;
  if target.payment_method is distinct from 'transfer' then
    return query select 'wrong_payment_method',null::text,null::text,null::timestamptz,null::numeric; return;
  end if;
  if not event.payment_enabled then
    return query select 'payment_disabled',null::text,null::text,null::timestamptz,null::numeric; return;
  end if;
  if target.total_amount < 0 or target.guest_count <> target.adult_count+target.child_count+target.young_child_count then
    return query select 'invalid_registration',null::text,null::text,null::timestamptz,null::numeric; return;
  end if;
  if (select count(*) from public.guests where registration_id=target.id) <> target.guest_count
    or (select count(*) from public.guests where registration_id=target.id and age_category='adult') <> target.adult_count
    or (select count(*) from public.guests where registration_id=target.id and age_category='child') <> target.child_count
    or (select count(*) from public.guests where registration_id=target.id and age_category='young_child') <> target.young_child_count then
    return query select 'incomplete_guests',null::text,null::text,null::timestamptz,null::numeric; return;
  end if;
  if exists (select 1 from public.payments where registration_id=target.id and provider <> 'transfer') then
    return query select 'inconsistent_payment',null::text,null::text,null::timestamptz,null::numeric; return;
  end if;
  select * into account from public.payments where registration_id=target.id and provider='transfer' for update;
  if found then
    if account.amount is distinct from target.total_amount or account.currency <> 'ARS'
      or account.provider_payment_id is not null or account.provider_preference_id is not null
      or account.external_reference is not null then
      return query select 'inconsistent_payment',null::text,null::text,null::timestamptz,null::numeric; return;
    end if;
    if account.status='approved' and target.payment_status='approved'
      and target.attendance_status='confirmed' and account.paid_at is not null then
      return query select 'already_approved','approved','confirmed',target.payment_reported_at,target.total_amount; return;
    end if;
    if account.status <> 'pending' or account.paid_at is not null then
      return query select 'invalid_status',null::text,null::text,null::timestamptz,null::numeric; return;
    end if;
  end if;
  if target.payment_status <> 'pending' or target.attendance_status <> 'pending' then
    return query select 'invalid_status',null::text,null::text,null::timestamptz,null::numeric; return;
  end if;
  if account.id is null then
    insert into public.payments(registration_id,provider,amount,currency,status)
      values(target.id,'transfer',target.total_amount,'ARS','pending');
  end if;
  return query select 'ready','pending','pending',target.payment_reported_at,target.total_amount;
end; $$;

create or replace function public.report_transfer_payment(target_registration_id uuid, target_token_hash text)
returns table (outcome text, result_payment_reported_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare
  target public.registrations%rowtype;
  account public.payments%rowtype;
  event public.weddings%rowtype;
  reported timestamptz;
begin
  select * into target from public.registrations where id=target_registration_id for update;
  if not found or target_token_hash is null or target.management_token_hash is null
    or target.management_token_hash is distinct from target_token_hash then
    return query select 'unauthorized',null::timestamptz; return;
  end if;
  select * into event from public.weddings where id=target.wedding_id
    and slug='ricardo-sabrina-2026' and is_active;
  if not found then
    return query select 'unauthorized',null::timestamptz; return;
  end if;
  if target.payment_method is distinct from 'transfer' then
    return query select 'wrong_payment_method',null::timestamptz; return;
  end if;
  if not event.payment_enabled then
    return query select 'payment_disabled',null::timestamptz; return;
  end if;
  if target.total_amount < 0 or target.guest_count <> target.adult_count+target.child_count+target.young_child_count then
    return query select 'invalid_registration',null::timestamptz; return;
  end if;
  if (select count(*) from public.guests where registration_id=target.id) <> target.guest_count
    or (select count(*) from public.guests where registration_id=target.id and age_category='adult') <> target.adult_count
    or (select count(*) from public.guests where registration_id=target.id and age_category='child') <> target.child_count
    or (select count(*) from public.guests where registration_id=target.id and age_category='young_child') <> target.young_child_count then
    return query select 'incomplete_guests',null::timestamptz; return;
  end if;
  if exists (select 1 from public.payments where registration_id=target.id and provider <> 'transfer') then
    return query select 'inconsistent_payment',null::timestamptz; return;
  end if;
  select * into account from public.payments where registration_id=target.id and provider='transfer' for update;
  if found then
    if account.amount is distinct from target.total_amount or account.currency <> 'ARS'
      or account.provider_payment_id is not null or account.provider_preference_id is not null
      or account.external_reference is not null then
      return query select 'inconsistent_payment',null::timestamptz; return;
    end if;
    if account.status='approved' and target.payment_status='approved'
      and target.attendance_status='confirmed' and account.paid_at is not null then
      return query select 'already_approved',null::timestamptz; return;
    end if;
    if account.status <> 'pending' or account.paid_at is not null then
      return query select 'invalid_status',null::timestamptz; return;
    end if;
  end if;
  if target.payment_status <> 'pending' or target.attendance_status <> 'pending' then
    return query select 'invalid_status',null::timestamptz; return;
  end if;
  -- Declaration cannot prepare, insert or approve accounting rows.
  if account.id is null then
    return query select 'payment_not_found',null::timestamptz; return;
  end if;
  if target.payment_reported_at is not null then
    return query select 'already_reported',target.payment_reported_at; return;
  end if;
  reported := statement_timestamp();
  update public.registrations set payment_reported_at=reported where id=target_registration_id;
  return query select 'reported',reported;
end; $$;

create or replace function public.approve_transfer_payment(target_registration_id uuid)
returns table (outcome text, result_payment_status text, result_attendance_status text)
language plpgsql security invoker set search_path = '' as $$
declare target public.registrations%rowtype; account public.payments%rowtype;
begin
  select * into target from public.registrations where id=target_registration_id for update;
  if not found then return query select 'not_found',null::text,null::text; return; end if;
  if target.payment_method is distinct from 'transfer' then
    return query select 'wrong_payment_method',null::text,null::text; return;
  end if;
  if not exists (select 1 from public.weddings where id=target.wedding_id
    and slug='ricardo-sabrina-2026' and is_active) then
    return query select 'wrong_wedding',null::text,null::text; return;
  end if;
  select * into account from public.payments where registration_id=target.id and provider='transfer' for update;
  if not found then return query select 'payment_not_found',null::text,null::text; return; end if;
  if account.amount is distinct from target.total_amount or account.currency <> 'ARS'
    or account.provider_payment_id is not null or account.provider_preference_id is not null
    or account.external_reference is not null
    or exists (select 1 from public.payments where registration_id=target.id and provider <> 'transfer') then
    return query select 'inconsistent_payment',null::text,null::text; return;
  end if;
  if account.status='approved' and target.payment_status='approved' and target.attendance_status='confirmed' and account.paid_at is not null then
    return query select 'already_applied','approved','confirmed'; return;
  end if;
  if account.status <> 'pending' or target.payment_status <> 'pending'
    or target.attendance_status <> 'pending' or account.paid_at is not null
    or (select count(*) from public.guests where registration_id=target.id) <> target.guest_count
    or (select count(*) from public.guests where registration_id=target.id and age_category='adult') <> target.adult_count
    or (select count(*) from public.guests where registration_id=target.id and age_category='child') <> target.child_count
    or (select count(*) from public.guests where registration_id=target.id and age_category='young_child') <> target.young_child_count then
    return query select 'invalid_status',null::text,null::text; return;
  end if;
  update public.payments set status='approved',paid_at=statement_timestamp() where id=account.id;
  update public.registrations set payment_status='approved',attendance_status='confirmed' where id=target.id;
  return query select 'approved','approved','confirmed';
end; $$;

alter function public.prepare_transfer_payment(uuid,text) owner to postgres;
alter function public.report_transfer_payment(uuid,text) owner to postgres;
alter function public.approve_transfer_payment(uuid) owner to postgres;

revoke all on function public.prepare_transfer_payment(uuid,text), public.report_transfer_payment(uuid,text),
  public.approve_transfer_payment(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_transfer_payment(uuid,text), public.report_transfer_payment(uuid,text),
  public.approve_transfer_payment(uuid) to service_role;
-- Legacy MP functions/tables remain for historical compatibility; no new runtime calls.

-- MANUAL ONLY. Review README and saved preflight before execution. No application writes.
-- Source SHA256: bd797423b1560b0bc3c12ac9ef59fe050c513bd363a6ea2914da33cde96c37bc
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$
BEGIN
 IF to_regclass('public.sprint15_review_snapshot') IS NOT NULL THEN RAISE EXCEPTION 'Unexpected persistent snapshot exists; STOP without deleting it'; END IF;
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Expected postgres owner; STOP'; END IF;
 IF (select max(version) from supabase_migrations.schema_migrations) IS DISTINCT FROM '20260930000000' or exists(select 1 from supabase_migrations.schema_migrations where version='20261002000000') THEN RAISE EXCEPTION 'Unexpected migration history / already applied; STOP'; END IF;
 IF (select count(*) from public.weddings where slug='ricardo-sabrina-2026' and is_active)<>1 THEN RAISE EXCEPTION 'Unexpected application schema/event; STOP'; END IF;
 IF exists(select 1 from information_schema.columns where table_schema='public' and table_name='registrations' and column_name='payment_reported_at') or to_regprocedure('public.prepare_transfer_payment(uuid,text)') is not null or to_regprocedure('public.report_transfer_payment(uuid,text)') is not null or to_regprocedure('public.approve_transfer_payment(uuid)') is not null or to_regclass('public.payments_one_transfer_per_registration_idx') is not null THEN RAISE EXCEPTION 'Sprint 15 objects already exist; STOP'; END IF;
 IF (select count(*) from pg_class where oid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) and relrowsecurity)<>6 or exists(select 1 from pg_policies where schemaname='public' and tablename in ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts')) THEN RAISE EXCEPTION 'Unexpected RLS/policies; STOP'; END IF;
 IF exists(select 1 from pg_class c cross join (values('anon'),('authenticated')) r(role) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege) where c.oid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) and has_table_privilege(role,c.oid,privilege)) THEN RAISE EXCEPTION 'Private table grants are open; STOP'; END IF;
 IF exists(select 1 from pg_class c cross join (values('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege) where c.oid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) and has_table_privilege('service_role',c.oid,privilege)) THEN RAISE EXCEPTION 'Excess runtime grants; STOP'; END IF;
 IF exists(select 1 from pg_attribute a cross join (values('anon'),('authenticated')) r(role) cross join (values('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilege) where a.attrelid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) and a.attnum>0 and not a.attisdropped and has_column_privilege(role,a.attrelid,a.attnum,privilege)) THEN RAISE EXCEPTION 'Private column grants are open; STOP'; END IF;
 IF (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_registration_guests','confirm_cash_payment','approve_cash_payment','prepare_mercadopago_checkout','apply_mercadopago_payment_result'))<>5 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_registration_guests','confirm_cash_payment','approve_cash_payment','prepare_mercadopago_checkout','apply_mercadopago_payment_result') and (p.prosecdef or pg_get_userbyid(p.proowner)<>'postgres' or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or not has_function_privilege('service_role',p.oid,'EXECUTE') or not(coalesce(p.proconfig,array[]::text[]) @> array['search_path=""']))) THEN RAISE EXCEPTION 'Unexpected legacy RPC security; STOP'; END IF;
 IF exists(select 1 from public.registrations where payment_method is not null and payment_method not in ('cash','mercadopago')) or exists(select 1 from public.payments where provider not in ('cash','mercadopago')) THEN RAISE EXCEPTION 'Unexpected preexisting method/provider; STOP'; END IF;
END; $guard$;
LOCK TABLE public.weddings,public.registrations,public.guests,public.payments,public.admin_users,public.mercadopago_payment_attempts IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE pg_temp.sprint15_review_snapshot ON COMMIT DROP AS select jsonb_build_object('r',(select coalesce(jsonb_agg(to_jsonb(r)-'payment_reported_at' order by id),'[]') from public.registrations r),'p',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.payments p),'g',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]') from public.guests g),'a',(select coalesce(jsonb_agg(to_jsonb(a) order by provider_payment_id),'[]') from public.mercadopago_payment_attempts a),'w',(select coalesce(jsonb_agg(to_jsonb(w) order by id),'[]') from public.weddings w),'admins',(select coalesce(jsonb_agg(to_jsonb(a) order by user_id),'[]') from public.admin_users a)) as data;
REVOKE ALL ON TABLE pg_temp.sprint15_review_snapshot FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE pg_temp.sprint15_review_snapshot ADD COLUMN security jsonb;
UPDATE pg_temp.sprint15_review_snapshot SET security=(select jsonb_build_object('tables',(select jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl) order by c.relname) from pg_class c where c.oid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass)),'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attacl) order by c.relname,a.attname) from pg_attribute a join pg_class c on c.oid=a.attrelid where c.oid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) and a.attnum>0 and not a.attisdropped and a.attname<>'payment_reported_at'),'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by tablename,policyname),'[]') from pg_policies p where schemaname='public' and tablename in ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts')),'legacy_rpcs',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_registration_guests','confirm_cash_payment','approve_cash_payment','prepare_mercadopago_checkout','apply_mercadopago_payment_result','set_updated_at'))));
-- BEGIN EXACT REVIEWED SOURCE
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
-- END EXACT REVIEWED SOURCE
DO $assert$
BEGIN
 IF (select data from pg_temp.sprint15_review_snapshot) IS DISTINCT FROM (select jsonb_build_object('r',(select coalesce(jsonb_agg(to_jsonb(r)-'payment_reported_at' order by id),'[]') from public.registrations r),'p',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.payments p),'g',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]') from public.guests g),'a',(select coalesce(jsonb_agg(to_jsonb(a) order by provider_payment_id),'[]') from public.mercadopago_payment_attempts a),'w',(select coalesce(jsonb_agg(to_jsonb(w) order by id),'[]') from public.weddings w),'admins',(select coalesce(jsonb_agg(to_jsonb(a) order by user_id),'[]') from public.admin_users a))) THEN RAISE EXCEPTION 'Existing application rows changed; rollback'; END IF;
 IF (select security from pg_temp.sprint15_review_snapshot) IS DISTINCT FROM (select jsonb_build_object('tables',(select jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl) order by c.relname) from pg_class c where c.oid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass)),'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attacl) order by c.relname,a.attname) from pg_attribute a join pg_class c on c.oid=a.attrelid where c.oid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) and a.attnum>0 and not a.attisdropped and a.attname<>'payment_reported_at'),'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by tablename,policyname),'[]') from pg_policies p where schemaname='public' and tablename in ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts')),'legacy_rpcs',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_registration_guests','confirm_cash_payment','approve_cash_payment','prepare_mercadopago_checkout','apply_mercadopago_payment_result','set_updated_at')))) THEN RAISE EXCEPTION 'Existing ACL/RLS/policies/RPC changed; rollback'; END IF;
 IF exists(select 1 from public.registrations where payment_reported_at is not null) THEN RAISE EXCEPTION 'Unexpected backfill; rollback'; END IF;
END; $assert$;
-- Snapshot is no longer needed. Explicit cleanup supplements ON COMMIT DROP.
DROP TABLE pg_temp.sprint15_review_snapshot;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES ('20261002000000','transfer_payment',ARRAY[$reviewed_migration$-- Sprint 15: additive transfer support. Historical MP schema and data retained.
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
$reviewed_migration$]);
COMMIT;

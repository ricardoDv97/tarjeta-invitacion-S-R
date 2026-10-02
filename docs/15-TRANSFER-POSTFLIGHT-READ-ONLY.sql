-- Sprint 15 postflight: SELECT only. Run immediately after migration and before new RSVP.
-- Re-run 15-TRANSFER-BASELINE-READ-ONLY.sql: all four digests, legacy counts and ACL/RLS
-- must match baseline. No data updates/backfills are expected from this migration.
select column_name,data_type,is_nullable from information_schema.columns
where table_schema='public' and table_name='registrations' and column_name in ('payment_reported_at','management_token_hash');
select conname,pg_get_constraintdef(oid) from pg_constraint
where conrelid in ('public.registrations'::regclass,'public.payments'::regclass)
and conname in ('registrations_payment_method_valid','payments_provider_valid','registrations_management_token_hash_valid');
select indexname,indexdef from pg_indexes where schemaname='public' and indexname='payments_one_transfer_per_registration_idx';
select oid::regprocedure as rpc,prosecdef,proconfig,proacl from pg_proc
where oid in ('public.prepare_transfer_payment(uuid,text)'::regprocedure,
'public.report_transfer_payment(uuid,text)'::regprocedure,'public.approve_transfer_payment(uuid)'::regprocedure);
select signature,role,has_function_privilege(role,'public.'||signature,'EXECUTE') as allowed
from (values ('prepare_transfer_payment(uuid,text)'),('report_transfer_payment(uuid,text)'),('approve_transfer_payment(uuid)')) f(signature)
cross join (values ('anon'),('authenticated'),('service_role')) r(role);
select c.relname,c.relrowsecurity,c.relacl from pg_class c
where c.oid in ('public.registrations'::regclass,'public.payments'::regclass,'public.guests'::regclass,'public.weddings'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) order by c.relname;
select count(*) as reported_rows from public.registrations where payment_reported_at is not null;
select count(*) as duplicate_transfer_groups from (select registration_id from public.payments where provider='transfer' group by registration_id having count(*)>1) d;
select count(*) as inconsistent_transfers from public.payments p join public.registrations r on r.id=p.registration_id
where p.provider='transfer' and (r.payment_method <> 'transfer' or p.amount <> r.total_amount or p.currency <> 'ARS'
  or p.provider_payment_id is not null or p.provider_preference_id is not null or p.external_reference is not null
  or p.status <> r.payment_status or (p.status='approved' and (p.paid_at is null or r.attendance_status <> 'confirmed'))
  or (p.status='pending' and (p.paid_at is not null or r.attendance_status <> 'pending')));
select count(*) as legacy_attempts from public.mercadopago_payment_attempts;

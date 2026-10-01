select version,name from supabase_migrations.schema_migrations order by version desc;
select column_name,data_type,is_nullable,column_default from information_schema.columns
where table_schema='public' and table_name='registrations' and column_name='management_token_hash';
-- Both counts must be 12. No public writes are permitted during this operation.
select count(*) as registrations_total,
  count(*) filter(where management_token_hash is null) as legacy_without_token
from public.registrations;
select to_regprocedure('public.save_registration_guests(uuid,jsonb)') as old_rpc_must_be_null,
  to_regprocedure('public.save_registration_guests(uuid,jsonb,text)') as authorized_rpc;
select p.oid::regprocedure,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,p.proacl
from pg_proc p where p.oid=to_regprocedure('public.save_registration_guests(uuid,jsonb,text)');
select r.rolname,has_function_privilege(r.oid,
  'public.save_registration_guests(uuid,jsonb,text)','EXECUTE') as can_execute
from pg_roles r where rolname in ('anon','authenticated','service_role');
-- Re-run the fingerprint SELECT in 00 and compare ALL THREE rows with baseline.

select version,name from supabase_migrations.schema_migrations order by version desc;
-- Every matches_expected must be TRUE. MAINTAIN is version-gated for local PG16.
select t.name,r.rolname,p.privilege,
  case when p.privilege='MAINTAIN' and current_setting('server_version_num')::int<170000
    then false else has_table_privilege(r.oid,'public.'||t.name,p.privilege) end as allowed,
  (case when p.privilege='MAINTAIN' and current_setting('server_version_num')::int<170000
    then false else has_table_privilege(r.oid,'public.'||t.name,p.privilege) end) =
  (r.rolname='service_role' and (p.privilege='SELECT'
    or (p.privilege='INSERT' and t.name not in ('weddings','admin_users'))
    or (p.privilege='UPDATE' and t.name in ('registrations','payments','mercadopago_payment_attempts')))) as matches_expected
from (values('weddings'),('registrations'),('guests'),('payments'),('admin_users'),('mercadopago_payment_attempts')) t(name)
cross join pg_roles r
cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
where r.rolname in ('anon','authenticated','service_role') order by t.name,r.rolname,p.privilege;
-- All six rows: RLS true, owner postgres. Zero policy rows expected.
select relname,pg_get_userbyid(relowner) as owner,relrowsecurity,relacl from pg_class
where relnamespace='public'::regnamespace and relname in
  ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts');
select * from pg_policies where schemaname='public' and tablename in
  ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts');
-- All five signatures must exist. anon/authenticated false, service_role true.
select s.signature,to_regprocedure(s.signature) as existing_function,r.rolname,
  has_function_privilege(r.oid,to_regprocedure(s.signature),'EXECUTE') as can_execute
from (values('public.save_registration_guests(uuid,jsonb,text)'),
  ('public.prepare_mercadopago_checkout(uuid)'),('public.confirm_cash_payment(uuid)'),
  ('public.approve_cash_payment(uuid)'),
  ('public.apply_mercadopago_payment_result(uuid,text,text,numeric,text,text,timestamptz)')) s(signature)
cross join pg_roles r where r.rolname in ('anon','authenticated','service_role');
select p.oid::regprocedure,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,p.proacl
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
  ('save_registration_guests','prepare_mercadopago_checkout','confirm_cash_payment','approve_cash_payment','apply_mercadopago_payment_result');
-- Also run 40-INTEGRITY and compare fingerprints from 00 with baseline.

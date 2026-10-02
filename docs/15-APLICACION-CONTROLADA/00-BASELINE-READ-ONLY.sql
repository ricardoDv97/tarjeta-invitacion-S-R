-- READ ONLY. Execute whole file while application writes are suspended. Save all result sets privately.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
select current_timestamp as captured_at,current_database(),current_user,version();
select version,name from supabase_migrations.schema_migrations order by version;
select column_name,data_type,is_nullable from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by ordinal_position;
select conrelid::regclass as table_name,conname,convalidated,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) order by conrelid::regclass::text,conname;
select 'registrations' as object,count(*) as rows,md5(coalesce(jsonb_agg(to_jsonb(r)-'payment_reported_at' order by id)::text,'[]')) as fingerprint from public.registrations r
union all select 'guests',count(*),md5(coalesce(jsonb_agg(to_jsonb(g) order by id)::text,'[]')) from public.guests g
union all select 'payments',count(*),md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'[]')) from public.payments p
union all select 'mercadopago_payment_attempts',count(*),md5(coalesce(jsonb_agg(to_jsonb(a) order by provider_payment_id)::text,'[]')) from public.mercadopago_payment_attempts a
union all select 'admin_users',count(*),md5(coalesce(jsonb_agg(to_jsonb(a) order by user_id)::text,'[]')) from public.admin_users a
union all select 'weddings',count(*),md5(coalesce(jsonb_agg(to_jsonb(w) order by id)::text,'[]')) from public.weddings w;
select 'legacy_QA_NULL_token' as object,count(*) as rows,md5(coalesce(jsonb_agg(to_jsonb(r)-'payment_reported_at' order by id)::text,'[]')) as fingerprint from public.registrations r where management_token_hash is null;
select 'MP_registrations' as object,count(*) as rows,md5(coalesce(jsonb_agg(to_jsonb(r)-'payment_reported_at' order by id)::text,'[]')) as fingerprint from public.registrations r where payment_method='mercadopago';
select 'cash_registrations' as object,count(*) as rows,md5(coalesce(jsonb_agg(to_jsonb(r)-'payment_reported_at' order by id)::text,'[]')) as fingerprint from public.registrations r where payment_method='cash';
select payment_method,payment_status,attendance_status,count(*) from public.registrations group by payment_method,payment_status,attendance_status order by payment_method,payment_status,attendance_status;
select provider,status,count(*),sum(amount) from public.payments group by provider,status order by provider,status;
select count(*) as pending_registrations from public.registrations where payment_status='pending';
select count(*) as pending_payments from public.payments where status='pending';
select count(*) as legacy_token_null from public.registrations where management_token_hash is null;
select id,slug,is_active,payment_enabled,price_per_guest,child_price from public.weddings where is_active order by id;
select count(*) as unexpected_transfer_registrations from public.registrations where payment_method='transfer';
select count(*) as unexpected_transfer_payments from public.payments where provider='transfer';
select count(*) as unexpected_reported_rows from public.registrations r where to_jsonb(r)->>'payment_reported_at' is not null;
select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner,c.relacl from pg_class c where c.oid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) order by c.relname;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts') order by tablename,policyname;
select table_name,grantee,privilege_type,is_grantable from information_schema.table_privileges where table_schema='public' and table_name in ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts') order by table_name,grantee,privilege_type;
select table_name,column_name,grantee,privilege_type from information_schema.column_privileges where table_schema='public' and table_name in ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts') order by table_name,column_name,grantee,privilege_type;
select p.oid::regprocedure as rpc,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,p.proacl,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_registration_guests','confirm_cash_payment','approve_cash_payment','prepare_mercadopago_checkout','apply_mercadopago_payment_result','prepare_transfer_payment','report_transfer_payment','approve_transfer_payment','set_updated_at') order by p.oid::regprocedure::text;
select c.relname,role,privilege,has_table_privilege(role,c.oid,privilege) as allowed from pg_class c cross join (values ('anon'),('authenticated'),('service_role')) r(role) cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege) where c.oid in ('public.weddings'::regclass,'public.registrations'::regclass,'public.guests'::regclass,'public.payments'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) order by c.relname,role,privilege;
COMMIT;

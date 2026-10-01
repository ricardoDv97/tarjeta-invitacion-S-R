-- Auditoría humana previa. Ejecutar con acceso al catálogo, SIN aplicar migraciones.
-- No devuelve nombres, correos, secretos ni IDs de inscripciones.
select current_user, version();
select version from supabase_migrations.schema_migrations order by version;

-- Deben existir las migraciones históricas hasta 20260903000000.
-- Los objetos nuevos deben estar ausentes antes de su primera aplicación.
select to_regprocedure('public.save_registration_guests(uuid,jsonb)') as guest_rpc,
  to_regprocedure('public.save_registration_guests(uuid,jsonb,text)') as authorized_guest_rpc,
  to_regclass('public.mercadopago_payment_attempts') as attempts,
  to_regclass('public.mercadopago_attempts_payment_idx') as attempts_index;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts')
order by table_name,ordinal_position;
select c.relname, con.conname,con.convalidated,pg_get_constraintdef(con.oid)
from pg_constraint con join pg_class c on c.oid=con.conrelid
where c.relnamespace='public'::regnamespace order by c.relname,con.conname;
select tablename,indexname,indexdef from pg_indexes where schemaname='public';
select c.relname,i.indisvalid,i.indisready from pg_index i join pg_class c on c.oid=i.indexrelid
where c.relnamespace='public'::regnamespace;
select c.relname,t.tgname,pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid
where c.relnamespace='public'::regnamespace and not t.tgisinternal;

-- Owner, ACL explícita, SECURITY y cuerpo efectivo de todas las funciones públicas.
select p.oid::regprocedure,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,p.proacl,
  pg_get_functiondef(p.oid)
from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';
select p.oid::regprocedure,r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') as execute
from pg_proc p cross join pg_roles r
where p.pronamespace='public'::regnamespace and r.rolname in ('anon','authenticated','service_role');
select pg_get_userbyid(d.defaclrole) as owner,n.nspname,d.defaclobjtype,d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace;
select c.relname,pg_get_userbyid(c.relowner) as owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl
from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r';
select c.relname,r.rolname,v.privilege,has_table_privilege(r.oid,c.oid,v.privilege) as allowed
from pg_class c cross join pg_roles r
cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
where c.relnamespace='public'::regnamespace and c.relkind='r'
and r.rolname in ('anon','authenticated','service_role');
select * from pg_policies where schemaname='public';
select table_name,column_name,grantee,privilege_type,is_grantable
from information_schema.column_privileges
where table_schema='public'
  and table_name in ('weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts')
order by table_name,column_name,grantee,privilege_type;
select rolname,rolsuper,rolinherit,rolbypassrls from pg_roles
where rolname in ('anon','authenticated','service_role');
select pg_get_userbyid(roleid) as role,pg_get_userbyid(member) as member,admin_option from pg_auth_members;

-- Debe dar cero: datos que harían fallar el backfill.
select count(*) as invalid_backfill_rows from public.payments
where provider='mercadopago' and provider_payment_id is not null and (
  provider_payment_id !~ '^[0-9]{1,128}$'
  or provider_preference_id is null or length(provider_preference_id)=0
  or amount is null or not(amount>0) or amount::text in ('NaN','Infinity','-Infinity')
  or currency is distinct from 'ARS'
  or status is null or status not in ('pending','approved','rejected','cancelled')
  or ((status='approved') is distinct from (paid_at is not null))
  or created_at is null or updated_at is null);
select count(*) as duplicate_external_ids from (
  select provider_payment_id from public.payments
  where provider='mercadopago' and provider_payment_id is not null
  group by provider_payment_id having count(*)>1) q;
select count(*) as duplicate_accounting_rows from (
  select registration_id,provider from public.payments
  group by registration_id,provider having count(*)>1) q;
select count(*) as invalid_payment_correlations from public.payments p
left join public.registrations r on r.id=p.registration_id
where p.provider='mercadopago' and (
  r.id is null or r.payment_method is distinct from p.provider
  or p.external_reference is distinct from r.id::text
  or p.amount is distinct from r.total_amount or p.currency is distinct from 'ARS'
  or p.status is distinct from r.payment_status
  or (p.status='approved' and r.attendance_status is distinct from 'confirmed')
  or (p.status<>'approved' and r.attendance_status is distinct from 'pending')
  or (p.status='approved' and p.amount>0 and (p.provider_payment_id is null or p.paid_at is null))
  or (p.status<>'approved' and p.paid_at is not null));
select count(*) as invalid_existing_guest_groups from public.registrations r
join lateral (select count(*) as n,
  count(*) filter(where age_category='adult') as a,
  count(*) filter(where age_category='child') as c,
  count(*) filter(where age_category='young_child') as y,
  count(*) filter(where first_name is null or last_name is null
    or length(btrim(first_name)) not between 1 and 80
    or length(btrim(last_name)) not between 1 and 80
    or first_name<>btrim(first_name) or last_name<>btrim(last_name)) as invalid
  from public.guests where registration_id=r.id) g on true
where g.n>0 and (g.n<>r.guest_count or g.a<>r.adult_count or g.c<>r.child_count
  or g.y<>r.young_child_count or g.invalid>0);
-- Compatible antes/despues de agregar la columna, sin devolver hashes.
select count(*) as registrations_without_management_token
from public.registrations r where to_jsonb(r)->>'management_token_hash' is null;
select count(*) as expected_active_weddings from public.weddings
where slug='ricardo-sabrina-2026' and is_active;
select count(*) as invalid_registration_fields from public.registrations
where wedding_id is null or attendance_status is null or guest_count is null
  or adult_count is null or child_count is null or young_child_count is null;

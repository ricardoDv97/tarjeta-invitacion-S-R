-- Run before any APPLY and retain every result. SELECT only.
select current_user, current_database(), version();
select version from supabase_migrations.schema_migrations order by version desc;
-- Confirm version=text, name=text, statements=text[]; inspect extra NOT NULL columns.
select column_name,data_type,udt_name,is_nullable,column_default
from information_schema.columns
where table_schema='supabase_migrations' and table_name='schema_migrations'
order by ordinal_position;
select to_regprocedure('public.save_registration_guests(uuid,jsonb)') as old_rpc,
  to_regprocedure('public.save_registration_guests(uuid,jsonb,text)') as new_rpc,
  to_regclass('public.mercadopago_payment_attempts') as attempts,
  to_regclass('public.mercadopago_attempts_payment_idx') as attempts_index;
select column_name from information_schema.columns where table_schema='public'
  and table_name='registrations' and column_name='management_token_hash';
-- Save fingerprints. Re-run after EACH migration: every count/fingerprint must match.
-- The future hash column is deliberately excluded. No row contents are returned.
select 'registrations' as object_name,count(*) as rows,
  encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r)-'management_token_hash' order by id),'[]'::jsonb)::text,'UTF8')),'hex') as fingerprint
from public.registrations r
union all
select 'guests',count(*),encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb)::text,'UTF8')),'hex') from public.guests g
union all
select 'payments',count(*),encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb)::text,'UTF8')),'hex') from public.payments p;

-- Sprint 15 baseline: read-only. Save results privately before applying migration.
select current_timestamp as captured_at;
select payment_method, count(*) from public.registrations group by payment_method order by payment_method;
select provider, status, count(*), sum(amount) from public.payments group by provider,status order by provider,status;
select 'registrations' as object,
  md5(coalesce(jsonb_agg(to_jsonb(r)-'payment_reported_at' order by id)::text,'[]')) as snapshot
  from public.registrations r
union all select 'guests',md5(coalesce(jsonb_agg(to_jsonb(g) order by id)::text,'[]')) from public.guests g
union all select 'payments',md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'[]')) from public.payments p
union all select 'legacy_attempts',md5(coalesce(jsonb_agg(to_jsonb(a) order by provider_payment_id)::text,'[]')) from public.mercadopago_payment_attempts a;
select c.relname,c.relrowsecurity,c.relacl from pg_class c
where c.oid in ('public.registrations'::regclass,'public.payments'::regclass,'public.guests'::regclass,'public.weddings'::regclass,'public.admin_users'::regclass,'public.mercadopago_payment_attempts'::regclass) order by c.relname;

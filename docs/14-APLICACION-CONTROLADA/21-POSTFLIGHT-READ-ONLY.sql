select version,name from supabase_migrations.schema_migrations order by version desc;
select to_regclass('public.mercadopago_payment_attempts') as attempts,
  to_regclass('public.mercadopago_attempts_payment_idx') as lookup_index;
select c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)
from pg_index i join pg_class c on c.oid=i.indexrelid
where i.indrelid='public.mercadopago_payment_attempts'::regclass;
select conname,convalidated,pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.mercadopago_payment_attempts'::regclass;
-- Both counts must match. mismatch must be ZERO; compares every backfilled field.
select (select count(*) from public.payments where provider='mercadopago' and provider_payment_id is not null) as expected_attempts,
  (select count(*) from public.mercadopago_payment_attempts) as actual_attempts;
select count(*) as backfill_mismatch from
  (select * from public.payments where provider='mercadopago' and provider_payment_id is not null) p
full join public.mercadopago_payment_attempts a on a.provider_payment_id=p.provider_payment_id
where p.id is null or a.provider_payment_id is null or a.payment_id is distinct from p.id
  or a.preference_id is distinct from p.provider_preference_id
  or a.amount is distinct from p.amount or a.currency is distinct from p.currency
  or a.status is distinct from p.status or a.paid_at is distinct from p.paid_at
  or a.created_at is distinct from p.created_at or a.updated_at is distinct from p.updated_at
  or a.requires_review is distinct from false;
select count(*) as duplicate_attempt_ids from (
  select provider_payment_id from public.mercadopago_payment_attempts
  group by provider_payment_id having count(*)>1) q;
select tgname,pg_get_triggerdef(oid) from pg_trigger
where tgrelid='public.mercadopago_payment_attempts'::regclass and not tgisinternal;
-- Also run 40-INTEGRITY, and compare fingerprints from 00 with baseline.

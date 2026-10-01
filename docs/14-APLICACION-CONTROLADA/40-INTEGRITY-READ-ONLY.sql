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

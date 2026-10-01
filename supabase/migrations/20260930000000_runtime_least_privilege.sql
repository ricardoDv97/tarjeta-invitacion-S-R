-- Scoped to application tables; remove additive defaults before runtime grants.
revoke all on table public.weddings, public.registrations, public.guests,
  public.payments, public.admin_users, public.mercadopago_payment_attempts
  from public, anon, authenticated, service_role;
grant select on public.weddings, public.admin_users to service_role;
grant select, insert, update on public.registrations, public.payments,
  public.mercadopago_payment_attempts to service_role;
grant select, insert on public.guests to service_role;

-- Trigger execution does not need runtime EXECUTE grants after creation.
revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;

-- No global default-ACL mutation: public may contain objects of other apps.
-- Every future application object must explicitly reset ACLs before granting.
-- INVOKER RPC owners remain the migration creator (postgres in local tests).

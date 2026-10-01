-- ONE FILE ONLY. Stop on any error; issue ROLLBACK and do not continue.
-- Source SHA-256: 90302ded14f38996eaa374f38c088d159dbe97225c65a947436826884dbae3f7
-- Application writes must remain suspended. Check baseline before running.
BEGIN;
DO $guard$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Use the reviewed postgres owner'; END IF;
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260929000100' THEN
    RAISE EXCEPTION 'Unexpected migration history: STOP';
  END IF;
END;
$guard$;
-- BEGIN EXACT APPROVED SOURCE
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

-- END EXACT APPROVED SOURCE
-- Version bookkeeping is committed in the same transaction as the migration.
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('20260930000000', 'runtime_least_privilege', ARRAY[$reviewed_migration$-- Scoped to application tables; remove additive defaults before runtime grants.
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
$reviewed_migration$]);
COMMIT;

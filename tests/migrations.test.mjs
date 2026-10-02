import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { startPostgres } from './helpers/postgres.mjs'

test('new migrations preserve and backfill existing payments, including free registrations', async () => {
  const db = await startPostgres()
  try {
    await db.migrate(name => name < '20260929')
    await db.query(`insert into public.weddings(id,slug,couple_name,payment_enabled) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legacy','Legacy',true);
      insert into public.registrations(id,wedding_id,guest_count,adult_count,payment_method,total_amount,payment_status,attendance_status) values
      ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,1,'mercadopago',100,'rejected','pending'),
      ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,1,'mercadopago',100,'approved','confirmed'),
      ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,1,'mercadopago',0,'approved','confirmed');
      insert into public.payments(registration_id,provider,provider_payment_id,provider_preference_id,external_reference,amount,status,paid_at) values
      ('11111111-1111-4111-8111-111111111111','mercadopago','9001','legacy-failed','11111111-1111-4111-8111-111111111111',100,'rejected',null),
      ('22222222-2222-4222-8222-222222222222','mercadopago','9002','legacy-approved','22222222-2222-4222-8222-222222222222',100,'approved','2026-09-29T12:00:00Z'),
      ('33333333-3333-4333-8333-333333333333','mercadopago',null,null,'33333333-3333-4333-8333-333333333333',0,'approved',null);`)
    await db.query(`insert into public.registrations(wedding_id,guest_count,adult_count,payment_method,total_amount)
      select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,1,'cash',100 from generate_series(1,9);`)
    const registrations = await db.query('select jsonb_agg(to_jsonb(r) order by id) from public.registrations r')
    const original = await db.query('select json_agg(p order by id) from public.payments p')
    await db.migrate(name => name >= '20260929')
    assert.equal(await db.query("select jsonb_agg(to_jsonb(r)-'management_token_hash'-'payment_reported_at' order by id) from public.registrations r"), registrations)
    assert.equal(await db.query('select count(*) from public.registrations where management_token_hash is null'), '12')
    assert.equal(await db.query("set role service_role; select outcome from public.save_registration_guests('11111111-1111-4111-8111-111111111111','[]',repeat('a',64))"), 'unauthorized')
    assert.equal(await db.query('select json_agg(p order by id) from public.payments p'), original)
    assert.equal(await db.query('select count(*) from public.mercadopago_payment_attempts'), '2')
    assert.equal(await db.query("select status from public.mercadopago_payment_attempts where provider_payment_id='9001'"), 'rejected')
    assert.equal(await db.query("select outcome from public.apply_mercadopago_payment_result('11111111-1111-4111-8111-111111111111','9003','legacy-failed',100,'ARS','approved','2026-09-29T12:00:00Z')"), 'applied')
    assert.equal(await db.query("select outcome from public.apply_mercadopago_payment_result('22222222-2222-4222-8222-222222222222','9002','legacy-approved',100,'ARS','approved','2026-09-29T12:00:00Z')"), 'already_applied')
    assert.equal(await db.query('select count(*) from public.payments'), '3')
  } finally { await db.stop() }
})

test('each pending migration rolls back its entire catalog change on failure', async () => {
  const db = await startPostgres()
  const names = ['20260929000000_atomic_guest_registration.sql', '20260929000100_mercadopago_payment_attempts.sql', '20260930000000_runtime_least_privilege.sql']
  const snapshot = () => db.query(`select jsonb_build_object(
    'relations',(select jsonb_agg(jsonb_build_array(relname,relacl,relrowsecurity) order by relname) from pg_class where relnamespace='public'::regnamespace),
    'columns',(select jsonb_agg(jsonb_build_array(table_name,column_name,data_type,is_nullable,column_default) order by table_name,ordinal_position) from information_schema.columns where table_schema='public'),
    'functions',(select jsonb_agg(jsonb_build_array(oid::regprocedure::text,proacl,pg_get_functiondef(oid)) order by oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace and prokind='f'))`)
  try {
    await db.migrate(name => name < '20260929')
    for (const name of names) {
      const before = await snapshot()
      const sql = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
      await assert.rejects(db.query(`begin;\n${sql}\nselect 1/0;\ncommit;`), /division by zero/)
      assert.equal(await snapshot(),before,`${name} must leave no partial objects or grants`)
      await db.migrate(candidate => candidate === name)
    }
  } finally { await db.stop() }
})

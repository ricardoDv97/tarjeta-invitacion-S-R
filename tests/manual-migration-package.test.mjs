import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { startPostgres } from './helpers/postgres.mjs'

const root = new URL('../', import.meta.url)
const pack = new URL('docs/14-APLICACION-CONTROLADA/', root)
const read = name => readFile(new URL(name, pack), 'utf8')

test('manual package preserves frozen SQL and data, records history atomically, and passes read-only postflights', async () => {
  const manifest = JSON.parse(await read('SHA256.json'))
  const db = await startPostgres()
  const snapshot = () => db.query(`select jsonb_build_object(
    'registrations',(select jsonb_agg(to_jsonb(r)-'management_token_hash' order by id) from public.registrations r),
    'guests',(select jsonb_agg(to_jsonb(g) order by id) from public.guests g),
    'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.payments p))`)
  try {
    await db.migrate(name => name < '20260929')
    await db.query(`create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
      insert into supabase_migrations.schema_migrations(version) values('20260903000000');
      grant all on public.weddings,public.registrations,public.guests,public.payments to anon,authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      insert into public.weddings(id,slug,couple_name,payment_enabled) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ricardo-sabrina-2026','Synthetic',true);
      insert into public.registrations(id,wedding_id,guest_count,adult_count,payment_method,total_amount)
      values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,1,'mercadopago',100);
      insert into public.registrations(wedding_id,guest_count,adult_count,payment_method,total_amount)
      select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,1,'cash',100 from generate_series(1,11);
      insert into public.payments(registration_id,provider,provider_payment_id,provider_preference_id,external_reference,amount)
      values('11111111-1111-4111-8111-111111111111','mercadopago','9001','synthetic-preference','11111111-1111-4111-8111-111111111111',100);`)
    const before = await snapshot()
    await db.query(await read('00-BASELINE-READ-ONLY.sql'))
    for (let i=0; i<manifest.length; i++) {
      const {name,sha256} = manifest[i]
      const source = await readFile(new URL(`supabase/migrations/${name}`,root))
      assert.equal(createHash('sha256').update(source).digest('hex'),sha256)
      const version = name.slice(0,14)
      const sql = await read(`${i+1}0-APPLY-${version}.sql`)
      const embedded = sql.split('-- BEGIN EXACT APPROVED SOURCE\n')[1].split('\n-- END EXACT APPROVED SOURCE')[0]
      assert.deepEqual(Buffer.from(embedded),source)
      if (i===0) {
        // A bookkeeping failure after DDL must undo DDL too, not just history.
        await db.query(`alter table supabase_migrations.schema_migrations add constraint synthetic_history_failure check(version<>'${version}');`)
        await assert.rejects(db.query(sql),/synthetic_history_failure/)
        assert.equal(await db.query("select count(*) from information_schema.columns where table_schema='public' and table_name='registrations' and column_name='management_token_hash'"),'0')
        assert.equal(await db.query(`select count(*) from supabase_migrations.schema_migrations where version='${version}'`),'0')
        await db.query('alter table supabase_migrations.schema_migrations drop constraint synthetic_history_failure;')
      }
      await db.query(sql)
      assert.equal(await snapshot(),before)
      assert.equal(await db.query('select max(version) from supabase_migrations.schema_migrations'),version)
      // Hex avoids psql/Windows converting printed LF to CRLF; compare stored bytes.
      assert.equal(await db.query(`select encode(convert_to(statements[1],'UTF8'),'hex') from supabase_migrations.schema_migrations where version='${version}'`),source.toString('hex'))
      await db.query(await read(`${i+1}1-POSTFLIGHT-READ-ONLY.sql`))
      await db.query(await read('40-INTEGRITY-READ-ONLY.sql'))
    }
    assert.equal(await db.query('select count(*) from public.registrations where management_token_hash is null'),'12')
    assert.equal(await db.query('select count(*) from public.mercadopago_payment_attempts'),'1')
    const grants = (await read('31-POSTFLIGHT-READ-ONLY.sql')).replace(/--[^\r\n]*/g,'').split(';')[1]
    const rows = await db.query(grants)
    assert.ok(rows.split(/\r?\n/).every(row=>row.endsWith('|t')))
    for (const file of ['00-BASELINE-READ-ONLY.sql','11-POSTFLIGHT-READ-ONLY.sql','21-POSTFLIGHT-READ-ONLY.sql','31-POSTFLIGHT-READ-ONLY.sql','40-INTEGRITY-READ-ONLY.sql']) {
      const statements = (await read(file)).replace(/--[^\r\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean)
      assert.ok(statements.every(s=>/^select\s/i.test(s)),`${file} must contain SELECT only`)
    }
    // A retry cannot double-apply or silently repair an unexpected history.
    await assert.rejects(db.query(await read('10-APPLY-20260929000000.sql')),/Unexpected migration history/)
    assert.equal(await snapshot(),before)
  } finally { await db.stop() }
})

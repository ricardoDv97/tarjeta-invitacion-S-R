import { before, after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { startPostgres } from './helpers/postgres.mjs'
import { loadModule } from './helpers/modules.mjs'

let db
const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
before(async () => { db = await startPostgres(); await db.migrate() })
after(async () => { await db?.stop() })
beforeEach(async () => {
  await db.query(`truncate public.weddings cascade;
    insert into public.weddings(id,slug,couple_name) values('${a}','ricardo-sabrina-2026','Synthetic');
    insert into public.registrations(id,wedding_id,guest_count,adult_count,payment_method,total_amount)
    values('${a}','${a}',2,2,'mercadopago',100),('${b}','${a}',2,2,'mercadopago',100);
    update public.registrations set management_token_hash=repeat('a',64);`)
})
const group = name => JSON.stringify([{first_name:name,last_name:'One',age_category:'adult'},{first_name:'Second',last_name:'Two',age_category:'adult'}])
const save = name => db.query(`set role service_role; select outcome from public.save_registration_guests('${a}','${group(name)}',repeat('a',64))`)

test('service_role unnecessary inherited grants are revoked', async () => {
  for (const privilege of ['DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
    for (const table of ['weddings','registrations','guests','payments','admin_users','mercadopago_payment_attempts'])
      assert.equal(await db.query(`select has_table_privilege('service_role','public.${table}','${privilege}')`), 'f')
  }
})

test('public guest endpoint rejects known UUID without token', async () => {
  const endpoint = await loadModule('src/pages/api/registrations/[id]/guests.js', { imports: {
    '../../../../lib/supabaseServer.js': { getSupabaseServerClient: () => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({data: JSON.parse(await db.query(`select row_to_json(r) from public.registrations r where id='${a}'`))}) }) }) }),
      rpc: async () => ({data:[{outcome:await save('Unowned'),result_payment_method:'mercadopago'}]}),
    }) },
  } })
  const response = await endpoint.POST({params:{id:a}, request:new Request('https://synthetic.invalid/guests',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guests:JSON.parse(group('Unowned')).map(g=>({firstName:g.first_name,lastName:g.last_name,category:g.age_category}))}),
  })})
  assert.equal(response.status,403)
  assert.equal(await db.query('select count(*) from public.guests'), '0')
})

test('service_role table privileges exactly match runtime operations', async () => {
  const rows = JSON.parse(await db.query(`select json_agg(x order by x.table_name,x.privilege) from (
    select t.table_name,p.privilege,has_table_privilege('service_role','public.'||t.table_name,p.privilege) as allowed
    from (values ('weddings'),('registrations'),('guests'),('payments'),('admin_users'),('mercadopago_payment_attempts')) t(table_name)
    cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)) x`))
  for (const row of rows) {
    const expected = row.privilege === 'SELECT' ||
      (row.privilege === 'INSERT' && !['weddings','admin_users'].includes(row.table_name)) ||
      (row.privilege === 'UPDATE' && ['registrations','payments','mercadopago_payment_attempts'].includes(row.table_name))
    assert.equal(row.allowed,expected,`${row.table_name}: ${row.privilege}`)
  }
})

test('cash preparation and admin approval work with reduced service privileges', async () => {
  await db.query(`update public.registrations set payment_method='cash';
    insert into public.guests(registration_id,first_name,last_name,age_category)
    values('${a}','First','One','adult'),('${a}','Second','Two','adult');`)
  assert.equal(await db.query(`set role service_role; select outcome from public.confirm_cash_payment('${a}')`), 'ok')
  assert.equal(await db.query(`set role service_role; select outcome from public.approve_cash_payment('${a}')`), 'approved')
})

test('different concurrent guest groups do not interleave or delete the winner', async () => {
  const results = await Promise.all([save('Alpha'),save('Beta')])
  assert.deepEqual(results.sort(), ['guests_conflict','saved'])
  assert.equal(await db.query('select count(*) from public.guests'), '2')
})

test('failure inside guest insertion rolls back all inserted rows', async () => {
  await db.query(`create function public.audit_reject_guest() returns trigger language plpgsql as $$
    begin if new.first_name='Second' then raise exception 'synthetic insertion failure'; end if; return new; end $$;
    create trigger audit_reject_guest before insert on public.guests for each row execute function public.audit_reject_guest();`)
  try {
    await assert.rejects(save('First'), /synthetic insertion failure/)
    assert.equal(await db.query('select count(*) from public.guests'), '0')
  } finally { await db.query('drop trigger audit_reject_guest on public.guests; drop function public.audit_reject_guest();') }
})

test('provider ID already owned by another existing registration cannot approve the second', async () => {
  await db.query(`insert into public.payments(registration_id,provider,provider_preference_id,external_reference,amount)
    values('${a}','mercadopago','pref-a','${a}',100),('${b}','mercadopago','pref-b','${b}',100);`)
  const apply = id => db.query(`set role service_role; select outcome from public.apply_mercadopago_payment_result('${id}','98765','${id === a ? 'pref-a' : 'pref-b'}',100,'ARS','approved','2026-09-29T12:00:00Z')`)
  assert.equal(await apply(a),'applied')
  assert.equal(await apply(b),'correlation_mismatch')
  assert.equal(await db.query(`select payment_status from public.registrations where id='${b}'`),'pending')
  assert.equal(await db.query('select count(*) from public.mercadopago_payment_attempts'),'1')
})

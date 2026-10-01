import { before, after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { startPostgres, literal } from './helpers/postgres.mjs'
import { loadModule } from './helpers/modules.mjs'
import { hashManagementToken, managementCookieName } from '../src/lib/registrationManagement.js'

let db
const id = '11111111-1111-4111-8111-111111111111'
const token = 'a'.repeat(64)
const tokenHash = hashManagementToken(token)
const guests = [{ firstName: 'Same', lastName: 'Name', category: 'adult' }]
before(async () => { db = await startPostgres(); await db.migrate() })
after(async () => { await db?.stop() })
beforeEach(async () => {
  await db.query(`truncate public.weddings cascade;
    insert into public.weddings(id,slug,couple_name,price_per_guest,child_price,payment_enabled) values('${id}','ricardo-sabrina-2026','Test',100,50,true);
    insert into public.registrations(id,wedding_id,guest_count,adult_count,child_count,young_child_count,payment_method,total_amount)
    values('${id}','${id}',1,1,0,0,'mercadopago',100);
    update public.registrations set management_token_hash='${tokenHash}';`)
})
const jsonQuery = async sql => JSON.parse(await db.query(sql))
async function paymentSeed() {
  await db.query(`insert into public.guests(registration_id,first_name,last_name,age_category) values('${id}','Test','Guest','adult');
    select * from public.prepare_mercadopago_checkout('${id}');
    update public.payments set provider_preference_id='local-preference' where registration_id='${id}';`)
}
async function apply(status, externalId = '1001', changes = {}) {
  const p = { registration: id, preference: 'local-preference', amount: '100', currency: 'ARS', paidAt: status === 'approved' ? '2026-09-29T12:00:00Z' : null, ...changes }
  return jsonQuery(`set role service_role; select row_to_json(r) from public.apply_mercadopago_payment_result(${literal(p.registration)},${literal(externalId)},${literal(p.preference)},${literal(p.amount)}::numeric,${literal(p.currency)},${literal(status)},${literal(p.paidAt)}::timestamptz) r;`)
}
async function state() {
  return jsonQuery(`select json_build_object('payments',(select count(*) from public.payments),'approved',(select count(*) from public.payments where status='approved'),'status',r.payment_status,'attendance',r.attendance_status,'paidAt',p.paid_at,'externalId',p.provider_payment_id) from public.registrations r join public.payments p on p.registration_id=r.id where r.id='${id}';`)
}

async function save(group = [{ first_name: 'Same', last_name: 'Name', age_category: 'adult' }]) {
  return jsonQuery(`set role service_role; select row_to_json(r) from public.save_registration_guests('${id}',${literal(JSON.stringify(group))}::jsonb,'${tokenHash}') r`)
}

// Adapter uses real, separate psql connections. The barrier deterministically
// reproduces the old read-before-insert race; the new RPC needs no barrier.
async function guestEndpoint() {
  let reads = 0, release
  const barrier = new Promise(resolve => { release = resolve })
  const supabase = {
    from(table) {
      if (table === 'registrations') {
        const filters = []
        const query = { eq: (key, value) => { filters.push(`${key}=${literal(value)}`); return query },
          maybeSingle: async () => ({ data: JSON.parse((await db.query(`select row_to_json(r) from public.registrations r where ${filters.join(' and ')}`)) || 'null'), error: null }) }
        return { select: () => query }
      }
      return {
        select: () => ({ eq: async () => {
          const data = await jsonQuery(`select coalesce(json_agg(g),'[]'::json) from public.guests g where registration_id='${id}'`)
          reads++; if (reads === 2) release(); await barrier
          return { data, error: null }
        } }),
        insert: async rows => {
          await db.query(`insert into public.guests(registration_id,first_name,last_name,age_category) values ${rows.map(g => `(${literal(g.registration_id)},${literal(g.first_name)},${literal(g.last_name)},${literal(g.age_category)})`).join(',')}`)
          return { error: null }
        },
      }
    },
    async rpc(name, args) {
      assert.equal(name, 'save_registration_guests')
      return { data: [await jsonQuery(`begin; set role service_role; select row_to_json(r) from public.save_registration_guests(${literal(args.target_registration_id)},${literal(JSON.stringify(args.target_guests))}::jsonb,${literal(args.target_token_hash)}) r; select pg_sleep(0.15); commit;`)], error: null }
    },
  }
  return loadModule('src/pages/api/registrations/[id]/guests.js', { imports: { '../../../../lib/supabaseServer.js': { getSupabaseServerClient: () => supabase } } })
}
const request = (value = token, registrationId = id) => new Request('https://local.invalid/guests', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(value === null ? {} : { Cookie: `${managementCookieName(registrationId)}=${value}` }) }, body: JSON.stringify({ guests }) })

test('own registration and valid token can save guests', async () => {
  const endpoint = await guestEndpoint()
  assert.equal((await endpoint.POST({ params: { id }, request: request() })).status, 201)
})
for (const [name, value] of [['invalid', 'b'.repeat(64)], ['missing', null], ['tampered', token.slice(0, 63) + 'c'], ['malformed', '../token']]) {
  test(`guest endpoint rejects ${name} token without writes`, async () => {
    const endpoint = await guestEndpoint()
    assert.equal((await endpoint.POST({ params: { id }, request: request(value) })).status, 403)
    assert.equal(await db.query('select count(*) from public.guests'), '0')
  })
}
test('own token cannot authorize another known registration UUID', async () => {
  const other = '22222222-2222-4222-8222-222222222222'
  await db.query(`insert into public.registrations(id,wedding_id,guest_count,adult_count,payment_method,total_amount,management_token_hash)
    values('${other}','${id}',1,1,'cash',100,'${hashManagementToken('b'.repeat(64))}');`)
  const endpoint = await guestEndpoint()
  assert.equal((await endpoint.POST({ params: { id: other }, request: request(token, other) })).status, 403)
  assert.equal(await db.query('select count(*) from public.guests'), '0')
})
test('valid token for another wedding is rejected by RPC', async () => {
  await db.query(`update public.weddings set slug='another-wedding'`)
  const endpoint = await guestEndpoint()
  assert.equal((await endpoint.POST({ params: { id }, request: request() })).status, 403)
  assert.equal(await db.query('select count(*) from public.guests'), '0')
})
test('legacy registration cannot be claimed without an issued token', async () => {
  await db.query('update public.registrations set management_token_hash=null')
  assert.equal((await save()).outcome, 'unauthorized')
})
test('RPC rejects NULL and incorrect hashes independently of endpoint', async () => {
  for (const hash of ['null', "'" + 'b'.repeat(64) + "'"]) {
    assert.equal(await db.query(`set role service_role; select outcome from public.save_registration_guests('${id}','[]',${hash})`), 'unauthorized')
  }
})

test('equivalent concurrent guest requests store exactly one complete group', async () => {
  const endpoint = await guestEndpoint()
  const responses = await Promise.all([1, 2].map(() => endpoint.POST({ params: { id }, request: request() })))
  assert.ok(responses.every(r => [200, 201].includes(r.status)))
  assert.equal(Number(await db.query(`select count(*) from public.guests where registration_id='${id}'`)), 1)
})
test('pending then approved updates registration and one accounting payment', async () => {
  await paymentSeed()
  assert.equal((await apply('pending')).outcome, 'applied')
  assert.equal((await apply('approved')).outcome, 'applied')
  assert.deepEqual(await state(), { payments: 1, approved: 1, status: 'approved', attendance: 'confirmed', paidAt: '2026-09-29T12:00:00+00:00', externalId: '1001' })
})
test('rejected first attempt followed by a second approved attempt is accepted', async () => {
  await paymentSeed()
  await apply('rejected', '1001')
  assert.equal((await apply('approved', '1002')).outcome, 'applied')
  assert.equal((await state()).externalId, '1002')
  assert.equal((await state()).approved, 1)
})
test('repeated approved notification is idempotent', async () => {
  await paymentSeed(); await apply('approved')
  const first = await state()
  assert.equal((await apply('approved')).outcome, 'already_applied')
  assert.deepEqual(await state(), first)
})
test('old rejected attempt cannot regress an approved payment', async () => {
  await paymentSeed(); await apply('rejected', '1001'); await apply('approved', '1002')
  await apply('rejected', '1001')
  assert.equal((await state()).status, 'approved')
  assert.equal((await state()).externalId, '1002')
})

test('single guest save and retry are idempotent', async () => {
  assert.equal((await save()).outcome, 'saved')
  assert.equal((await save()).outcome, 'already_saved')
  assert.equal(Number(await db.query('select count(*) from public.guests')), 1)
})
test('different guest list cannot replace an already saved group', async () => {
  await save()
  assert.equal((await save([{ first_name: 'Other', last_name: 'Person', age_category: 'adult' }])).outcome, 'guests_conflict')
  assert.equal(await db.query('select first_name from public.guests'), 'Same')
})
test('two different people may share exactly the same name', async () => {
  await db.query(`update public.registrations set guest_count=2,adult_count=2 where id='${id}'`)
  const person = { first_name: 'Same', last_name: 'Name', age_category: 'adult' }
  assert.equal((await save([person, person])).outcome, 'saved')
  assert.equal((await save([person, person])).outcome, 'already_saved')
  assert.equal(Number(await db.query('select count(*) from public.guests')), 2)
})
test('reordered guest list remains idempotent', async () => {
  await db.query(`update public.registrations set guest_count=2,adult_count=2 where id='${id}'`)
  const group = [{ first_name: 'A', last_name: 'One', age_category: 'adult' }, { first_name: 'B', last_name: 'Two', age_category: 'adult' }]
  assert.equal((await save(group)).outcome, 'saved')
  assert.equal((await save(group.toReversed())).outcome, 'already_saved')
})
for (const [name, group] of Object.entries({ null: null, object: {}, count: [], empty: [{ first_name: ' ',last_name:'Name',age_category:'adult' }], category: [{first_name:'A',last_name:'B',age_category:'child'}], extra: [{first_name:'A',last_name:'B',age_category:'adult',registration_id:id}], missing: [{first_name:'A',age_category:'adult'}], primitive: [1] })) {
  test(`atomic save rejects invalid ${name} without rows`, async () => {
    assert.equal((await save(group)).outcome, 'invalid_guests')
    assert.equal(Number(await db.query('select count(*) from public.guests')), 0)
  })
}
test('a completed registration cannot acquire guests', async () => {
  await db.query(`update public.registrations set attendance_status='confirmed' where id='${id}'`)
  assert.equal((await save()).outcome, 'invalid_status')
  assert.equal(Number(await db.query('select count(*) from public.guests')), 0)
})
test('failed transaction rolls back the entire guest group', async () => {
  await assert.rejects(db.query(`begin; select * from public.save_registration_guests('${id}','[{"first_name":"A","last_name":"B","age_category":"adult"}]','${tokenHash}'); select 1/0; commit;`), /division by zero/)
  assert.equal(Number(await db.query('select count(*) from public.guests')), 0)
})
test('checkout reuses preference after rejected or cancelled attempt', async () => {
  await paymentSeed()
  for (const status of ['rejected', 'cancelled']) {
    await apply(status)
    const result = await jsonQuery(`select row_to_json(r) from public.prepare_mercadopago_checkout('${id}') r`)
    assert.equal(result.outcome, 'ready')
    assert.equal(result.result_preference_id, 'local-preference')
    assert.equal((await state()).status, status)
    assert.equal((await state()).payments, 1)
  }
})
test('cancelled then second approved succeeds and retains both attempts', async () => {
  await paymentSeed(); await apply('cancelled', '1001'); await apply('approved', '1002')
  assert.equal((await state()).status, 'approved')
  assert.equal(await db.query('select count(*) from public.mercadopago_payment_attempts'), '2')
})
test('concurrent approved attempts count once and flag the additional charge for review', async () => {
  await paymentSeed()
  const results = await Promise.all([apply('approved','1001'), apply('approved','1002')])
  assert.deepEqual(results.map(r=>r.outcome).sort(), ['additional_approved','applied'])
  assert.equal((await state()).approved, 1)
  assert.equal(await db.query('select sum(amount) from public.payments'), '100.00')
  assert.equal(await db.query('select count(*) from public.mercadopago_payment_attempts where requires_review'), '1')
})
test('concurrent duplicate approved webhooks retain one attempt', async () => {
  await paymentSeed(); await Promise.all([apply('approved'), apply('approved')])
  assert.equal(await db.query('select count(*) from public.mercadopago_payment_attempts'), '1')
  assert.equal((await state()).approved, 1)
})
test('rejected after approval for the same ID does not change paid_at', async () => {
  await paymentSeed(); await apply('approved'); const first = await state()
  await apply('rejected'); assert.deepEqual(await state(), first)
  assert.equal(await db.query('select status from public.mercadopago_payment_attempts'), 'approved')
})
test('missing preference or approval time cannot approve', async () => {
  await paymentSeed()
  for (const changes of [{ preference: null }, { paidAt: null }]) {
    assert.equal((await apply('approved', '1001', changes)).outcome, 'invalid_input')
    assert.equal((await state()).approved, 0)
  }
})
test('old rejected notification cannot replace another pending attempt', async () => {
  await paymentSeed(); await apply('rejected','1001'); await apply('pending','1002'); await apply('rejected','1001')
  assert.equal((await state()).status, 'pending')
  assert.equal((await state()).externalId, '1002')
})
test('zero-cost checkout remains idempotent without external attempts', async () => {
  await db.query(`update public.registrations set total_amount=0,adult_count=0,young_child_count=1 where id='${id}';
    insert into public.guests(registration_id,first_name,last_name,age_category) values('${id}','A','B','young_child');`)
  for (let i=0;i<2;i++) assert.equal((await jsonQuery(`select row_to_json(r) from public.prepare_mercadopago_checkout('${id}') r`)).outcome, 'free')
  assert.equal((await state()).approved, 1)
  assert.equal(await db.query('select count(*) from public.mercadopago_payment_attempts'), '0')
})
test('new functions and attempt ledger are private to service_role', async () => {
  for (const role of ['anon','authenticated']) {
    assert.equal(await db.query(`select has_function_privilege('${role}','public.save_registration_guests(uuid,jsonb,text)','execute')`), 'f')
    assert.equal(await db.query(`select has_function_privilege('${role}','public.apply_mercadopago_payment_result(uuid,text,text,numeric,text,text,timestamptz)','execute')`), 'f')
    assert.equal(await db.query(`select has_table_privilege('${role}','public.mercadopago_payment_attempts','select,insert,update,delete')`), 'f')
  }
  assert.equal(await db.query("select relrowsecurity from pg_class where oid='public.mercadopago_payment_attempts'::regclass"), 't')
})
for (const [name, changes] of Object.entries({ amount: { amount: '99' }, currency: { currency: 'USD' }, preference: { preference: 'wrong' }, registration: { registration: '22222222-2222-4222-8222-222222222222' } })) {
  test(`wrong ${name} cannot approve`, async () => {
    await paymentSeed(); await apply('approved', '1001', changes)
    assert.equal((await state()).approved, 0)
  })
}

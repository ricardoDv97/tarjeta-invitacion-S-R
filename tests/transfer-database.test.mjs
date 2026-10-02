import { before,after,beforeEach,test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { startPostgres,literal } from './helpers/postgres.mjs'
let db
const id='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64)
before(async()=>{db=await startPostgres();await db.migrate()})
after(async()=>await db?.stop())
beforeEach(async()=>{await db.query(`truncate public.weddings cascade;
insert into public.weddings(id,slug,couple_name,price_per_guest,child_price,payment_enabled) values('${id}','ricardo-sabrina-2026','Synthetic',35000,10000,true);
insert into public.registrations(id,wedding_id,guest_count,adult_count,child_count,young_child_count,payment_method,total_amount,management_token_hash) values('${id}','${id}',1,1,0,0,'transfer',35000,'${hash}');
insert into public.guests(registration_id,first_name,last_name,age_category) values('${id}','QA','Transfer','adult');`)} )
const rpc=(name,args=`'${id}','${hash}'`)=>db.query(`set role service_role; select outcome from public.${name}(${args})`)
const state=()=>db.query(`select json_build_object('reported',r.payment_reported_at,'payment',r.payment_status,'attendance',r.attendance_status,'paidAt',p.paid_at,'amount',p.amount,'provider',p.provider,'rows',(select count(*) from public.payments)) from public.registrations r left join public.payments p on p.registration_id=r.id where r.id='${id}'`).then(JSON.parse)
test('prepare creates one pending transfer, no report or approval',async()=>{
 assert.equal(await rpc('prepare_transfer_payment'),'ready');assert.equal(await rpc('prepare_transfer_payment'),'ready')
 const s=await state();assert.equal(s.rows,1);assert.equal(s.payment,'pending');assert.equal(s.attendance,'pending');assert.equal(s.reported,null);assert.equal(s.paidAt,null);assert.equal(s.amount,35000);assert.equal(s.provider,'transfer')
})
test('yes is an idempotent declaration, never approval',async()=>{
 await rpc('prepare_transfer_payment')
 assert.equal(await rpc('report_transfer_payment'),'reported');const initial=await state()
 assert.equal(await rpc('report_transfer_payment'),'already_reported');assert.deepEqual(await state(),initial)
 assert.ok(initial.reported);assert.equal(initial.payment,'pending');assert.equal(initial.attendance,'pending');assert.equal(initial.paidAt,null)
})
test('concurrent declarations cannot duplicate payments or overwrite first timestamp',async()=>{
 await rpc('prepare_transfer_payment')
 const outcomes=await Promise.all([rpc('report_transfer_payment'),rpc('report_transfer_payment')]);assert.deepEqual(outcomes.sort(),['already_reported','reported']);assert.equal((await state()).rows,1)
})
test('admin approval alone atomically confirms payment and attendance, preserves declaration',async()=>{
 await rpc('prepare_transfer_payment')
 await rpc('report_transfer_payment');const reported=(await state()).reported
 assert.equal(await rpc('approve_transfer_payment',`'${id}'`),'approved');const first=await state()
 assert.equal(first.payment,'approved');assert.equal(first.attendance,'confirmed');assert.ok(first.paidAt);assert.equal(first.reported,reported)
 assert.equal(await rpc('approve_transfer_payment',`'${id}'`),'already_applied');assert.deepEqual(await state(),first)
 assert.equal(await rpc('report_transfer_payment'),'already_approved');assert.deepEqual(await state(),first)
})
test('admin can verify received transfer even if guest chose no',async()=>{await rpc('prepare_transfer_payment');assert.equal(await rpc('approve_transfer_payment',`'${id}'`),'approved');assert.equal((await state()).reported,null)})
test('concurrent approvals produce one approval and one idempotent retry',async()=>{await rpc('prepare_transfer_payment');assert.deepEqual((await Promise.all([rpc('approve_transfer_payment',`'${id}'`),rpc('approve_transfer_payment',`'${id}'`)])).sort(),['already_applied','approved']);assert.equal((await state()).rows,1)})
for(const bad of [null,'b'.repeat(64)])test('report rejects missing/foreign token hash '+String(bad),async()=>{assert.equal(await rpc('report_transfer_payment',`'${id}',${literal(bad)}`),'unauthorized');assert.equal((await state()).rows,0)})
test('legacy NULL token fails closed',async()=>{await db.query(`update public.registrations set management_token_hash=null`);assert.equal(await rpc('report_transfer_payment'),'unauthorized')})
for(const change of ["update public.weddings set is_active=false","update public.weddings set slug='another-wedding'"])test('report rejects unavailable wedding '+change,async()=>{await db.query(change);assert.equal(await rpc('report_transfer_payment'),'unauthorized');assert.equal((await state()).rows,0)})
test('disabled payments cannot be prepared or declared',async()=>{await db.query('update public.weddings set payment_enabled=false');assert.equal(await rpc('report_transfer_payment'),'payment_disabled');assert.equal((await state()).rows,0)})
test('incomplete guests cannot prepare or declare',async()=>{await db.query('delete from public.guests');assert.equal(await rpc('report_transfer_payment'),'incomplete_guests');assert.equal((await state()).rows,0)})
test('cancelled registration cannot report',async()=>{await db.query("update public.registrations set attendance_status='cancelled'");assert.equal(await rpc('report_transfer_payment'),'invalid_status')})
test('foreign provider row blocks transfer preparation without mutation',async()=>{await db.query(`insert into public.payments(registration_id,provider,amount) values('${id}','cash',35000)`);assert.equal(await rpc('report_transfer_payment'),'inconsistent_payment');assert.equal((await state()).reported,null)})
test('inconsistent transfer amount blocks admin and guest',async()=>{await rpc('prepare_transfer_payment');await db.query('update public.payments set amount=1');assert.equal(await rpc('report_transfer_payment'),'inconsistent_payment');assert.equal(await rpc('approve_transfer_payment',`'${id}'`),'inconsistent_payment');assert.equal((await state()).payment,'pending')})
test('unique index rejects duplicate transfer rows',async()=>{await rpc('prepare_transfer_payment');await assert.rejects(db.query(`insert into public.payments(registration_id,provider,amount) values('${id}','transfer',35000)`),/duplicate key/)})
test('zero amount transfer still requires admin verification',async()=>{await db.query('update public.registrations set total_amount=0');await rpc('prepare_transfer_payment');assert.equal(await rpc('report_transfer_payment'),'reported');assert.equal((await state()).payment,'pending');assert.equal(await rpc('approve_transfer_payment',`'${id}'`),'approved')})
test('new RPC grants are service_role only, security invoker, empty search path',async()=>{
 for(const signature of ['prepare_transfer_payment(uuid,text)','report_transfer_payment(uuid,text)','approve_transfer_payment(uuid)']){
  for(const role of ['anon','authenticated'])assert.equal(await db.query(`select has_function_privilege('${role}','public.${signature}','EXECUTE')`),'f')
  assert.equal(await db.query(`select has_function_privilege('service_role','public.${signature}','EXECUTE')`),'t')
  assert.equal(await db.query(`select prosecdef from pg_proc where oid='public.${signature}'::regprocedure`),'f')
  assert.match(await db.query(`select proconfig from pg_proc where oid='public.${signature}'::regprocedure`),/search_path/)
 }
 await assert.rejects(db.query(`set role authenticated; select * from public.approve_transfer_payment('${id}')`),/permission denied/)
})
test('migration can be reapplied without changing cash/MP history or management hash',async()=>{
 await db.query(`insert into public.registrations(wedding_id,guest_count,adult_count,payment_method,total_amount) values('${id}',1,1,'cash',35000),('${id}',1,1,'mercadopago',35000)`)
 const snapshot=()=>db.query(`select jsonb_build_object('r',(select jsonb_agg(to_jsonb(r) order by id) from public.registrations r),'p',(select jsonb_agg(to_jsonb(p) order by id) from public.payments p),'g',(select jsonb_agg(to_jsonb(g) order by id) from public.guests g))`)
 const initial=await snapshot();const sql=await readFile(new URL('../supabase/migrations/20261002000000_transfer_payment.sql',import.meta.url),'utf8');await db.query(sql);assert.equal(await snapshot(),initial)
 assert.equal(await db.query(`select count(*) from public.registrations where payment_method='mercadopago'`),'1')
 assert.equal(await db.query(`select count(*) from public.registrations where payment_method='cash'`),'1')
 assert.equal(await db.query(`select management_token_hash from public.registrations where id='${id}'`),hash)
})

test('report cannot create an accounting row and has no data side effects without preparation',async()=>{const initial=await state();assert.equal(await rpc('report_transfer_payment'),'payment_not_found');assert.deepEqual(await state(),initial)})
test('report only changes declaration and existing updated_at trigger, never accounting',async()=>{await rpc('prepare_transfer_payment');const payments=await db.query('select jsonb_agg(to_jsonb(p)) from public.payments p');const initial=JSON.parse(await db.query('select to_jsonb(r) from public.registrations r'));await rpc('report_transfer_payment');const next=JSON.parse(await db.query('select to_jsonb(r) from public.registrations r'));assert.ok(next.payment_reported_at);delete initial.payment_reported_at;delete next.payment_reported_at;delete initial.updated_at;delete next.updated_at;assert.deepEqual(next,initial);assert.equal(await db.query('select jsonb_agg(to_jsonb(p)) from public.payments p'),payments)})

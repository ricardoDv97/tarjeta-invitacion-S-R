import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { loadModule } from './helpers/modules.mjs'

const reference = '11111111-1111-4111-8111-111111111111'
const secret = 'synthetic-webhook-secret'
async function fixture({ environment = 'production', liveMode = true, overrides = {}, order, rpcError = null } = {}) {
  let calls = 0, reads = 0, orderReads = 0, args
  const payment = { id: 1001, external_reference: reference, preference_id: 'local-preference', transaction_amount: 100, currency_id: 'ARS', status: 'approved', date_approved: '2026-09-29T12:00:00Z', live_mode: liveMode, ...overrides }
  const endpoint = await loadModule('src/pages/api/webhooks/mercadopago.js', { env: { MERCADOPAGO_WEBHOOK_SECRET: secret }, imports: {
    '../../../lib/mercadopago.js': {
      getMercadoPagoEnvironment: () => environment,
      getMercadoPagoPaymentClient: () => ({ get: async () => { reads++; return payment } }),
      getMercadoPagoMerchantOrderClient: () => ({ get: async () => { orderReads++; if (order instanceof Error) throw order; return order } }),
    },
    '../../../lib/supabaseServer.js': { getSupabaseServerClient: () => ({ rpc: async (name, value) => { calls++; args = value; return { data: [{ outcome: 'applied' }], error: rpcError } } }) },
  } })
  const send = async ({ signature = true, dataId = '1001', queryType = 'payment' } = {}) => {
    const ts = String(Date.now()), requestId = 'synthetic-request'
    const digest = createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex')
    const headers = signature ? { 'x-signature': signature === 'invalid' ? 'ts=1,v1=bad' : `ts=${ts},v1=${digest}`, 'x-request-id': requestId } : {}
    return endpoint.POST({ request: new Request(`https://audit.invalid/webhook?type=${queryType}&data.id=${dataId}`, { method: 'POST', headers }) })
  }
  return { send, metrics: () => ({ calls, reads, orderReads, args }) }
}

for (const [name, env, mode, expected] of [['production rejects sandbox', 'production', false, 0], ['production accepts live', 'production', true, 1], ['test accepts sandbox', 'test', false, 1], ['test rejects live', 'test', true, 0], ['production rejects missing live_mode', 'production', null, 0]]) {
  test(name, async () => {
    const f = await fixture({ environment: env, liveMode: mode })
    await f.send()
    assert.equal(f.metrics().calls, expected)
  })
}
for (const signature of [false, 'invalid']) test(`signature ${signature} rejected before provider calls`, async () => {
  const f = await fixture()
  assert.equal((await f.send({ signature })).status, 401)
  assert.equal(f.metrics().reads, 0)
  assert.equal(f.metrics().calls, 0)
})
test('mismatched remote ID cannot apply', async () => {
  const f = await fixture({ overrides: { id: 1002 } }); await f.send(); assert.equal(f.metrics().calls, 0)
})
test('RPC failure is retriable without leaking provider details', async () => {
  const f = await fixture({ rpcError: { message: 'private details' } })
  const r = await f.send(); assert.equal(r.status, 500); assert.ok(!(await r.text()).includes('private details'))
})
for (const status of ['pending', 'approved', 'rejected', 'cancelled']) test(`validated ${status} reaches RPC with correct timestamps`, async () => {
  const f = await fixture({ overrides: { status } }); await f.send()
  assert.equal(f.metrics().args.target_status, status)
  assert.equal(f.metrics().args.target_paid_at, status === 'approved' ? '2026-09-29T12:00:00.000Z' : null)
})

test('missing preference is resolved using the authenticated merchant order', async () => {
  const f = await fixture({ overrides: { preference_id: undefined, order: { id: 2001, type: 'merchant_order' } }, order: { id:2001, external_reference:reference, preference_id:'local-preference', payments:[{id:1001}] } })
  await f.send()
  assert.equal(f.metrics().orderReads, 1)
  assert.equal(f.metrics().args.target_preference_id, 'local-preference')
})
test('merchant order for another registration cannot apply', async () => {
  const f = await fixture({ overrides: { preference_id: undefined, order: { id:2001,type:'merchant_order' } }, order: { id:2001,external_reference:'22222222-2222-4222-8222-222222222222',preference_id:'local-preference',payments:[{id:1001}] } })
  await f.send(); assert.equal(f.metrics().calls, 0)
})
test('incomplete merchant order is retriable without applying payment', async () => {
  const f = await fixture({ overrides: { preference_id: undefined, order: {id:2001,type:'merchant_order'} }, order: {id:2001,external_reference:reference,preference_id:'local-preference',payments:[]} })
  assert.equal((await f.send()).status,503); assert.equal(f.metrics().calls,0)
})
test('provider order outage is retriable and does not expose its error', async () => {
  const f = await fixture({ overrides: {preference_id:undefined,order:{id:2001,type:'merchant_order'}}, order:new Error('provider private details') })
  const r = await f.send(); assert.equal(r.status,503); assert.ok(!(await r.text()).includes('private details')); assert.equal(f.metrics().calls,0)
})
test('unverifiable preference is never passed to SQL', async () => {
  const f = await fixture({overrides:{preference_id:undefined}}); await f.send(); assert.equal(f.metrics().calls,0)
})
test('an approval without provider paid_at is not fabricated', async () => {
  const f = await fixture({overrides:{date_approved:null}}); await f.send(); assert.equal(f.metrics().calls,0)
})
test('body-supplied data is never needed for authoritative verification', async () => {
  const f = await fixture(); await f.send(); assert.equal(f.metrics().reads,1); assert.equal(f.metrics().calls,1)
})

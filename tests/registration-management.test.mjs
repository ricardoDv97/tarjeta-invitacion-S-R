import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers/modules.mjs'
import { createManagementToken, hashManagementToken, managementCookie, managementTokenHash } from '../src/lib/registrationManagement.js'

const id = '11111111-1111-4111-8111-111111111111'
test('creation stores only hash and issues token once in private cookie', async () => {
  let inserted
  const filters = []
  const weddingQuery = { eq: (key,value) => { filters.push([key,value]); return weddingQuery }, order: () => weddingQuery,
    limit: async () => ({data:[{id,price_per_guest:100,child_price:50}]}) }
  const endpoint = await loadModule('src/pages/api/registrations/index.js', { imports: {
    '../../../lib/supabaseServer.js': { getSupabaseServerClient: () => ({ from: table => table === 'weddings'
      ? { select: () => weddingQuery }
      : { insert: value => { inserted = value; return { select: () => ({ single: async () => ({ data: { id } }) }) } } } }) },
  } })
  const response = await endpoint.POST({ request: new Request('https://local.invalid/api/registrations', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({attendance:'confirmed',adultCount:1,childCount:0,youngChildCount:0,paymentMethod:'cash'}),
  }) })
  assert.equal(response.status,201)
  assert.ok(filters.some(([key,value]) => key === 'slug' && value === 'ricardo-sabrina-2026'))
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie,/HttpOnly; SameSite=Lax; Max-Age=86400; Secure$/)
  assert.match(cookie,/Path=\/;/)
  const token = cookie.split(';')[0].split('=')[1]
  assert.equal(inserted.management_token_hash,hashManagementToken(token))
  assert.ok(!JSON.stringify(inserted).includes(token))
  assert.ok(!(await response.text()).includes(token))
})
test('tokens are random, 256-bit and duplicate cookies fail closed', () => {
  const token = createManagementToken()
  assert.match(token,/^[a-f0-9]{64}$/)
  assert.notEqual(token,createManagementToken())
  const pair = managementCookie(id,token,new Request('https://local.invalid')).split(';')[0]
  assert.equal(managementTokenHash(new Request('https://local.invalid',{headers:{Cookie:pair}}),id),hashManagementToken(token))
  assert.equal(managementTokenHash(new Request('https://local.invalid',{headers:{Cookie:`${pair}; ${pair}`}}),id),null)
})
test('Secure is omitted only for local HTTP development', () => {
  for (const url of ['https://local.invalid','http://production.invalid','https://localhost'])
    assert.match(managementCookie(id,createManagementToken(),new Request(url)),/; Secure$/)
  assert.doesNotMatch(managementCookie(id,createManagementToken(),new Request('http://localhost')),/; Secure/)
})

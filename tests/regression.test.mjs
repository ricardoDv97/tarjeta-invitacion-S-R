import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateRegistrationPayload, validateGuestsPayload, amountInCents, isValidUuid } from '../src/lib/validation.js'
import { loadModule } from './helpers/modules.mjs'

const valid = { attendance:'confirmed',adultCount:2,childCount:1,youngChildCount:1,paymentMethod:'transfer' }
test('valid registration preserves counts', () => assert.equal(validateRegistrationPayload(valid).value.guestCount,4))
for (const [name, changes] of Object.entries({ price:{total_amount:1},status:{payment_status:'approved'},negative:{adultCount:-1},fraction:{adultCount:1.5},overflow:{adultCount:20},zero:{adultCount:0,childCount:0,youngChildCount:0},method:{paymentMethod:'other'},cancelWithCounts:{attendance:'cancelled'} })) {
  test(`registration rejects ${name}`, () => assert.equal(validateRegistrationPayload({...valid,...changes}).ok,false))
}
test('cancellation retains existing rules', () => assert.equal(validateRegistrationPayload({attendance:'cancelled',paymentMethod:null}).ok,true))
const registration = {guest_count:1,adult_count:1,child_count:0,young_child_count:0}
const guest = {firstName:' Test ',lastName:' Guest ',category:'adult'}
test('guest names are trimmed server-side', () => assert.deepEqual(validateGuestsPayload({guests:[guest]},registration).value,[{first_name:'Test',last_name:'Guest',age_category:'adult'}]))
for (const [name, changes] of Object.entries({ category:{category:'child'},extra:{status:'approved'},empty:{firstName:' '},long:{lastName:'x'.repeat(81)} })) {
  test(`guest rejects ${name}`, () => assert.equal(validateGuestsPayload({guests:[{...guest,...changes}]},registration).ok,false))
}
test('guest count mismatch is rejected', () => assert.equal(validateGuestsPayload({guests:[]},registration).ok,false))
test('amount uses integer cents', () => assert.equal(amountInCents('35000.01'),3500001))
for (const value of ['NaN','Infinity','1.001',-1]) test(`invalid monetary amount ${value}`, () => assert.equal(amountInCents(value),null))
test('malformed reference is rejected', () => assert.equal(isValidUuid('invalid'),false))
test('legacy online payment method cannot be selected by new RSVP', () => assert.equal(validateRegistrationPayload({...valid,paymentMethod:'mercadopago'}).ok,false))
for (const authorized of [true,false]) test(`admin middleware handles allowlist=${authorized}`, async () => {
  let signedOut = false
  const module = await loadModule('src/middleware.js',{imports:{
    'astro:middleware':{defineMiddleware:fn=>fn},
    './lib/adminAuth.js':{isAdminUser:async()=>authorized},
    './lib/supabaseAuthServer.js':{createSupabaseAuthServerClient:()=>({auth:{getUser:async()=>({data:{user:{id:'synthetic'}}}),signOut:async()=>{signedOut=true}}})},
  }})
  const context={url:new URL('https://audit.invalid/admin'),request:new Request('https://audit.invalid/admin'),cookies:{},locals:{},redirect:(location,status)=>new Response(null,{status,headers:{Location:location}})}
  const response=await module.onRequest(context,async()=>new Response('private admin'))
  assert.equal(response.status,authorized?200:303)
  assert.equal(response.headers.get('cache-control'),'private, no-store')
  assert.equal(signedOut,!authorized)
})

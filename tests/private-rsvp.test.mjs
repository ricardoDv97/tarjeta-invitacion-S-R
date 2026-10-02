import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers/modules.mjs'
import { hashManagementToken, managementCookieName } from '../src/lib/registrationManagement.js'

const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const token = 'a'.repeat(64)
function backend(changes = {}) {
  const state = { reads:0,rpcs:0,provider:0 }
  const registration = { id, management_token_hash:hashManagementToken(token), guest_count:1,adult_count:1,child_count:0,young_child_count:0,
    payment_method:'transfer',attendance_status:'pending',payment_status:'pending',total_amount:100,
    weddings:{slug:'ricardo-sabrina-2026',is_active:true},payments:[{provider:'mercadopago',amount:0,status:'approved'}],...changes }
  const client = {
    from(table) {
      state.reads++
      const filters = []
      const result = () => {
        if (table === 'registrations') {
          const matches = filters.every(([key,value])=>key.split('.').reduce((obj,k)=>obj?.[k],registration) === value)
          return {data:matches ? registration : null,error:null}
        }
        if (table === 'guests') return {data:[{age_category:'adult'}],error:null}
        if (table === 'payments') return {data:[{amount:100,currency:'ARS',status:'pending',provider_payment_id:null,paid_at:null}],error:null}
        throw new Error(`Unexpected table ${table}`)
      }
      const query = { select: () => query, eq: (key,value) => { filters.push([key,value]); return query },
        maybeSingle: async () => result(), then: resolve => resolve(result()) }
      return query
    },
    rpc: async name => {
      state.rpcs++
      return {data:[name==='confirm_cash_payment'
        ? {outcome:'ok',result_payment_status:'pending',result_attendance_status:'confirmed'}
        : name==='report_transfer_payment' ? {outcome:'reported',result_payment_reported_at:'2026-10-02T12:00:00Z'}
        : {outcome:'ready',result_payment_status:'pending',result_attendance_status:'pending',result_amount:100}],error:null}
    },
  }
  const provider = {
    getMercadoPagoPreferenceClient:()=>({get:async()=>{state.provider++;return {id:'synthetic',external_reference:id,items:[{currency_id:'ARS',quantity:1,unit_price:100}]}}}),
    getPublicSiteUrl:()=> 'https://local.invalid',
    getCheckoutUrl:()=> 'https://www.mercadopago.com.ar/synthetic',
  }
  return {state,client,provider}
}
const routes = [
  ['state','src/pages/api/registrations/[id].js','GET','../../../'],
  ['cash','src/pages/api/registrations/[id]/cash.js','POST','../../../../'],
  ['transfer','src/lib/transferPayment.js','POST','./'],
  ['report','src/lib/transferPayment.js','POST','./'],
]
const scenarios = [
  ['missing token',null,{},id,403],
  ['invalid token','b'.repeat(64),{},id,403],
  ['own token for other registration',token,{id:other,management_token_hash:hashManagementToken('b'.repeat(64))},other,403],
  ['tampered UUID',token,{},'not-a-uuid',400],
  ['unknown UUID',token,{},other,403],
  ['another wedding',token,{weddings:{slug:'foreign',is_active:true}},id,403],
  ['inactive wedding',token,{weddings:{slug:'ricardo-sabrina-2026',is_active:false}},id,403],
  ['legacy NULL',token,{management_token_hash:null},id,403],
]
function request(method, value = token, reference = id, path='/private', extra={}) {
  return new Request(`https://local.invalid${path}`,{method,headers:{...(value===null?{}:{Cookie:`${managementCookieName(reference)}=${value}`}),...extra}})
}
async function endpoint(path,prefix,fixture,report=false) {
  const module = await loadModule(path,{imports:{
    [path.startsWith('src/lib/') ? './supabaseServer.js' : prefix+'lib/supabaseServer.js']:{getSupabaseServerClient:()=>fixture.client},
  }})
  return path.startsWith('src/lib/') ? { POST: context => module.transferOperation(context,report) } : module
}
for (const [name,path,method,prefix] of routes) {
  for (const [scenario,value,changes,reference,status] of scenarios) {
    test(`${name}: rejects ${scenario} before payment writes/provider calls`,async()=>{
      const fixture=backend(changes)
      const module=await endpoint(path,prefix,fixture,name==='report')
      const response=await module[method]({params:{id:reference},request:request(method,value,reference)})
      assert.equal(response.status,status)
      const body=await response.text()
      assert.doesNotMatch(body,/guestCount|total_amount|paymentStatus|checkoutUrl|management_token_hash/)
      assert.equal(fixture.state.rpcs,0)
      assert.equal(fixture.state.provider,0)
      if(value===null || status===400) assert.equal(fixture.state.reads,0)
    })
  }
  test(`${name}: own token and wedding allow private operation`,async()=>{
    const fixture=backend()
    const module=await endpoint(path,prefix,fixture)
    const response=await module[method]({params:{id},request:request(method)})
    assert.equal(response.status,200)
    const body=await response.json()
    assert.equal(body.ok,true)
    assert.ok(!JSON.stringify(body).includes(hashManagementToken(token)))
  })
  if(method==='POST') test(`${name}: cross-origin cookie request cannot initiate payment`,async()=>{
    const fixture=backend()
    const module=await endpoint(path,prefix,fixture)
    assert.equal((await module.POST({params:{id},request:request(method,token,id,'/private',{Origin:'https://foreign.invalid'})})).status,403)
    assert.equal(fixture.state.rpcs,0)
  })
}

// Execute actual Astro frontmatter; templates are compiled separately by build.
async function page(path, fixture) {
  return loadModule(path,{imports:{'../../lib/supabaseServer.js':{getSupabaseServerClient:()=>fixture.client}},transform:source=>{
    let body=source.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]
    body=body.replace(/^import .*\.astro'\r?\n/gm,'')
    const imports=[]
    body=body.replace(/^import .*\r?\n/gm,line=>{imports.push(line);return ''})
    body=body.replace('export const prerender','const prerender')
    return `${imports.join('')}\nexport async function render(Astro) {\n${body}\nreturn {
      available:typeof available==='undefined'?null:available,
      registration:typeof registration==='undefined'?null:registration,
      isFree:typeof isFree==='undefined'?null:isFree,
      retryHref:typeof retryHref==='undefined'?null:retryHref};\n}`
  }})
}
function astroContext(path,value=token) {
  const req=request('GET',value,id,`${path}?registration=${id}&status=approved&payment_id=123&external_reference=${id}`)
  return {request:req,url:new URL(req.url),response:{status:200},redirect:(url,status)=>({redirect:url,status})}
}
for(const [path,url] of [['src/pages/pago/efectivo.astro','/pago/efectivo']]) {
  for(const value of [null,'b'.repeat(64)]) test(`${url}: no private payment details with absent/foreign token ${value===null?'absent':'foreign'}`,async()=>{
    const fixture=backend({total_amount:0,attendance_status:'confirmed',payment_status:'approved'})
    const module=await page(path,fixture)
    const context=astroContext(url,value)
    const result=await module.render(context)
    assert.notEqual(result.isFree,true)
    assert.notEqual(result.available,true)
    assert.equal(result.registration,null)
    assert.equal(fixture.state.rpcs,0)
    if(value===null)assert.equal(fixture.state.reads,0)
  })
}
test('authorized cash page retains private confirmation',async()=>{
  const fixture=backend({payment_method:'cash',attendance_status:'confirmed'})
  const result=await (await page('src/pages/pago/efectivo.astro',fixture)).render(astroContext('/pago/efectivo'))
  assert.equal(result.available,true)
  assert.equal(fixture.state.rpcs,0)
})
for(const value of [null,token]) test(`guest navigation requires management cookie: ${value!==null}`,async()=>{
  const fixture=backend()
  const result=await (await page('src/pages/confirmar/invitados.astro',fixture)).render(astroContext('/confirmar/invitados',value))
  assert.equal(result.redirect,value===null?'/confirmar':undefined)
})
test('private RSVP middleware disables shared caching and referrer forwarding',async()=>{
  const module=await loadModule('src/middleware.js',{imports:{
    'astro:middleware':{defineMiddleware:fn=>fn},'./lib/adminAuth.js':{isAdminUser:async()=>false},
    './lib/supabaseAuthServer.js':{createSupabaseAuthServerClient:()=>{throw new Error('Not admin')}}}})
  const response=await module.onRequest({url:new URL('https://local.invalid/pago/exitoso')},async()=>new Response('generic'))
  assert.equal(response.headers.get('cache-control'),'private, no-store')
  assert.equal(response.headers.get('referrer-policy'),'no-referrer')
})
test('admin without session redirects to login',async()=>{
  const module=await loadModule('src/middleware.js',{imports:{
    'astro:middleware':{defineMiddleware:fn=>fn},'./lib/adminAuth.js':{isAdminUser:async()=>false},
    './lib/supabaseAuthServer.js':{createSupabaseAuthServerClient:()=>({auth:{getUser:async()=>({data:{user:null}})}})}}})
  const response=await module.onRequest({url:new URL('https://local.invalid/admin'),request:new Request('https://local.invalid/admin'),cookies:{},
    redirect:(location,status)=>new Response(null,{status,headers:{Location:location}})},async()=>{throw new Error('Private admin rendered')})
  assert.equal(response.status,303)
  assert.equal(response.headers.get('location'),'/admin/login')
})

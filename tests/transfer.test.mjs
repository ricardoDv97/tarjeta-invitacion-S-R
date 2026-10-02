import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers/modules.mjs'
import { hashManagementToken, managementCookieName } from '../src/lib/registrationManagement.js'
const id='11111111-1111-4111-8111-111111111111', token='a'.repeat(64)
async function reporting({authorized=true,outcome='reported',rpcError=false}={}) {
  let calls=0,args
  const module=await loadModule('src/lib/transferPayment.js',{imports:{
    './registrationManagement.js':{authorizeRegistration:async()=>({status:authorized?200:403,client:{rpc:async(name,parameters)=>{calls++;args={name,parameters};return {data:[{outcome,result_payment_reported_at:'2026-10-02T12:00:00Z'}],error:rpcError?{}:null}}}}),managementTokenHash:()=>hashManagementToken(token)},
    './supabaseServer.js':{getSupabaseServerClient:()=>{throw Error('unexpected client')}},
  }})
  const send=(body='')=>module.transferOperation({params:{id},request:new Request('https://local.invalid/reported',{method:'POST',body,headers:{Cookie:managementCookieName(id)+'='+token}})},true)
  return {send,metrics:()=>({calls,args})}
}
test('reporting yes records only pending declaration with server token hash',async()=>{
  const f=await reporting(),r=await f.send(),body=await r.json()
  assert.equal(r.status,200);assert.equal(body.paymentStatus,'pending');assert.equal(body.attendanceStatus,'pending');assert.ok(body.paymentReportedAt)
  assert.equal(f.metrics().args.name,'report_transfer_payment')
  assert.deepEqual(f.metrics().args.parameters,{target_registration_id:id,target_token_hash:hashManagementToken(token)})
})
test('reporting retry is idempotent outcome',async()=>assert.equal((await (await reporting({outcome:'already_reported'})).send()).status,200))
test('unauthorized reporting does not call RPC',async()=>{const f=await reporting({authorized:false});assert.equal((await f.send()).status,403);assert.equal(f.metrics().calls,0)})
for(const outcome of ['invalid_status','wrong_payment_method','incomplete_guests','already_approved','inconsistent_payment','payment_disabled'])test('report fails closed: '+outcome,async()=>assert.equal((await(await reporting({outcome})).send()).status,409))
test('RPC authorization failure returns 403',async()=>assert.equal((await(await reporting({outcome:'unauthorized'})).send()).status,403))
test('reporting rejects client states, amount or timestamp',async()=>{const f=await reporting();assert.equal((await f.send(JSON.stringify({payment_status:'approved',payment_reported_at:'yesterday'}))).status,400);assert.equal(f.metrics().calls,0)})
test('reporting RPC error is generic without private details',async()=>{const r=await(await reporting({rpcError:true})).send();assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/token|secret|SQL/)})
for(const authorized of [false,true])test('admin transfer approval authorization '+authorized,async()=>{
  let calls=0
  const module=await loadModule('src/pages/api/admin/registrations/[id]/transfer/approve.js',{imports:{
    '../../../../../../lib/adminAuth.js':{isSameOriginRequest:()=>true,requireAdmin:async()=>({authorized})},
    '../../../../../../lib/supabaseServer.js':{getSupabaseServerClient:()=>({rpc:async(name)=>{assert.equal(name,'approve_transfer_payment');calls++;return{data:[{outcome:'approved'}],error:null}}})},
  }})
  const r=await module.POST({request:new Request('https://local.invalid/admin',{method:'POST'}),params:{id},cookies:{}})
  assert.equal(r.status,authorized?200:401);assert.equal(calls,authorized?1:0)
})
test('admin transfer approval rejects foreign Origin before auth and RPC',async()=>{
 const m=await loadModule('src/pages/api/admin/registrations/[id]/transfer/approve.js',{imports:{
  '../../../../../../lib/adminAuth.js':{isSameOriginRequest:()=>false,requireAdmin:()=>{throw Error('unexpected auth')}},
  '../../../../../../lib/supabaseServer.js':{getSupabaseServerClient:()=>{throw Error('unexpected DB')}},
 }})
 assert.equal((await m.POST({request:new Request('https://local.invalid/admin',{method:'POST'}),params:{id},cookies:{}})).status,403)
})

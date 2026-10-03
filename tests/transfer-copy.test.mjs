import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {wedding} from '../src/config/wedding.js'
const expected='¡Gracias por confirmarnos tu asistencia! Estamos muy felices de que seas parte de este día tan especial.'
async function ui(reported=false){
 class Element {constructor(){this.textContent='';this.hidden=false;this.disabled=false;this.listeners={}}addEventListener(n,f){this.listeners[n]=f}focus(){}getClientRects(){return[{}]}}
 class Dialog extends Element {showModal(){this.open=true}close(){this.open=false}}
 const nodes=new Map(),get=s=>{if(!nodes.has(s))nodes.set(s,s==='#transfer-dialog'?new Dialog():new Element());return nodes.get(s)}
 get('#transfer-alias').textContent=wedding.payment.transfer.alias
 const calls=[],backend={paymentStatus:'pending',attendanceStatus:'pending',paymentReportedAt:reported?'2026-10-03T00:00:00Z':null,totalAmount:35000}
 const source=await readFile(new URL('../src/scripts/transferPayment.js',import.meta.url),'utf8')
 runInNewContext(source.replace('export function','function')+'\ninitializeTransferPayment()',{HTMLDialogElement:Dialog,document:{querySelector:get,querySelectorAll:()=>[get('[data-transfer-amount]')]},window:{location:{search:'?registration=11111111-1111-4111-8111-111111111111'}},URLSearchParams,Intl,navigator:{clipboard:{writeText:async text=>{calls.push({clipboard:text})}}},fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith('/payment-reported'))backend.paymentReportedAt='2026-10-03T00:00:00Z';return{ok:true,json:async()=>({...backend,ok:true})}}})
 await new Promise(r=>setImmediate(r));return{get,calls,backend}
}
test('contribution removes unwanted copy but preserves title, amount and transfer action',async()=>{
 const page=await readFile(new URL('../src/pages/pago/transferencia.astro',import.meta.url),'utf8'),script=await readFile(new URL('../src/scripts/transferPayment.js',import.meta.url),'utf8')
 assert.doesNotMatch(page+script,/Guardamos los datos de tus invitados\.|Tu confirmación quedará pendiente hasta verificar el pago\./)
 assert.match(page,/Tu contribución/);assert.match(page,/Total:.*data-transfer-amount/);assert.match(page,/id="open-transfer"[^>]*>Transferencia/);assert.match(page,/Volver a la invitación/)
 const u=await ui();assert.match(u.get('[data-transfer-amount]').textContent,/35\.000/);assert.equal(u.get('#transfer-state').textContent,'')
})
test('yes displays exact warm copy and only reports a pending payment',async()=>{
 const u=await ui();await u.get('#transfer-yes').listeners.click()
 assert.equal(u.get('#transfer-result').textContent,expected);assert.equal(u.get('#transfer-result').hidden,false);assert.equal(u.get('#transfer-finish').hidden,false)
 assert.equal(u.backend.paymentStatus,'pending');assert.equal(u.backend.attendanceStatus,'pending');assert.ok(u.backend.paymentReportedAt)
 assert.equal(u.calls.length,2);assert.ok(u.calls[1].url.endsWith('/payment-reported'));assert.equal(u.calls[1].options.method,'POST');assert.equal(u.calls[1].options.body,undefined)
 assert.ok(u.calls.every(c=>!c.url.includes('/approve')))
})
test('reported reload preserves exact copy; no does not write; alias copied unchanged',async()=>{
 const u=await ui(true);assert.equal(u.get('#transfer-result').textContent,expected)
 const n=await ui();n.get('#transfer-no').listeners.click();assert.equal(n.calls.length,1);assert.equal(n.backend.paymentReportedAt,null);assert.equal(n.get('#transfer-result').textContent,'Podés realizar la transferencia cuando quieras.')
 await n.get('#copy-alias').listeners.click();assert.equal(n.calls.at(-1).clipboard,'ricardo.mpsyr');assert.equal(n.get('#copy-status').textContent,'Alias copiado')
})

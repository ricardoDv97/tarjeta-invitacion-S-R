import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers/modules.mjs'
for (const route of ['src/pages/api/webhooks/mercadopago.js','src/pages/api/registrations/[id]/mercadopago.js']) {
  for (const method of ['GET','POST','PUT','DELETE']) test('retired '+route+' '+method+' cannot access provider or DB',async()=>{
    const module=await loadModule(route)
    assert.equal(module.POST,undefined)
    const response=module.ALL({request:new Request('https://local.invalid/retired',{method})})
    assert.equal(response.status,410)
    assert.equal(response.headers.get('cache-control'),'no-store')
    assert.doesNotMatch(await response.text(),/approved|checkoutUrl|token|preference_id/)
  })
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, basename, sep } from 'node:path'
import { AstroCookies } from '../../node_modules/astro/dist/core/cookies/cookies.js'
import { loadModule } from '../helpers/modules.mjs'
import { managementCookie, managementTokenHash, hashManagementToken } from '../../src/lib/registrationManagement.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('production SSR session is invisible to document.cookie, survives refresh and is removed at logout', { timeout: 60000 }, async () => {
  const module = await loadModule('src/lib/supabaseAuthServer.js', { env: { SSR:true,PROD:true,PUBLIC_SUPABASE_URL:'https://synthetic-auth.invalid',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public' } })
  const realFetch = globalThis.fetch
  let sequence = 0
  const user = {id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',email:'audit@example.invalid'}
  // SDK exchanges use synthetic responses only. The HTTP server is loopback.
  const authResponse = async url => {
    if (String(url).includes('/logout')) return new Response(null,{status:204})
    const token = [{alg:'HS256',typ:'JWT'},{sub:user.id,jti:String(++sequence),exp:Math.floor(Date.now()/1000)+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.synthetic'
    return new Response(JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user}),{headers:{'Content-Type':'application/json'}})
  }
  const server = createServer(async (req,res) => {
    const registrationId = '11111111-1111-4111-8111-111111111111'
    const managementToken = 'a'.repeat(64)
    if (req.url === '/rsvp-issue') {
      res.setHeader('Set-Cookie',managementCookie(registrationId,managementToken,new Request('https://localhost/rsvp-issue')))
      res.end('<!doctype html><html><body>RSVP cookie test</body></html>');return
    }
    if (['/api/registrations/tokencheck','/pago/tokencheck'].includes(req.url)) {
      const request = new Request('https://localhost'+req.url,{headers:{Cookie:req.headers.cookie??''}})
      res.setHeader('Content-Type','application/json')
      res.end(JSON.stringify({authorized:managementTokenHash(request,registrationId)===hashManagementToken(managementToken)}));return
    }
    if (req.url === '/session') { res.setHeader('Content-Type','application/json');res.end(JSON.stringify({hasSession:(req.headers.cookie??'').includes('auth-token')}));return }
    if (!['/login','/refresh','/logout'].includes(req.url)) { res.end('<!doctype html><html><body>Cookie test</body></html>');return }
    try {
      const request = new Request('https://localhost'+req.url,{headers:{Cookie:req.headers.cookie??''}})
      const cookies = new AstroCookies(request)
      globalThis.fetch = authResponse
      try {
        const auth = module.createSupabaseAuthServerClient(request,cookies).auth
        const result = req.url === '/login' ? await auth.signInWithPassword({email:user.email,password:'synthetic-password'})
          : req.url === '/refresh' ? await auth.refreshSession() : await auth.signOut()
        if(result.error)throw new Error('Synthetic auth failed')
      } finally { globalThis.fetch = realFetch }
      const headers = [...cookies.headers()]
      assert.ok(headers.length)
      assert.ok(headers.every(h=>/HttpOnly/i.test(h)&&/Secure/i.test(h)&&/SameSite=Lax/i.test(h)&&/Path=\//i.test(h)))
      res.setHeader('Set-Cookie',headers)
      res.setHeader('Content-Type','text/html')
      res.end('<!doctype html><html><body>Cookie test</body></html>')
    } catch { res.statusCode=500;res.end('Synthetic authentication test failed') }
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const profile = await mkdtemp(join(tmpdir(),'wedding-cookie-browser-'))
  const executable = process.env.TEST_BROWSER_BIN ?? (process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'chromium')
  const browser = spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`],{windowsHide:true,stdio:['ignore','ignore','pipe']})
  const browserClosed = new Promise(resolve => browser.once('close', resolve))
  let browserUrl, browserError, socket, nextId=0
  const pending = new Map()
  browser.on('error',error=>{browserError=error})
  browser.stderr.on('data',chunk=>{const match=String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match)browserUrl=match[1]})
  try {
    for(let i=0;i<80&&!browserUrl&&!browserError;i++)await sleep(100)
    if(browserError)throw browserError
    assert.ok(browserUrl,'Chrome must expose a local debugging socket')
    socket=new WebSocket(browserUrl)
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
    socket.onmessage=event=>{const m=JSON.parse(event.data);const job=pending.get(m.id);if(job){pending.delete(m.id);m.error?job.reject(new Error(m.error.message)):job.resolve(m.result)}}
    socket.onclose=()=>{for(const job of pending.values())job.reject(new Error('Browser closed'));pending.clear()}
    const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))})
    const {targetId}=await command('Target.createTarget',{url:'about:blank'})
    const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true})
    const send=(method,params)=>command(method,params,sessionId)
    await send('Page.enable');await send('Runtime.enable')
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails);return r.result.value}
    const navigate=async path=>{
      await send('Page.navigate',{url:origin+path})
      for(let i=0;i<100;i++){if(await evaluate(`location.pathname===${JSON.stringify(path)} && document.readyState==='complete'`))return;await sleep(50)}
      throw new Error('Browser navigation timed out')
    }
    await navigate('/login')
    assert.equal(await evaluate('document.cookie'),'')
    assert.equal(await evaluate("fetch('/session').then(r=>r.json()).then(r=>r.hasSession)"),true)
    let stored=(await send('Network.getCookies',{urls:[origin]})).cookies
    assert.ok(stored.length>0)
    assert.ok(stored.every(c=>c.httpOnly&&c.secure&&c.sameSite==='Lax'&&c.path==='/'))
    await navigate('/refresh')
    assert.equal(await evaluate('document.cookie'),'')
    assert.equal(await evaluate("fetch('/session').then(r=>r.json()).then(r=>r.hasSession)"),true)
    await navigate('/logout')
    stored=(await send('Network.getCookies',{urls:[origin]})).cookies
    assert.equal(stored.length,0)
    assert.equal(await evaluate("fetch('/session').then(r=>r.json()).then(r=>r.hasSession)"),false)
    await navigate('/rsvp-issue')
    assert.equal(await evaluate('document.cookie'),'')
    for (const path of ['/api/registrations/tokencheck','/pago/tokencheck']) {
      assert.equal(await evaluate(`fetch(${JSON.stringify(path)}).then(r=>r.json()).then(r=>r.authorized)`),true)
    }
    stored=(await send('Network.getCookies',{urls:[origin]})).cookies
    assert.ok(stored.every(c=>c.httpOnly&&c.secure&&c.sameSite==='Lax'&&c.path==='/'))
    await command('Browser.close')
  } finally {
    globalThis.fetch=realFetch
    socket?.close()
    await Promise.race([browserClosed, sleep(3000)])
    if (browser.exitCode === null && browser.signalCode === null) browser.kill()
    await Promise.race([browserClosed, sleep(3000)])
    server.closeAllConnections()
    await new Promise(resolve=>server.close(resolve))
    await sleep(400)
    const target=resolve(profile)
    if(!target.startsWith(resolve(tmpdir())+sep)||!basename(target).startsWith('wedding-cookie-browser-'))throw new Error('Unsafe browser cleanup path')
    await rm(target,{recursive:true,force:true,maxRetries:15,retryDelay:200})
  }
})

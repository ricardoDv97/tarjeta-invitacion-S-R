import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'

test('actual Astro HTTP routes, middleware, images and synthetic admin denial', { timeout: 120000 }, async () => {
  let authCalls = 0
  let unexpectedCalls = 0
  const auth = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/auth/v1/token?grant_type=password') {
      authCalls++
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'invalid_credentials', message: 'Synthetic invalid credentials' }))
    } else {
      unexpectedCalls++
      res.writeHead(500)
      res.end()
    }
  })
  await new Promise(resolve => auth.listen(0, '127.0.0.1', resolve))
  const envDir = await mkdtemp(join(tmpdir(), 'wedding-framework-env-'))
  const synthetic = {
    PUBLIC_SUPABASE_URL: `http://127.0.0.1:${auth.address().port}`,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public',
    SUPABASE_SECRET_KEY: 'synthetic-backend',
    MERCADOPAGO_ACCESS_TOKEN: 'synthetic-provider',
    MERCADOPAGO_ENVIRONMENT: 'test',
    MERCADOPAGO_WEBHOOK_SECRET: 'synthetic-webhook',
    PUBLIC_SITE_URL: 'https://example.invalid',
    ASTRO_TELEMETRY_DISABLED: '1',
  }
  const previous = Object.fromEntries(Object.keys(synthetic).map(key => [key, process.env[key]]))
  Object.assign(process.env, synthetic)
  let server
  try {
    const { dev } = await import('astro')
    server = await dev({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, vite: { envDir } })
    const origin = `http://127.0.0.1:${server.address.port}`
    const get = path => fetch(origin + path, { redirect: 'manual' })
    const id = '11111111-1111-4111-8111-111111111111'
    const home = await get('/')
    assert.equal(home.status, 200)
    const html = await home.text()
    assert.match(html, /<html[^>]*lang="es"/)
    const imagePath = html.match(/<img\b[^>]*\bsrc="([^"]+)"/)?.[1]
    assert.ok(imagePath, 'Invitation renders imported image')
    const image = await get(imagePath.replaceAll('&amp;', '&'))
    assert.equal(image.status, 200)
    assert.match(image.headers.get('content-type'), /^image\//)
    for (const path of ['/confirmar', '/admin/login', '/pago/pendiente', `/pago/exitoso?registration=${id}`]) {
      assert.equal((await get(path)).status, 200, path)
    }
    for (const [path, target] of [['/admin', '/admin/login'], [`/confirmar/invitados?registration=${id}`, '/confirmar']]) {
      const response = await get(path)
      assert.equal(response.status, 303, path)
      assert.equal(response.headers.get('location'), target)
      assert.match(response.headers.get('cache-control'), /no-store/)
    }
    assert.equal((await get(`/pago/efectivo?registration=${id}`)).status, 404)
    const state = await get(`/api/registrations/${id}`)
    assert.equal(state.status, 403)
    assert.equal(state.headers.get('referrer-policy'), 'no-referrer')
    for (const action of ['cash', 'mercadopago']) {
      const response = await fetch(`${origin}/api/registrations/${id}/${action}`, {
        method: 'POST', headers: { Origin: origin },
      })
      assert.equal(response.status, 403, action)
    }
    const login = await fetch(origin + '/api/admin/login', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'audit@example.invalid', password: 'synthetic-password' }),
    })
    assert.equal(login.status, 401)
    assert.equal(authCalls, 1)
    assert.equal(unexpectedCalls, 0, 'No database/provider requests allowed')
  } finally {
    await server?.stop()
    await new Promise(resolve => auth.close(resolve))
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    assert.equal(dirname(resolve(envDir)), resolve(tmpdir()))
    assert.ok(basename(envDir).startsWith('wedding-framework-env-'))
    await rm(envDir, { recursive: true, force: true })
  }
})

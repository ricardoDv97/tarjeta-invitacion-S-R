import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers/modules.mjs'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.invalid', aud: 'authenticated' }
let tokenSequence = 0
const jwt = () => [ { alg: 'HS256', typ: 'JWT' }, { sub: user.id, jti: String(++tokenSequence), exp: Math.floor(Date.now() / 1000) + 3600 } ].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.') + '.synthetic'
const session = () => ({ access_token: jwt(), refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user })

async function authFixture(production = true) {
  const cookies = new Map()
  const writes = []
  const jar = { set(name, value, options) { writes.push({ name, value, options }); if (options.maxAge === 0) cookies.delete(name); else cookies.set(name, value) } }
  const module = await loadModule('src/lib/supabaseAuthServer.js', { env: { PROD: production, PUBLIC_SUPABASE_URL: 'https://auth.example.invalid', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable' } })
  globalThis.fetch = async url => {
    const path = new URL(url).pathname
    if (path.endsWith('/logout')) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(path.endsWith('/user') ? user : session()), { headers: { 'Content-Type': 'application/json' } })
  }
  const client = () => module.createSupabaseAuthServerClient(new Request(`${production ? 'https' : 'http'}://localhost/admin`, { headers: { Cookie: [...cookies].map(([n,v]) => `${n}=${v}`).join('; ') } }), jar)
  return { client, writes }
}

function assertCookiePolicy(writes, secure = true) {
  assert.ok(writes.length > 0)
  for (const { options } of writes) {
    assert.equal(options.httpOnly, true)
    assert.equal(options.secure, secure)
    assert.equal(options.sameSite, 'lax')
    assert.equal(options.path, '/')
  }
}

test('production login session cookies are HttpOnly, Secure, Lax, Path=/', async () => {
  const f = await authFixture()
  const result = await f.client().auth.signInWithPassword({ email: user.email, password: 'synthetic-password' })
  assert.equal(result.error, null)
  assertCookiePolicy(f.writes)
})

test('SSR reads the session and refresh keeps secure cookie attributes', async () => {
  const f = await authFixture()
  await f.client().auth.signInWithPassword({ email: user.email, password: 'synthetic-password' })
  const auth = f.client().auth
  assert.equal((await auth.getUser()).data.user.id, user.id)
  f.writes.length = 0
  assert.equal((await auth.refreshSession()).error, null)
  assertCookiePolicy(f.writes)
})

test('logout deletes all sensitive cookies with the same attributes', async () => {
  const f = await authFixture()
  await f.client().auth.signInWithPassword({ email: user.email, password: 'synthetic-password' })
  const auth = f.client().auth
  f.writes.length = 0
  await auth.signOut()
  assertCookiePolicy(f.writes)
  assert.ok(f.writes.every(w => w.options.maxAge === 0 && w.value === ''))
})

test('HTTP development can retain a server-only session', async () => {
  const f = await authFixture(false)
  await f.client().auth.signInWithPassword({ email: user.email, password: 'synthetic-password' })
  assertCookiePolicy(f.writes, false)
})

async function login({ valid = false, allowlisted = false } = {}) {
  let signedOut = false
  const endpoint = await loadModule('src/pages/api/admin/login.js', { imports: {
    '../../../lib/adminAuth.js': { isSameOriginRequest: () => true, isAdminUser: async () => allowlisted },
    '../../../lib/supabaseAuthServer.js': { createSupabaseAuthServerClient: () => ({ auth: {
      signInWithPassword: async () => ({ error: valid ? null : { message: 'private provider details' } }),
      getUser: async () => ({ data: { user }, error: null }),
      signOut: async () => { signedOut = true },
    } }) },
  } })
  const response = await endpoint.POST({ request: new Request('https://audit.invalid/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'synthetic-password' }) }), cookies: {} })
  return { response, signedOut }
}

test('false login returns generic 401', async () => {
  const { response } = await login()
  assert.equal(response.status, 401)
  assert.equal((await response.json()).message, 'No fue posible iniciar sesión.')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})
test('authenticated user outside allowlist cannot login', async () => {
  const { response, signedOut } = await login({ valid: true })
  assert.equal(response.status, 401)
  assert.equal(signedOut, true)
})
test('allowlisted user can login', async () => {
  assert.equal((await login({ valid: true, allowlisted: true })).response.status, 200)
})

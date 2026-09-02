import { isAdminUser, isSameOriginRequest } from '../../../lib/adminAuth.js'
import { createSupabaseAuthServerClient } from '../../../lib/supabaseAuthServer.js'

export const prerender = false

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
const reply = (body, status) => new Response(JSON.stringify(body), { status, headers })
const genericError = (status = 401) => reply({ ok: false, message: 'No fue posible iniciar sesión.' }, status)

export async function POST({ request, cookies }) {
  if (!isSameOriginRequest(request)) return genericError(403)

  const contentType = request.headers.get('content-type') ?? ''
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (!contentType.toLowerCase().startsWith('application/json')) return genericError(400)
  if (Number.isFinite(contentLength) && contentLength > 4096) return genericError(400)

  let payload
  try {
    payload = await request.json()
  } catch {
    return genericError(400)
  }

  const email = typeof payload?.email === 'string' ? payload.email.trim() : ''
  const password = typeof payload?.password === 'string' ? payload.password : ''
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
  if (!validEmail || password.length < 8 || password.length > 1024) return genericError(400)

  try {
    const supabase = createSupabaseAuthServerClient(request, cookies)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) return genericError()

    const { data, error: userError } = await supabase.auth.getUser()
    const authorized = !userError && data.user && await isAdminUser(data.user.id)
    if (!authorized) {
      await supabase.auth.signOut()
      return genericError()
    }

    return reply({ ok: true }, 200)
  } catch {
    return genericError(503)
  }
}

export function ALL() {
  return new Response(JSON.stringify({ ok: false, message: 'Método no permitido.' }), {
    status: 405,
    headers: { ...headers, Allow: 'POST' },
  })
}

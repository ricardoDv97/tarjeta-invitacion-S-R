import { isSameOriginRequest, requireAdmin } from '../../../../../../lib/adminAuth.js'
import { getSupabaseServerClient } from '../../../../../../lib/supabaseServer.js'

export const prerender = false
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
const reply = (body, status) => new Response(JSON.stringify(body), { status, headers })

export async function POST({ request, cookies, params }) {
  if (!isSameOriginRequest(request)) return reply({ ok: false, message: 'Solicitud no permitida.' }, 403)
  const admin = await requireAdmin(request, cookies)
  if (!admin.authorized) return reply({ ok: false, message: 'No autorizado.' }, 401)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id ?? '')) {
    return reply({ ok: false, message: 'Solicitud inválida.' }, 400)
  }

  try {
    const { data, error } = await getSupabaseServerClient().rpc('approve_cash_payment', { target_registration_id: params.id })
    if (error) return reply({ ok: false, message: 'No fue posible completar la operación.' }, 409)
    const result = Array.isArray(data) ? data[0] : data
    if (result?.outcome === 'approved' || result?.outcome === 'already_applied') return reply({ ok: true, outcome: result.outcome }, 200)
    return reply({ ok: false, message: 'No fue posible completar la operación.' }, 409)
  } catch {
    return reply({ ok: false, message: 'No fue posible completar la operación.' }, 503)
  }
}

export function ALL() {
  return new Response(JSON.stringify({ ok: false, message: 'Método no permitido.' }), { status: 405, headers: { ...headers, Allow: 'POST' } })
}

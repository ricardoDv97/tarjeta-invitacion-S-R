import { authorizeRegistration, managementTokenHash } from './registrationManagement.js'
import { getSupabaseServerClient } from './supabaseServer.js'
import { isValidUuid } from './validation.js'
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const json = (body, status) => new Response(JSON.stringify(body), { status, headers })
export async function transferOperation({ params, request }, report = false) {
  if (!isValidUuid(params.id)) return json({ ok: false, message: 'La referencia no es válida.' }, 400)
  const size = Number(request.headers.get('content-length') ?? 0)
  if (size > 2048) return json({ ok: false, message: 'Solicitud inválida.' }, 400)
  try {
    if ((await request.text()).trim()) return json({ ok: false, message: 'Esta solicitud no admite datos enviados por el navegador.' }, 400)
    const authorization = await authorizeRegistration({ request, id: params.id, getClient: getSupabaseServerClient })
    if (authorization.status !== 200) return json({ ok: false, message: 'No pudimos autorizar esta inscripción.' }, authorization.status)
    const { data, error } = await authorization.client.rpc(report ? 'report_transfer_payment' : 'prepare_transfer_payment', {
      target_registration_id: params.id,
      target_token_hash: managementTokenHash(request, params.id),
    })
    if (error || !data?.[0]) return json({ ok: false, message: 'No pudimos consultar la transferencia. Intentá nuevamente.' }, 503)
    const result = data[0]
    const allowed = report ? ['reported', 'already_reported'] : ['ready', 'already_approved']
    if (!allowed.includes(result.outcome)) return json({ ok: false, message: 'La inscripción no está disponible para esta operación.' }, result.outcome === 'unauthorized' ? 403 : 409)
    return json({ ok: true, paymentReportedAt: result.result_payment_reported_at ?? null,
      ...(report ? { paymentStatus: 'pending', attendanceStatus: 'pending' } : {
        paymentStatus: result.result_payment_status, attendanceStatus: result.result_attendance_status, totalAmount: result.result_amount,
      }) }, 200)
  } catch { return json({ ok: false, message: 'El servicio no está disponible temporalmente.' }, 503) }
}
export function transferMethodNotAllowed() {
  return new Response(JSON.stringify({ ok: false, message: 'Método no permitido.' }), { status: 405, headers: { ...headers, Allow: 'POST' } })
}

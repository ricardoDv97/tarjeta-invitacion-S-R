import { getSupabaseServerClient } from '../../../../lib/supabaseServer.js'
import { isValidUuid } from '../../../../lib/validation.js'

export const prerender = false

const json = (body, status, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
})

const failures = {
  not_found: [404, 'La inscripción no existe.'],
  wrong_payment_method: [409, 'La inscripción no utiliza pago en efectivo.'],
  invalid_registration: [409, 'La inscripción no tiene datos válidos.'],
  incomplete_guests: [409, 'Falta completar los datos de los invitados.'],
  invalid_status: [409, 'La inscripción no está disponible para confirmar.'],
  inconsistent_existing_payment: [409, 'El pago existente requiere revisión.'],
}

export async function POST({ params, request }) {
  if (!isValidUuid(params.id)) return json({ ok: false, message: 'La referencia no es válida.' }, 400)
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 2048) {
    return json({ ok: false, message: 'La solicitud es demasiado grande.' }, 400)
  }
  const body = await request.text()
  if (body.trim()) return json({ ok: false, message: 'Esta solicitud no admite datos enviados por el navegador.' }, 400)

  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.rpc('confirm_cash_payment', { target_registration_id: params.id })
    if (error) return json({ ok: false, message: 'No pudimos confirmar el pago en efectivo.' }, 500)
    const result = data?.[0]
    if (!result) return json({ ok: false, message: 'No pudimos confirmar la inscripción.' }, 500)
    if (result.outcome !== 'ok') {
      const [status, message] = failures[result.outcome] ?? [409, 'La inscripción no puede confirmarse.']
      return json({ ok: false, message }, status)
    }
    return json({
      ok: true,
      paymentStatus: result.result_payment_status,
      attendanceStatus: result.result_attendance_status,
      nextStep: result.result_payment_status === 'approved' ? 'cash-zero' : 'cash-pending',
    }, 200)
  } catch {
    return json({ ok: false, message: 'El servicio no está disponible temporalmente.' }, 500)
  }
}

export function ALL() {
  return json({ ok: false, message: 'Método no permitido.' }, 405, { Allow: 'POST' })
}

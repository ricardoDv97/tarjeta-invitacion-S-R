import { getSupabaseServerClient } from '../../../lib/supabaseServer.js'
import { isValidUuid } from '../../../lib/validation.js'
import { authorizeRegistration } from '../../../lib/registrationManagement.js'

export const prerender = false

const json = (body, status, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
})

export async function GET({ params, request }) {
  if (!isValidUuid(params.id)) return json({ ok: false, message: 'La referencia no es válida.' }, 400)

  try {
    const authorization = await authorizeRegistration({ request, id: params.id, getClient: getSupabaseServerClient,
      fields: 'id, guest_count, adult_count, child_count, young_child_count, payment_method, attendance_status' })
    if (authorization.status !== 200) return json({ ok: false, message: 'No pudimos autorizar esta inscripción.' }, authorization.status)
    const data = authorization.registration
    const coherent = data.adult_count + data.child_count + data.young_child_count === data.guest_count
    if (data.attendance_status !== 'pending' || !coherent) {
      return json({ ok: false, message: 'La inscripción no está disponible para cargar invitados.' }, 409)
    }

    return json({
      ok: true,
      registrationId: data.id,
      guestCount: data.guest_count,
      adultCount: data.adult_count,
      childCount: data.child_count,
      youngChildCount: data.young_child_count,
      paymentMethod: data.payment_method,
    }, 200)
  } catch {
    return json({ ok: false, message: 'El servicio no está disponible temporalmente.' }, 500)
  }
}

export function ALL() {
  return json({ ok: false, message: 'Método no permitido.' }, 405, { Allow: 'GET' })
}

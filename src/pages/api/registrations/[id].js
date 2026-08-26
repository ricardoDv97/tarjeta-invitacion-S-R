import { getSupabaseServerClient } from '../../../lib/supabaseServer.js'
import { isValidUuid } from '../../../lib/validation.js'

export const prerender = false

const json = (body, status, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
})

export async function GET({ params }) {
  if (!isValidUuid(params.id)) return json({ ok: false, message: 'La referencia no es válida.' }, 400)

  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('registrations')
      .select('id, guest_count, adult_count, child_count, young_child_count, payment_method, attendance_status')
      .eq('id', params.id)
      .maybeSingle()

    if (error) return json({ ok: false, message: 'No pudimos consultar la inscripción.' }, 500)
    if (!data) return json({ ok: false, message: 'La inscripción no existe.' }, 404)
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
